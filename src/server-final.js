const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

// In-memory log storage
const operationLogs = [];
const MAX_LOGS = 1000;

// Push history storage
const pushHistory = [];
const MAX_PUSH_HISTORY = 100;

// Changes tracking storage
const pendingChanges = [];
const MAX_PENDING_CHANGES = 50;

// Review status tracking
let changesReviewed = false;

// Get environment variables
const PROJECT_PATH = process.env.PROJECT_PATH || '';
const REMOTE_NAME = process.env.REMOTE_NAME || 'origin';
const LOCAL_BRANCH = process.env.LOCAL_BRANCH || '';
const REMOTE_BRANCH = process.env.REMOTE_BRANCH || '';
const GIT_PUSH_FLAGS = process.env.GIT_PUSH_FLAGS || '--progress';
const TOOL_PREFIX = process.env.TOOL_PREFIX || '';
const REPO_NAME = process.env.REPO_NAME || '';
const LANGUAGE = process.env.LANGUAGE || 'en'; // Default to English

// Proxy settings
const HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy || '';
const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy || '';
const ALL_PROXY = process.env.ALL_PROXY || process.env.all_proxy || '';
const SOCKS_PROXY = process.env.SOCKS_PROXY || process.env.socks_proxy || '';

// Validate required environment variables
if (!PROJECT_PATH || PROJECT_PATH.trim() === '') {
  console.error('ERROR: PROJECT_PATH environment variable is required but not set.');
  console.error('Please set PROJECT_PATH environment variable before starting the server.');
  console.error('Example: export PROJECT_PATH="/path/to/your/project"');
  process.exit(1);
}

if (!LOCAL_BRANCH || LOCAL_BRANCH.trim() === '') {
  console.error('ERROR: LOCAL_BRANCH environment variable is required but not set.');
  console.error('Please set LOCAL_BRANCH environment variable before starting the server.');
  console.error('Example: export LOCAL_BRANCH="main"');
  process.exit(1);
}

if (!REMOTE_BRANCH || REMOTE_BRANCH.trim() === '') {
  console.error('ERROR: REMOTE_BRANCH environment variable is required but not set.');
  console.error('Please set REMOTE_BRANCH environment variable before starting the server.');
  console.error('Example: export REMOTE_BRANCH="main"');
  process.exit(1);
}

// Get log directory and filename
const getLogConfig = () => {
  // Default log directory: .setting/ or .setting.<REPO_NAME>/
  let defaultLogDir = './.setting';
  if (REPO_NAME) {
    defaultLogDir = `./.setting.${REPO_NAME}`;
  }

  const logDir = process.env.MCP_LOG_DIR || defaultLogDir;
  const logFile = process.env.MCP_LOG_FILE || 'mcp-git.log';
  const pushHistoryFile = process.env.MCP_PUSH_HISTORY_FILE || 'push-history.json';
  const changesFile = process.env.MCP_CHANGES_FILE || 'pending-changes.json';
  return {
    dir: logDir,
    file: logFile,
    fullPath: path.join(logDir, logFile),
    pushHistoryFile: pushHistoryFile,
    pushHistoryFullPath: path.join(logDir, pushHistoryFile),
    changesFile: changesFile,
    changesFullPath: path.join(logDir, changesFile)
  };
};

// Ensure log directory exists
const ensureLogDir = () => {
  const { dir } = getLogConfig();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Log recording function - record all requests and responses
const logRequest = (method, params, result, error = null) => {
  const logEntry = {
    id: Date.now(),
    method,
    params: JSON.stringify(params),
    result: result ? JSON.stringify(result) : null,
    error: error ? error.toString() : null,
    created_at: new Date().toISOString()
  };

  operationLogs.unshift(logEntry);
  if (operationLogs.length > MAX_LOGS) {
    operationLogs.splice(MAX_LOGS);
  }

  // Record request and response data
  const logLine = `${logEntry.created_at} | ${method} | ${logEntry.params} | ${error || 'SUCCESS'} | RESPONSE: ${logEntry.result || 'null'}\n`;

  try {
    ensureLogDir();
    const { fullPath } = getLogConfig();
    fs.appendFileSync(fullPath, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write log file:', err.message);
  }
};

// Load push history from file
const loadPushHistory = () => {
  try {
    const { pushHistoryFullPath } = getLogConfig();
    if (fs.existsSync(pushHistoryFullPath)) {
      const data = fs.readFileSync(pushHistoryFullPath, 'utf8');
      const history = JSON.parse(data);
      pushHistory.length = 0;
      pushHistory.push(...history);
    }
  } catch (err) {
    console.error('Failed to load push history:', err.message);
  }
};

// Save push history to file
const savePushHistory = () => {
  try {
    ensureLogDir();
    const { pushHistoryFullPath } = getLogConfig();
    fs.writeFileSync(pushHistoryFullPath, JSON.stringify(pushHistory, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save push history:', err.message);
  }
};

// Record push history
const recordPushHistory = (message, result, error = null) => {
  const pushEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    repo_name: REPO_NAME,
    project_path: PROJECT_PATH,
    remote_name: REMOTE_NAME,
    local_branch: LOCAL_BRANCH,
    remote_branch: REMOTE_BRANCH,
    message: message,
    success: !error,
    error: error ? error.toString() : null,
    exit_code: result ? result.exitCode : null
  };

  pushHistory.unshift(pushEntry);
  if (pushHistory.length > MAX_PUSH_HISTORY) {
    pushHistory.splice(MAX_PUSH_HISTORY);
  }

  savePushHistory();
};

// Load push history on startup
loadPushHistory();

// Load pending changes from file
const loadPendingChanges = () => {
  try {
    const { changesFullPath } = getLogConfig();
    if (fs.existsSync(changesFullPath)) {
      const data = fs.readFileSync(changesFullPath, 'utf8');
      const changes = JSON.parse(data);
      pendingChanges.length = 0;
      pendingChanges.push(...changes);
    }
  } catch (err) {
    console.error('Failed to load pending changes:', err.message);
  }
};

// Save pending changes to file
const savePendingChanges = () => {
  try {
    ensureLogDir();
    const { changesFullPath } = getLogConfig();
    fs.writeFileSync(changesFullPath, JSON.stringify(pendingChanges, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save pending changes:', err.message);
  }
};

// Clear all pending changes
const clearPendingChanges = () => {
  pendingChanges.length = 0;
  savePendingChanges();
};

// Load pending changes on startup
loadPendingChanges();

// Execute git push command is now handled by FinalMCPServer.executeGitCommand


// Final MCP Server
class FinalMCPServer {
  constructor() {
    this.name = 'mcp-git-server';
    this.version = '1.0.0';
    this.initialized = false;
  }

  // Execute git push
  async git_push(params) {
    const { message } = params;

    if (!message || typeof message !== 'string') {
      throw new Error('Missing message parameter');
    }

    // Check if changes have been reviewed
    if (!changesReviewed && pendingChanges.length > 0) {
      // Get the actual tool name (with prefix if TOOL_PREFIX is set)
      const getPendingChangesToolName = TOOL_PREFIX ? `${TOOL_PREFIX}_get_pending_changes` : 'get_pending_changes';

      // Return JSON-RPC 2.0 compliant result with multiple prompt messages
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ ERROR: You must review pending changes before pushing code.'
          },
          {
            type: 'text',
            text: `🔧 REQUIRED ACTION: You must call the review tool before pushing.`
          },
          {
            type: 'text',
            text: `📋 TOOL NAME: "${getPendingChangesToolName}" - Use this tool to review pending changes.`
          },
          {
            type: 'text',
            text: `📝 TOOL CALL EXAMPLE: Call tools/call with name="${getPendingChangesToolName}" and empty arguments: {"name": "${getPendingChangesToolName}", "arguments": {}}`
          },
          {
            type: 'text',
            text: `📊 STEP 1: Call "${getPendingChangesToolName}" tool to review all pending changes.`
          },
          {
            type: 'text',
            text: `✅ STEP 2: After reviewing, you can then call git_push tool to proceed with the push.`
          },
          {
            type: 'text',
            text: `⚠️ IMPORTANT: The review status will be reset after push attempt. You may need to review again for subsequent pushes.`
          },
          {
            type: 'text',
            text: `📈 Current pending changes: ${pendingChanges.length} change(s).`
          }
        ],
        isError: true,
        errorCode: 'CHANGES_NOT_REVIEWED'
      };
    }

    try {
      // Auto-add and commit changes before push
      console.error('Auto-adding and committing changes before push...');

      // Check if there are already staged changes
      try {
        const statusResult = await this.executeGitCommand(['status', '--porcelain'], 'git_status_check');
        const hasStagedChanges = statusResult.stdout.split('\n').some(line => line.startsWith('A ') || line.startsWith('M ') || line.startsWith('D '));

        if (!hasStagedChanges) {
          // git add . only if no staged changes, with longer timeout for large repos
          await this.executeGitCommand(['add', '.'], 'git_add_auto', 60000); // 60 second timeout
          console.error('✓ Changes added to staging area');
        } else {
          console.error('✓ Staged changes already exist, skipping git add');
        }
      } catch (statusErr) {
        console.error('Warning: git status check failed, proceeding with git add:', statusErr.message);
        // If status check fails, still try to add
        try {
          await this.executeGitCommand(['add', '.'], 'git_add_auto');
          console.error('✓ Changes added to staging area');
        } catch (addErr) {
          console.error('Warning: git add failed, but continuing with push:', addErr.message);
        }
      }

      // git commit
      try {
        await this.executeGitCommand(['commit', '-m', message], 'git_commit_auto');
        console.error('✓ Changes committed');
      } catch (commitErr) {
        // If commit fails because "nothing to commit", that's OK for push
        if (commitErr.stderr && commitErr.stderr.includes('nothing to commit')) {
          console.error('✓ No changes to commit, proceeding with push');
        } else {
          console.error('Warning: git commit failed, but continuing with push:', commitErr.message);
        }
      }

      // Build git push command arguments
      const pushFlags = GIT_PUSH_FLAGS.trim() ? GIT_PUSH_FLAGS.trim().split(/\s+/) : [];
      const pushArgs = ['push', REMOTE_NAME, `${LOCAL_BRANCH}:${REMOTE_BRANCH}`].concat(pushFlags);
      
      // Execute push with a longer timeout (5 minutes)
      const result = await this.executeGitCommand(pushArgs, 'git_push_final', 300000);

      // Log operation
      logRequest('git_push', {
        repo_name: REPO_NAME,
        project_path: PROJECT_PATH,
        remote_name: REMOTE_NAME,
        local_branch: LOCAL_BRANCH,
        remote_branch: REMOTE_BRANCH,
        git_push_flags: GIT_PUSH_FLAGS,
        message
      }, result);

      // Record push history
      recordPushHistory(message, result, null);

      // Clear all pending changes after successful push
      clearPendingChanges();

      // Reset review status after successful push
      changesReviewed = false;

      return {
        success: true,
        repo_name: REPO_NAME,
        project_path: PROJECT_PATH,
        remote_name: REMOTE_NAME,
        local_branch: LOCAL_BRANCH,
        remote_branch: REMOTE_BRANCH,
        git_push_flags: GIT_PUSH_FLAGS,
        message: message,
        cleared_changes: pendingChanges.length,
        review_status_reset: true,
        output: result.stdout,
        error_output: result.stderr,
        exit_code: result.exitCode
      };
    } catch (err) {
      // Reset review status even on push failure
      changesReviewed = false;

      // Log operation error
      logRequest('git_push', {
        repo_name: REPO_NAME,
        project_path: PROJECT_PATH,
        remote_name: REMOTE_NAME,
        local_branch: LOCAL_BRANCH,
        remote_branch: REMOTE_BRANCH,
        git_push_flags: GIT_PUSH_FLAGS,
        message
      }, null, err.error || err.message);

      // Record push history even on error
      recordPushHistory(message, null, err.error || err.message);

      throw new Error(`Git push failed: ${err.error || err.message}`);
    }
  }

  // Get push history (last 5 records)
  async get_push_history(params) {
    // Return last 5 push records
    const last5Records = pushHistory.slice(0, 5);

    return {
      total: pushHistory.length,
      records: last5Records,
      message: last5Records.length > 0
        ? `Found ${last5Records.length} recent push record(s). Please review them to ensure your current changes have not been pushed before. After reviewing, you can proceed with git_push.`
        : 'No push history found. This appears to be the first push. You can now proceed with git_push.'
    };
  }

  // Get operation logs
  async get_operation_logs(params) {
    const { limit = 50, offset = 0 } = params || {};

    // Validate parameters
    if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
      throw new Error('limit parameter must be between 1-1000');
    }

    if (typeof offset !== 'number' || offset < 0) {
      throw new Error('offset parameter must be greater than or equal to 0');
    }

    // Return logs from memory
    const logs = operationLogs.slice(offset, offset + limit);

    return {
      logs: logs,
      total: operationLogs.length,
      limit: limit,
      offset: offset,
      hasMore: offset + limit < operationLogs.length
    };
  }

  // Save pending changes
  async save_changes(params) {
    const { files, content } = params;

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('files parameter must be a non-empty array');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('content parameter must be a non-empty string');
    }

    // Validate files array contains strings
    if (!files.every(file => typeof file === 'string' && file.trim())) {
      throw new Error('all files must be non-empty strings');
    }

    // Create change entry
    const changeEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      repo_name: REPO_NAME,
      project_path: PROJECT_PATH,
      files: files.map(f => f.trim()),
      content: content.trim(),
      reviewed: false
    };

    // Add to pending changes
    pendingChanges.unshift(changeEntry);
    if (pendingChanges.length > MAX_PENDING_CHANGES) {
      pendingChanges.splice(MAX_PENDING_CHANGES);
    }

    // Save to file
    savePendingChanges();

    // Log operation
    logRequest('save_changes', {
      files: files,
      content_length: content.length,
      change_id: changeEntry.id
    }, { success: true });

    return {
      success: true,
      change_id: changeEntry.id,
      message: `Successfully saved ${files.length} file changes. Total pending changes: ${pendingChanges.length}`,
      files_count: files.length,
      content_length: content.length
    };
  }

  // Get pending changes
  async get_pending_changes(params) {
    const { limit = 1000, offset = 0 } = params || {};

    // Validate parameters
    if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
      throw new Error('limit parameter must be between 1-1000');
    }

    if (typeof offset !== 'number' || offset < 0) {
      throw new Error('offset parameter must be greater than or equal to 0');
    }

    // Mark changes as reviewed
    changesReviewed = true;

    // Log operation
    logRequest('get_pending_changes', {
      limit: limit,
      offset: offset,
      total_changes: pendingChanges.length
    }, { success: true });

    // Return pending changes
    const changes = pendingChanges.slice(offset, offset + limit);

    return {
      changes: changes,
      total: pendingChanges.length,
      limit: limit,
      offset: offset,
      hasMore: offset + limit < pendingChanges.length,
      message: pendingChanges.length > 0
        ? `Found ${pendingChanges.length} pending change(s). Changes have been marked as reviewed. You can now proceed with git_push.`
        : 'No pending changes found.'
    };
  }

  // Execute git status
  async git_status(params) {
    try {
      const result = await this.executeGitCommand(['status', '--porcelain'], 'git_status');
      return {
        success: true,
        status: result.stdout.trim(),
        has_changes: result.stdout.trim().length > 0,
        message: result.stdout.trim().length > 0
          ? 'Working directory has uncommitted changes'
          : 'Working directory is clean'
      };
    } catch (err) {
      throw new Error(`Git status failed: ${err.error || err.message}`);
    }
  }

  // Execute git diff
  async git_diff(params) {
    const { staged = false, files = [] } = params || {};

    try {
      const args = ['diff'];
      if (staged) {
        args.push('--cached');
      }
      if (files && files.length > 0) {
        args.push('--', ...files);
      }

      const result = await this.executeGitCommand(args, 'git_diff');
      return {
        success: true,
        diff: result.stdout,
        has_changes: result.stdout.trim().length > 0,
        staged: staged,
        files: files || []
      };
    } catch (err) {
      throw new Error(`Git diff failed: ${err.error || err.message}`);
    }
  }

  // Execute git add
  async git_add(params) {
    const { files = ['.'] } = params || {};

    try {
      const args = ['add', ...files];
      const result = await this.executeGitCommand(args, 'git_add');

      return {
        success: true,
        files_added: files,
        output: result.stdout,
        message: `Successfully added ${files.length} file(s) to staging area`
      };
    } catch (err) {
      throw new Error(`Git add failed: ${err.error || err.message}`);
    }
  }

  // Execute git log
  async git_log(params) {
    const { limit = 10, oneline = false } = params || {};

    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw new Error('limit parameter must be between 1-100');
    }

    try {
      const args = ['log', `--max-count=${limit}`];
      if (oneline) {
        args.push('--oneline');
      } else {
        args.push('--pretty=format:%H|%an|%ae|%ad|%s', '--date=short');
      }

      const result = await this.executeGitCommand(args, 'git_log');

      const commits = result.stdout.trim().split('\n').filter(line => line.trim()).map(line => {
        if (oneline) {
          const match = line.match(/^(\w+)\s+(.+)$/);
          return match ? { hash: match[1], message: match[2] } : { hash: '', message: line };
        } else {
          const parts = line.split('|');
          return {
            hash: parts[0] || '',
            author: parts[1] || '',
            email: parts[2] || '',
            date: parts[3] || '',
            message: parts[4] || ''
          };
        }
      });

      return {
        success: true,
        commits: commits,
        total: commits.length,
        oneline: oneline
      };
    } catch (err) {
      throw new Error(`Git log failed: ${err.error || err.message}`);
    }
  }

  // Execute git command helper
  async executeGitCommand(args, operation, timeout = 30000) { // 30 second default timeout
    return new Promise((resolve, reject) => {
      const command = 'git';

      console.error(`Executing: cd ${PROJECT_PATH} && ${command} ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`);

      // Prepare environment variables including proxy settings
      const env = { ...process.env };

      // Apply proxy settings if configured
      if (HTTP_PROXY) env.HTTP_PROXY = HTTP_PROXY;
      if (HTTPS_PROXY) env.HTTPS_PROXY = HTTPS_PROXY;
      if (NO_PROXY) env.NO_PROXY = NO_PROXY;
      if (ALL_PROXY) env.ALL_PROXY = ALL_PROXY;
      if (SOCKS_PROXY) env.SOCKS_PROXY = SOCKS_PROXY;

      // Also set lowercase versions (some tools prefer these)
      if (HTTP_PROXY) env.http_proxy = HTTP_PROXY;
      if (HTTPS_PROXY) env.https_proxy = HTTPS_PROXY;
      if (NO_PROXY) env.no_proxy = NO_PROXY;
      if (ALL_PROXY) env.all_proxy = ALL_PROXY;
      if (SOCKS_PROXY) env.socks_proxy = SOCKS_PROXY;

      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        cwd: PROJECT_PATH,
        env: env
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        console.error(`Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`);
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.error(output);
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(output);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId); // Clear timeout on completion
        if (code === 0) {
          resolve({
            success: true,
            stdout: stdout,
            stderr: stderr,
            exitCode: code
          });
        } else {
          reject({
            success: false,
            stdout: stdout,
            stderr: stderr,
            exitCode: code,
            error: `Command exited with code ${code}`
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId); // Clear timeout on error
        reject({
          success: false,
          error: err.message,
          stdout: stdout,
          stderr: stderr
        });
      });
    });
  }

  // Handle JSON-RPC requests
  async handleRequest(request) {
    try {
      const { jsonrpc, id, method, params } = request;

      if (jsonrpc !== '2.0') {
        logRequest('Unsupported JSON-RPC version', { jsonrpc }, null, 'Unsupported JSON-RPC version');
        throw new Error('Unsupported JSON-RPC version');
      }


      let result = null;
      let error = null;

      try {
        if (method === 'initialize') {
          // If already initialized, return success but don't re-initialize
          if (!this.initialized) {
            this.initialized = true;

            // Record actual client information
            const clientInfo = params?.clientInfo || {};
            logRequest('initialize', {
              protocolVersion: params?.protocolVersion || '2025-06-18',
              capabilities: params?.capabilities || {},
              clientInfo: clientInfo
            }, null, null);
          }

          // Build server capabilities to match client capabilities
          const serverCapabilities = {
            tools: {
              listChanged: false
            }
          };

          // If client supports prompts, we also support it
          if (params?.capabilities?.prompts) {
            serverCapabilities.prompts = {
              listChanged: false
            };
          }

          // If client supports resources, we also support it
          if (params?.capabilities?.resources) {
            serverCapabilities.resources = {
              listChanged: false
            };
          }

          // If client supports logging, we also support it
          if (params?.capabilities?.logging) {
            serverCapabilities.logging = {
              listChanged: false
            };
          }

          // If client supports roots, we also support it
          if (params?.capabilities?.roots) {
            serverCapabilities.roots = {
              listChanged: false
            };
          }

          result = {
            protocolVersion: params?.protocolVersion || '2025-06-18',
            capabilities: serverCapabilities,
            serverInfo: {
              name: this.name,
              version: this.version
            }
          };
        } else if (method === 'tools/list') {
          // Build tool name with prefix
          const getToolName = (baseName) => {
            return TOOL_PREFIX ? `${TOOL_PREFIX}_${baseName}` : baseName;
          };

          // Build tool description with project information
          const getToolDescription = (baseDescription) => {
            let description = baseDescription;
            if (REPO_NAME) {
              description = `[${REPO_NAME}] ${description}`;
            }
            return description;
          };

          // Build tools array
          const tools = [
            {
              name: getToolName('git_push'),
              description: getToolDescription(`Execute git push command from "${LOCAL_BRANCH}" to "${REMOTE_NAME}/${REMOTE_BRANCH}" in project path "${PROJECT_PATH}".

Push command: git push ${REMOTE_NAME} ${LOCAL_BRANCH}:${REMOTE_BRANCH} --progress

⚠️ REQUIREMENT: You MUST call get_pending_changes to review changes before using this tool.

USAGE:
1. First call get_pending_changes to review pending changes
2. Then call this tool with the commit message parameter. Example:
{message: "${LANGUAGE === 'en' ? 'Update project files' : LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? '更新项目文件' : LANGUAGE === 'zh-TW' ? '更新專案檔案' : 'Update project files'}"}

Please provide the commit message in ${LANGUAGE === 'en' ? 'English' : LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? 'Chinese' : LANGUAGE === 'zh-TW' ? 'Traditional Chinese' : LANGUAGE} language.

NOTE: If the push result contains a branch merge URL (such as a pull request URL), please output it to the user. If you can open a browser, you may also automatically open the URL.

The review status is reset after each push attempt (success or failure).`),
              inputSchema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: `Commit message in ${LANGUAGE === 'en' ? 'English' : LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? 'Chinese' : LANGUAGE === 'zh-TW' ? 'Traditional Chinese' : LANGUAGE} language. Example: {message: "${LANGUAGE === 'en' ? 'Update project files' : LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? '更新项目文件' : LANGUAGE === 'zh-TW' ? '更新專案檔案' : 'Update project files'}"}`
                  }
                },
                required: ['message']
              }
            },
            {
              name: getToolName('get_push_history'),
              description: getToolDescription(`Get the last 5 push history records for the git repository. This tool should be called before using ${getToolName('git_push')} to ensure the current changes have not been pushed before.`),
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: getToolName('get_operation_logs'),
              description: getToolDescription('Get operation logs for debugging and monitoring purposes.'),
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description: 'Limit count, default 50'
                  },
                  offset: {
                    type: 'number',
                    description: 'Offset, default 0'
                  }
                }
              }
            },
            {
              name: getToolName('save_changes'),
              description: getToolDescription(`Save pending changes before pushing. This tool records modified files and change content for review before git push.

USAGE:
Call this tool to save your changes before pushing. The saved changes must be reviewed using get_pending_changes before git_push can proceed.

Please provide the change description in ${LANGUAGE === 'en' ? 'English' : LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? 'Chinese' : LANGUAGE === 'zh-TW' ? 'Traditional Chinese' : LANGUAGE} language.

Example:
{"files": ["src/main.js", "src/utils.js"], "content": "${LANGUAGE === 'en' ? 'Fixed bug in user authentication' : LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? '修复用户认证中的bug' : LANGUAGE === 'zh-TW' ? '修復用戶認證中的錯誤' : 'Fixed bug in user authentication'}"}`),
              inputSchema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Array of modified file paths'
                  },
                  content: {
                    type: 'string',
                    description: `Description of the changes made in ${LANGUAGE === 'en' ? 'English' : LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? 'Chinese' : LANGUAGE === 'zh-TW' ? 'Traditional Chinese' : LANGUAGE} language`
                  }
                },
                required: ['files', 'content']
              }
            },
            {
              name: getToolName('get_pending_changes'),
              description: getToolDescription(`Get pending changes that need to be reviewed before pushing. This tool MUST be called before git_push to enable pushing.

USAGE:
Call this tool to view and review all pending changes. This will mark changes as reviewed, allowing git_push to proceed. The review status is reset after each push attempt.

By default, this tool returns ALL pending changes (limit=1000). Use smaller limit values for pagination if needed.

Examples:
{} - View and review ALL changes (default)
{"limit": 10, "offset": 0} - View and review first 10 changes
{"limit": 50} - View and review first 50 changes

NOTE: Review status is valid only for the next push attempt. You may need to review again for subsequent pushes.`),
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description: 'Limit count (1-1000), default 1000 (shows all changes).'
                  },
                  offset: {
                    type: 'number',
                    description: 'Offset, default 0'
                  }
                }
              }
            },
            {
              name: getToolName('git_status'),
              description: getToolDescription(`Show the working directory and staging area status.

USAGE:
Call this tool to see which files have been modified, added, or deleted in your working directory and staging area.

Example:
{}`),
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: getToolName('git_diff'),
              description: getToolDescription(`Show changes between working directory and HEAD or staging area.

USAGE:
Call this tool to see the differences between your working directory and the last commit, or between staging area and HEAD.

Examples:
{} - Show all unstaged changes
{"staged": true} - Show staged changes
{"files": ["src/main.js"]} - Show changes for specific file(s)`),
              inputSchema: {
                type: 'object',
                properties: {
                  staged: {
                    type: 'boolean',
                    description: 'Show staged changes instead of unstaged, default false'
                  },
                  files: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Specific files to show diff for'
                  }
                }
              }
            },
            {
              name: getToolName('git_add'),
              description: getToolDescription(`Add file contents to the staging area.

USAGE:
Call this tool to stage files for commit. Use "." to add all changes, or specify specific files.

Examples:
{} - Add all changes (equivalent to "git add .")
{"files": ["src/main.js", "src/utils.js"]} - Add specific files
{"files": ["*.js"]} - Add files matching pattern (use shell expansion)`),
              inputSchema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Files to add (default: ["."] for all files)'
                  }
                }
              }
            },
            {
              name: getToolName('git_log'),
              description: getToolDescription(`Show commit history.

USAGE:
Call this tool to view the commit history of the repository.

Examples:
{} - Show last 10 commits with full details
{"limit": 5} - Show last 5 commits
{"limit": 20, "oneline": true} - Show last 20 commits in oneline format`),
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description: 'Number of commits to show (1-100), default 10'
                  },
                  oneline: {
                    type: 'boolean',
                    description: 'Show commits in oneline format, default false'
                  }
                }
              }
            }
          ];

          result = {
            tools: tools,
            environment: {
              PROJECT_PATH: PROJECT_PATH,
              REMOTE_NAME: REMOTE_NAME,
              LOCAL_BRANCH: LOCAL_BRANCH,
              REMOTE_BRANCH: REMOTE_BRANCH,
              GIT_PUSH_FLAGS: GIT_PUSH_FLAGS,
              TOOL_PREFIX: TOOL_PREFIX,
              REPO_NAME: REPO_NAME || '',
              LANGUAGE: LANGUAGE,
              pending_changes_count: pendingChanges.length,
              changes_reviewed: changesReviewed,
              serverInfo: {
                name: this.name,
                version: this.version
              }
            }
          };
        } else if (method === 'prompts/list') {
          // Return empty prompts list since we don't provide prompts functionality
          result = {
            prompts: []
          };
        } else if (method === 'prompts/call') {
          // Handle prompts call, but we don't provide prompts functionality
          result = {
            messages: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: 'Unsupported prompts call'
                  }
                ]
              }
            ]
          };
        } else if (method === 'resources/list') {
          // Return empty resources list since we don't provide resources functionality
          result = {
            resources: []
          };
        } else if (method === 'resources/read') {
          // Handle resources read, but we don't provide resources functionality
          result = {
            contents: [
              {
                uri: 'error://unsupported',
                text: 'Unsupported resources read'
              }
            ]
          };
        } else if (method === 'logging/list') {
          // Return empty logging list since we don't provide logging functionality
          result = {
            logs: []
          };
        } else if (method === 'logging/read') {
          // Handle logging read, but we don't provide logging functionality
          result = {
            contents: [
              {
                uri: 'error://unsupported',
                text: 'Unsupported logging read'
              }
            ]
          };
        } else if (method === 'roots/list') {
          // Return empty roots list since we don't provide roots functionality
          result = {
            roots: []
          };
        } else if (method === 'roots/read') {
          // Handle roots read, but we don't provide resources functionality
          result = {
            contents: [
              {
                uri: 'error://unsupported',
                text: 'Unsupported roots read'
              }
            ]
          };
        } else if (method === 'tools/call') {
          const { name, arguments: args } = params || {};

          if (!name) {
            throw new Error('Missing tool name');
          }

          // Remove tool prefix if present to get the actual method name
          let actualMethodName = name;
          if (TOOL_PREFIX && name.startsWith(`${TOOL_PREFIX}_`)) {
            actualMethodName = name.substring(TOOL_PREFIX.length + 1);
          }

          // Check if method exists
          if (!this[actualMethodName]) {
            throw new Error(`Unknown tool: ${name}`);
          }

          const toolResult = await this[actualMethodName](args || {});

          // Tool call results need to be wrapped in content
          result = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(toolResult, null, 2)
              }
            ]
          };
        } else if (method === 'ping') {
          logRequest('ping', {}, { status: 'pong' }, null);
          result = { pong: true };
        } else if (method === 'shutdown') {
          // Handle shutdown request
          result = null;
          // Delay exit to give client time to process response
          setTimeout(() => {
            process.exit(0);
          }, 100);
        } else if (method === 'notifications/initialized') {
          // Handle initialization notification
          logRequest('notifications/initialized', {}, { status: 'initialized' }, null);
        } else if (method === 'notifications/exit') {
          // Handle exit notification
          result = null;
          process.exit(0);
        } else {
          throw new Error(`Unknown method: ${method}`);
        }
      } catch (err) {
        error = err.message;
        throw err;
      } finally {
        // Record all requests to log, ensure parameters are not undefined
        const safeParams = params || {};
        logRequest(method, safeParams, result, error);
      }

      // For notification methods, no response is needed
      if (method === 'notifications/initialized' || method === 'notifications/exit') {
        return null;
      }

      // shutdown method needs to return response
      if (method === 'shutdown') {
        return {
          jsonrpc: '2.0',
          id,
          result: null
        };
      }

      // Ensure all methods return correct response format
      return {
        jsonrpc: '2.0',
        id,
        result
      };
    } catch (error) {
      // Use standard MCP error codes
      let errorCode = -32603; // Internal error
      let errorMessage = error.message;

      if (error.message.includes('Server not initialized')) {
        errorCode = -32002; // Server not initialized
      } else if (error.message.includes('Unknown method')) {
        errorCode = -32601; // Method not found
      } else if (error.message.includes('Unsupported JSON-RPC version')) {
        errorCode = -32600; // Invalid Request
      }
      logRequest('error', { error: error.message, stack: error.stack }, null, error.message);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: errorCode,
          message: errorMessage
        }
      };
    }
  }

  // Start server
  async start() {
    console.error('MCP Git server started');

    // Display log configuration
    const logConfig = getLogConfig();
    console.error(`Log directory: ${logConfig.dir}`);
    console.error(`Log file: ${logConfig.fullPath}`);

    // Listen to stdin
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (data) => {
      try {
        const lines = data.toString().trim().split('\n');

        for (const line of lines) {
          if (line.trim()) {
            try {
              const request = JSON.parse(line);
              const response = await this.handleRequest(request);
              if (response) {
                console.log(JSON.stringify(response));
              }
            } catch (requestError) {
              console.error('Error processing individual request:', requestError.message);
              // Send error response instead of crashing the entire server
              const errorResponse = {
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32603,
                  message: `Internal error: ${requestError.message}`
                }
              };
              console.log(JSON.stringify(errorResponse));
            }
          }
        }
      } catch (error) {
        console.error('Error processing data:', error.message);
        // Log error but don't exit server
        logRequest('data_processing_error', { error: error.message }, null, error.message);
      }
    });

    // Handle process signals
    process.on('SIGTERM', async () => {
      console.error('Received SIGTERM signal, shutting down server...');
      logRequest('SIGTERM', { signal: 'SIGTERM' }, { status: 'shutting_down' }, null);
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.error('Received SIGINT signal, shutting down server...');
      logRequest('SIGINT', { signal: 'SIGINT' }, { status: 'shutting_down' }, null);
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      logRequest('uncaughtException', { error: error.message, stack: error.stack }, null, error.message);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Promise rejection:', reason);
      logRequest('unhandledRejection', { reason: reason.toString(), promise: promise.toString() }, null, reason.toString());
      process.exit(1);
    });

    // Record server startup
    logRequest('server_start', {
      name: this.name,
      version: this.version,
      logDir: logConfig.dir,
      logFile: logConfig.fullPath,
      projectPath: PROJECT_PATH,
      remoteName: REMOTE_NAME,
      localBranch: LOCAL_BRANCH,
      remoteBranch: REMOTE_BRANCH
    }, { status: 'started' }, null);
  }
}

// Start server
async function main() {
  console.error('=== MCP Git Server Starting ===');
  console.error(`Time: ${new Date().toISOString()}`);
  console.error(`Project Path: ${PROJECT_PATH}`);
  console.error(`Remote Name: ${REMOTE_NAME}`);
  console.error(`Local Branch: ${LOCAL_BRANCH}`);
  console.error(`Remote Branch: ${REMOTE_BRANCH}`);
  console.error(`Git Push Flags: ${GIT_PUSH_FLAGS}`);
  console.error(`Tool Prefix: ${TOOL_PREFIX || '(none)'}`);
  console.error(`Pending Changes: ${pendingChanges.length}`);
  console.error(`Unreviewed Changes: ${pendingChanges.filter(c => !c.reviewed).length}`);
  if (HTTP_PROXY || HTTPS_PROXY || SOCKS_PROXY) {
    console.error(`HTTP Proxy: ${HTTP_PROXY || '(none)'}`);
    console.error(`HTTPS Proxy: ${HTTPS_PROXY || '(none)'}`);
    console.error(`SOCKS Proxy: ${SOCKS_PROXY || '(none)'}`);
    if (NO_PROXY) {
      console.error(`No Proxy: ${NO_PROXY}`);
    }
  }
  if (REPO_NAME) {
    console.error(`Repository Name: ${REPO_NAME}`);
  }
  console.error(`Language: ${LANGUAGE}`);
  console.error(`Started via: ${process.argv[1]}`);
  console.error('================================');

  const server = new FinalMCPServer();
  await server.start();
  console.error('MCP Git server started successfully');
}

main().catch(error => {
  console.error(error);
  // Write to log
  logRequest('main', { error: error.message, stack: error.stack }, null, error.message);
  process.exit(1);
});