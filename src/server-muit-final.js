const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

const operationLogs = [];
const MAX_LOGS = 1000;

const pushHistory = [];
const MAX_PUSH_HISTORY = 100;

const pendingChanges = [];
const MAX_PENDING_CHANGES = 50;

let changesReviewed = false;

const TOOL_PREFIX = process.env.TOOL_PREFIX || '';



const parseMultiInstance = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
};

const MULTI_INSTANCE = parseMultiInstance(process.env.MULTI_INSTANCE);

let CUSTOM_LOG_DIR = null;

const LANGUAGE = process.env.LANGUAGE || 'en';

const getLogConfig = (repoName = '') => {
  const logDir = process.env.LOG_DIR || CUSTOM_LOG_DIR;
  if (!logDir) {
    throw new Error('LOG_DIR not configured. Please call set_log_dir tool to set the log directory.');
  }

  const prefix = TOOL_PREFIX ? `${TOOL_PREFIX}.` : '';
  const logFile = `mcp-git${repoName ? `.${repoName}` : ''}.log`;
  const pushHistoryFile = `push-history${repoName ? `.${repoName}` : ''}.json`;
  const changesFile = `pending-changes${repoName ? `.${repoName}` : ''}.json`;

  return {
    dir: logDir,
    file: `${prefix}${logFile}`,
    fullPath: path.join(logDir, `${prefix}${logFile}`),
    pushHistoryFile: `${prefix}${pushHistoryFile}`,
    pushHistoryFullPath: path.join(logDir, `${prefix}${pushHistoryFile}`),
    changesFile: `${prefix}${changesFile}`,
    changesFullPath: path.join(logDir, `${prefix}${changesFile}`)
  };
};

const ensureLogDir = (repoName = '') => {
  const { dir } = getLogConfig(repoName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const logRequest = (method, params, result, error = null, repoName = '') => {
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

  const logLine = `${logEntry.created_at} | ${method} | ${logEntry.params} | ${error || 'SUCCESS'} | RESPONSE: ${logEntry.result || 'null'}\n`;

  try {
    ensureLogDir(repoName);
    const { fullPath } = getLogConfig(repoName);
    fs.appendFileSync(fullPath, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to write log file:', err.message);
  }
};

const loadPushHistory = (repoName = '') => {
  try {
    const { pushHistoryFullPath } = getLogConfig(repoName);
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

const savePushHistory = (repoName = '') => {
  try {
    ensureLogDir(repoName);
    const { pushHistoryFullPath } = getLogConfig(repoName);
    fs.writeFileSync(pushHistoryFullPath, JSON.stringify(pushHistory, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save push history:', err.message);
  }
};

const recordPushHistory = (message, result, error = null, repoName = '', toolContext = {}) => {
  const pushEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    repo_name: repoName,
    project_path: toolContext.PROJECT_PATH || '',
    remote_name: toolContext.REMOTE_NAME || 'origin',
    local_branch: toolContext.LOCAL_BRANCH || '',
    remote_branch: toolContext.REMOTE_BRANCH || '',
    message: message,
    success: !error,
    error: error ? error.toString() : null,
    exit_code: result ? result.exitCode : null
  };

  pushHistory.unshift(pushEntry);
  if (pushHistory.length > MAX_PUSH_HISTORY) {
    pushHistory.splice(MAX_PUSH_HISTORY);
  }

  savePushHistory(repoName);
};

loadPushHistory();

const loadPendingChanges = (repoName = '') => {
  try {
    const { changesFullPath } = getLogConfig(repoName);
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

const savePendingChanges = (repoName = '') => {
  try {
    ensureLogDir(repoName);
    const { changesFullPath } = getLogConfig(repoName);
    fs.writeFileSync(changesFullPath, JSON.stringify(pendingChanges, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save pending changes:', err.message);
  }
};

const clearPendingChanges = (repoName = '') => {
  pendingChanges.length = 0;
  savePendingChanges(repoName);
};

loadPendingChanges();

class FinalMCPServer {
  constructor() {
    this.name = 'mcp-git-server-multi';
    this.version = '1.0.0';
    this.initialized = false;
  }

  async git_pull(params, toolContext = {}) {
    const remoteName = toolContext.REMOTE_NAME || 'origin';
    const pullSourceBranch = toolContext.PULL_SOURCE_BRANCH || toolContext.REMOTE_BRANCH || 'main';
    const projectPath = toolContext.PROJECT_PATH || '';

    try {
      const args = ['pull', remoteName, pullSourceBranch];
      const result = await this.executeGitCommand(args, 'git_pull', 30000, toolContext);
      
      return {
        success: true,
        remote_name: remoteName,
        pull_source_branch: pullSourceBranch,
        project_path: projectPath,
        output: result.stdout,
        error_output: result.stderr,
        message: `Successfully pulled from ${remoteName}/${pullSourceBranch}`
      };
    } catch (err) {
      throw new Error(`Git pull failed: ${err.error || err.message}`);
    }
  }

  async git_push(params, toolContext = {}) {
    const { message } = params;

    const remoteName = toolContext.REMOTE_NAME || 'origin';
    const localBranch = toolContext.LOCAL_BRANCH || 'main';
    const remoteBranch = toolContext.REMOTE_BRANCH || 'main';
    const projectPath = toolContext.PROJECT_PATH || '';
    const repoName = toolContext.REPO_NAME || '';
    const gitPushFlags = toolContext.GIT_PUSH_FLAGS || '--progress';

    if (!message || typeof message !== 'string') {
      throw new Error('Missing message parameter');
    }

    const getPendingChangesToolName = TOOL_PREFIX ? `${TOOL_PREFIX}_get_pending_changes` : 'get_pending_changes';

    if (!changesReviewed && pendingChanges.length > 0) {
      return {
        content: [
          { type: 'text', text: '⚠️ ERROR: You must review pending changes before pushing code.' },
          { type: 'text', text: `🔧 REQUIRED ACTION: You must call the get_pending_changes tool to review pending changes.` },
          { type: 'text', text: `📋 TOOL NAME: "${getPendingChangesToolName}" - Use this tool to review pending changes.` },
          { type: 'text', text: `📝 TOOL CALL EXAMPLE: Call tools/call with name="${getPendingChangesToolName}" and arguments: {"repo": "${repoName}", "limit": 1000}` },
          { type: 'text', text: `📊 STEP 1: Call "${getPendingChangesToolName}" tool to review all pending changes.` },
          { type: 'text', text: `✅ STEP 2: After reviewing, you can then call git_push tool to proceed with the push.` },
          { type: 'text', text: `⚠️ IMPORTANT: The review status will be reset after push attempt. You may need to review again for subsequent pushes.` },
          { type: 'text', text: `📈 Current pending changes: ${pendingChanges.length} change(s).` }
        ],
        isError: true,
        errorCode: 'CHANGES_NOT_REVIEWED'
      };
    }

    try {
      console.error('Auto-adding and committing changes before push...');

      try {
        const statusResult = await this.executeGitCommand(['status', '--porcelain'], 'git_status_check', 30000, toolContext);
        const hasStagedChanges = statusResult.stdout.split('\n').some(line => line.startsWith('A ') || line.startsWith('M ') || line.startsWith('D '));

        if (!hasStagedChanges) {
          await this.executeGitCommand(['add', '.'], 'git_add_auto', 60000, toolContext);
          console.error('✓ Changes added to staging area');
        } else {
          console.error('✓ Staged changes already exist, skipping git add');
        }
      } catch (statusErr) {
        console.error('Warning: git status check failed, proceeding with git add:', statusErr.message);
        try {
          await this.executeGitCommand(['add', '.'], 'git_add_auto', 30000, toolContext);
          console.error('✓ Changes added to staging area');
        } catch (addErr) {
          console.error('Warning: git add failed, but continuing with push:', addErr.message);
        }
      }

      try {
        await this.executeGitCommand(['commit', '-m', message], 'git_commit_auto', 30000, toolContext);
        console.error('✓ Changes committed');
      } catch (commitErr) {
        if (commitErr.stderr && commitErr.stderr.includes('nothing to commit')) {
          console.error('✓ No changes to commit, proceeding with push');
        } else {
          console.error('Warning: git commit failed, but continuing with push:', commitErr.message);
        }
      }

      const pushFlags = gitPushFlags.trim() ? gitPushFlags.trim().split(/\s+/) : [];
      const pushArgs = ['push', remoteName, `${localBranch}:${remoteBranch}`].concat(pushFlags);
      
      const result = await this.executeGitCommand(pushArgs, 'git_push_final', 300000, toolContext);

      logRequest('git_push', {
        repo_name: repoName,
        project_path: projectPath,
        remote_name: remoteName,
        local_branch: localBranch,
        remote_branch: remoteBranch,
        git_push_flags: gitPushFlags,
        message
      }, result, null, repoName);

      recordPushHistory(message, result, null, repoName, toolContext);

      clearPendingChanges(repoName);
      changesReviewed = false;

      return {
        success: true,
        repo_name: repoName,
        project_path: projectPath,
        remote_name: remoteName,
        local_branch: localBranch,
        remote_branch: remoteBranch,
        git_push_flags: gitPushFlags,
        message: message,
        cleared_changes: pendingChanges.length,
        review_status_reset: true,
        output: result.stdout,
        error_output: result.stderr,
        exit_code: result.exitCode
      };
    } catch (err) {
      changesReviewed = false;

      logRequest('git_push', {
        repo_name: repoName,
        project_path: projectPath,
        remote_name: remoteName,
        local_branch: localBranch,
        remote_branch: remoteBranch,
        git_push_flags: gitPushFlags,
        message
      }, null, err.error || err.message, repoName);

      recordPushHistory(message, null, err.error || err.message, repoName, toolContext);

      throw new Error(`Git push failed: ${err.error || err.message}`);
    }
  }

  async get_push_history(params, toolContext = {}) {
    const last5Records = pushHistory.slice(0, 5);

    return {
      total: pushHistory.length,
      records: last5Records,
      message: last5Records.length > 0
        ? `Found ${last5Records.length} recent push record(s). Please review them to ensure your current changes have not been pushed before. After reviewing, you can proceed with git_push.`
        : 'No push history found. This appears to be the first push. You can now proceed with git_push.'
    };
  }

  async get_operation_logs(params, toolContext = {}) {
    const { limit = 50, offset = 0 } = params || {};

    if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
      throw new Error('limit parameter must be between 1-1000');
    }

    if (typeof offset !== 'number' || offset < 0) {
      throw new Error('offset parameter must be greater than or equal to 0');
    }

    const logs = operationLogs.slice(offset, offset + limit);

    return {
      logs: logs,
      total: operationLogs.length,
      limit: limit,
      offset: offset,
      hasMore: offset + limit < operationLogs.length
    };
  }

  async save_changes(params, toolContext = {}) {
    const { files, content, repo, limit = 1000 } = params;
    const repoName = toolContext.REPO_NAME || '';

    if (repo && files === undefined && content === undefined) {
      let filteredChanges = pendingChanges;
      if (repo && MULTI_INSTANCE.length > 0) {
        const targetInstance = MULTI_INSTANCE.find(i => i.REPO_NAME === repo);
        if (targetInstance) {
          filteredChanges = pendingChanges.filter(c => c.project_path === targetInstance.PROJECT_PATH);
        }
      }

      changesReviewed = true;

      const changes = filteredChanges.slice(0, limit);

      logRequest('save_changes', {
        repo: repo,
        limit: limit,
        total_changes: filteredChanges.length
      }, { success: true }, null, repo);

      return {
        success: true,
        changes: changes,
        total: filteredChanges.length,
        message: `Found ${filteredChanges.length} pending change(s). Changes have been marked as reviewed. You can now proceed with git_push.`
      };
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('files parameter must be a non-empty array');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('content parameter must be a non-empty string');
    }

    if (!files.every(file => typeof file === 'string' && file.trim())) {
      throw new Error('all files must be non-empty strings');
    }

    const changeEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      repo_name: repoName,
      project_path: toolContext.PROJECT_PATH || '',
      files: files.map(f => f.trim()),
      content: content.trim(),
      reviewed: false
    };

    pendingChanges.unshift(changeEntry);
    if (pendingChanges.length > MAX_PENDING_CHANGES) {
      pendingChanges.splice(MAX_PENDING_CHANGES);
    }

    savePendingChanges(repoName);

    logRequest('save_changes', {
      files: files,
      content_length: content.length,
      change_id: changeEntry.id
    }, { success: true }, null, repoName);

    return {
      success: true,
      change_id: changeEntry.id,
      message: `Successfully saved ${files.length} file changes. Total pending changes: ${pendingChanges.length}`,
      files_count: files.length,
      content_length: content.length
    };
  }

  async get_pending_changes(params, toolContext = {}) {
    const { limit = 1000, offset = 0, repo } = params || {};

    if (typeof limit !== 'number' || limit < 1 || limit > 1000) {
      throw new Error('limit parameter must be between 1-1000');
    }

    if (typeof offset !== 'number' || offset < 0) {
      throw new Error('offset parameter must be greater than or equal to 0');
    }

    let filteredChanges = pendingChanges;
    if (repo && MULTI_INSTANCE.length > 0) {
      const targetInstance = MULTI_INSTANCE.find(i => i.REPO_NAME === repo);
      if (targetInstance) {
        filteredChanges = pendingChanges.filter(c => c.project_path === targetInstance.PROJECT_PATH);
      }
    }

    changesReviewed = true;

    logRequest('get_pending_changes', {
      repo: repo,
      limit: limit,
      offset: offset,
      total_changes: filteredChanges.length
    }, { success: true }, null, repo);

    const changes = filteredChanges.slice(offset, offset + limit);

    return {
      changes: changes,
      total: filteredChanges.length,
      limit: limit,
      offset: offset,
      hasMore: offset + limit < filteredChanges.length,
      message: filteredChanges.length > 0
        ? `Found ${pendingChanges.length} pending change(s). Changes have been marked as reviewed. You can now proceed with git_push.`
        : 'No pending changes found.'
    };
  }

  async git_status(params, toolContext = {}) {
    const projectPath = toolContext.PROJECT_PATH || '';

    try {
      const result = await this.executeGitCommand(['status', '--porcelain'], 'git_status', 30000, toolContext);
      return {
        success: true,
        status: result.stdout.trim(),
        has_changes: result.stdout.trim().length > 0,
        project_path: projectPath,
        message: result.stdout.trim().length > 0
          ? 'Working directory has uncommitted changes'
          : 'Working directory is clean'
      };
    } catch (err) {
      throw new Error(`Git status failed: ${err.error || err.message}`);
    }
  }

  async git_diff(params, toolContext = {}) {
    const { staged = false, files = [] } = params || {};
    const projectPath = toolContext.PROJECT_PATH || '';

    try {
      const args = ['diff'];
      if (staged) {
        args.push('--cached');
      }
      if (files && files.length > 0) {
        args.push('--', ...files);
      }

      const result = await this.executeGitCommand(args, 'git_diff', 30000, toolContext);
      return {
        success: true,
        diff: result.stdout,
        has_changes: result.stdout.trim().length > 0,
        staged: staged,
        files: files || [],
        project_path: projectPath
      };
    } catch (err) {
      throw new Error(`Git diff failed: ${err.error || err.message}`);
    }
  }

  async git_add(params, toolContext = {}) {
    const { files = ['.'] } = params || {};
    const projectPath = toolContext.PROJECT_PATH || '';

    try {
      const args = ['add', ...files];
      const result = await this.executeGitCommand(args, 'git_add', 30000, toolContext);

      return {
        success: true,
        files_added: files,
        output: result.stdout,
        project_path: projectPath,
        message: `Successfully added ${files.length} file(s) to staging area`
      };
    } catch (err) {
      throw new Error(`Git add failed: ${err.error || err.message}`);
    }
  }

  async git_log(params, toolContext = {}) {
    const { limit = 10, oneline = false } = params || {};
    const projectPath = toolContext.PROJECT_PATH || '';

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

      const result = await this.executeGitCommand(args, 'git_log', 30000, toolContext);

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

  async set_log_dir(params, toolContext = {}) {
    const { log_dir } = params;

    if (!log_dir || typeof log_dir !== 'string') {
      throw new Error('log_dir parameter must be a non-empty string');
    }

    const resolvedPath = path.resolve(log_dir);

    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    CUSTOM_LOG_DIR = resolvedPath;

    return {
      success: true,
      log_dir: resolvedPath,
      message: `Log directory set to: ${resolvedPath}`
    };
  }

  async executeGitCommand(args, operation, timeout = 30000, toolContext = {}) {
    return new Promise((resolve, reject) => {
      const command = 'git';
      const cwdPath = toolContext.PROJECT_PATH || '';

      console.error(`Executing: cd ${cwdPath} && ${command} ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`);

      const env = { ...process.env };

      const httpProxy = process.env.HTTP_PROXY || '';
      const httpsProxy = process.env.HTTPS_PROXY || '';
      const socksProxy = process.env.SOCKS_PROXY || '';
      const noProxy = process.env.NO_PROXY || '';
      const allProxy = process.env.ALL_PROXY || '';

      if (httpProxy) {
        env.HTTP_PROXY = httpProxy;
        env.http_proxy = httpProxy;
      }
      if (httpsProxy) {
        env.HTTPS_PROXY = httpsProxy;
        env.https_proxy = httpsProxy;
      }
      if (socksProxy) {
        env.SOCKS_PROXY = socksProxy;
        env.socks_proxy = socksProxy;
      }
      if (noProxy) {
        env.NO_PROXY = noProxy;
        env.no_proxy = noProxy;
      }
      if (allProxy) {
        env.ALL_PROXY = allProxy;
        env.all_proxy = allProxy;
      }

      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        cwd: cwdPath,
        env: env
      });

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
        clearTimeout(timeoutId);
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
        clearTimeout(timeoutId);
        reject({
          success: false,
          error: err.message,
          stdout: stdout,
          stderr: stderr
        });
      });
    });
  }

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
          if (!this.initialized) {
            this.initialized = true;
            const clientInfo = params?.clientInfo || {};
            logRequest('initialize', {
              protocolVersion: params?.protocolVersion || '2025-06-18',
              capabilities: params?.capabilities || {},
              clientInfo: clientInfo
            }, null, null);
          }

          const serverCapabilities = {
            tools: { listChanged: false }
          };

          if (params?.capabilities?.prompts) {
            serverCapabilities.prompts = { listChanged: false };
          }
          if (params?.capabilities?.resources) {
            serverCapabilities.resources = { listChanged: false };
          }
          if (params?.capabilities?.logging) {
            serverCapabilities.logging = { listChanged: false };
          }
          if (params?.capabilities?.roots) {
            serverCapabilities.roots = { listChanged: false };
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
          const getToolName = (baseName) => {
            return TOOL_PREFIX ? `${TOOL_PREFIX}_${baseName}` : baseName;
          };

          const tools = [
            {
              name: getToolName('git_pull'),
              description: `Execute git pull command from remote repository to current branch.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}"}`,
              inputSchema: {
                type: 'object',
                properties: {
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            },
            {
              name: getToolName('git_push'),
              description: `Execute git push command to remote repository.

⚠️ REQUIREMENT: You MUST call get_pending_changes to review changes before using this tool.

USAGE:
1. First call get_pending_changes to review pending changes
2. Then call this tool with the commit message parameter.

Please provide the commit message in ${LANGUAGE === 'en' ? 'English' : 'Chinese'} language.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {message: "${LANGUAGE === 'zh' || LANGUAGE === 'zh-CN' ? '更新项目文件' : 'Update project files'}", "repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}"}

NOTE: If the push result contains a branch merge URL, please output it to the user.

The review status is reset after each push attempt (success or failure).`,
              inputSchema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: `Commit message in ${LANGUAGE === 'en' ? 'English' : 'Chinese'} language`
                  },
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['message', 'repo']
              }
            },
            {
              name: getToolName('get_push_history'),
              description: `Get the last 5 push history records for the git repository. This tool should be called before using git_push to ensure the current changes have not been pushed before.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}"}`,
              inputSchema: {
                type: 'object',
                properties: {
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            },
            {
              name: getToolName('get_operation_logs'),
              description: `Get operation logs for debugging and monitoring purposes.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}", "limit": 50, "offset": 0}`,
              inputSchema: {
                type: 'object',
                properties: {
                  limit: { type: 'number', description: 'Limit count, default 50' },
                  offset: { type: 'number', description: 'Offset, default 0' },
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            },
            {
              name: getToolName('save_changes'),
              description: `Save pending changes before pushing. This tool records modified files and change content for review before git push.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Please provide the change description in Chinese language.
Example: {"files": ["src/main.js"], "content": "修复用户认证中的bug", "repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}"}`,
              inputSchema: {
                type: 'object',
                properties: {
                  files: { type: 'array', items: { type: 'string' }, description: 'Array of modified file paths' },
                  content: { type: 'string', description: 'Description of the changes made in Chinese language' },
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  },
                  limit: {
                    type: 'number',
                    description: 'Limit count (1-1000), default 1000'
                  }
                },
                required: ['files', 'content', 'repo']
              }
            },
            {
              name: getToolName('get_pending_changes'),
              description: `Get pending changes that need to be reviewed before pushing. This tool MUST be called before git_push to enable pushing.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}", "limit": 1000, "offset": 0}

NOTE: Review status is valid only for the next push attempt.`,
              inputSchema: {
                type: 'object',
                properties: {
                  limit: { type: 'number', description: 'Limit count (1-1000), default 1000' },
                  offset: { type: 'number', description: 'Offset, default 0' },
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            },
            {
              name: getToolName('git_status'),
              description: `Show the working directory and staging area status.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}"}`,
              inputSchema: {
                type: 'object',
                properties: {
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            },
            {
              name: getToolName('git_diff'),
              description: `Show changes between working directory and HEAD or staging area.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}", "staged": false, "files": ["src/main.js"]}`,
              inputSchema: {
                type: 'object',
                properties: {
                  staged: { type: 'boolean', description: 'Show staged changes instead of unstaged, default false' },
                  files: { type: 'array', items: { type: 'string' }, description: 'Specific files to show diff for' },
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            },
            {
              name: getToolName('git_add'),
              description: `Add file contents to the staging area.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}", "files": ["."]}`,
              inputSchema: {
                type: 'object',
                properties: {
                  files: { type: 'array', items: { type: 'string' }, description: 'Files to add (default: ["."] for all files)' },
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            },
            {
              name: getToolName('git_log'),
              description: `Show commit history.

Available repositories:
${MULTI_INSTANCE.map(i => `  - ${i.REPO_NAME}: ${i.PROJECT_PATH}`).join('\n')}

Example: {"repo": "${MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE[0].REPO_NAME : ''}", "limit": 10, "oneline": false}`,
              inputSchema: {
                type: 'object',
                properties: {
                  limit: { type: 'number', description: 'Number of commits to show (1-100), default 10' },
                  oneline: { type: 'boolean', description: 'Show commits in oneline format, default false' },
                  repo: {
                    type: 'string',
                    description: `Repository name, required. Available values: ${MULTI_INSTANCE.map(i => i.REPO_NAME).join(', ')}`,
                    enum: MULTI_INSTANCE.length > 0 ? MULTI_INSTANCE.map(i => i.REPO_NAME) : undefined
                  }
                },
                required: ['repo']
              }
            }
          ];

          if (!process.env.LOG_DIR) {
            tools.push({
              name: getToolName('set_log_dir'),
              description: `Set the log directory path for storing git operation logs.

⚠️ This tool is required when LOG_DIR environment variable is not set.

Example: {"log_dir": "./logs"}`,
              inputSchema: {
                type: 'object',
                properties: {
                  log_dir: {
                    type: 'string',
                    description: 'Absolute path to the log directory (e.g., "D:/logs" or "/var/logs")'
                  }
                },
                required: ['log_dir']
              }
            });
          }

          result = {
            tools: tools,
            environment: {
              TOOL_PREFIX: TOOL_PREFIX,
              LANGUAGE: LANGUAGE,
              pending_changes_count: pendingChanges.length,
              changes_reviewed: changesReviewed,
              multi_instance: MULTI_INSTANCE,
              repo_list: MULTI_INSTANCE.map(i => ({
                repo_name: i.REPO_NAME || '',
                project_path: i.PROJECT_PATH || ''
              })),
              serverInfo: {
                name: this.name,
                version: this.version
              }
            }
          };
        } else if (method === 'prompts/list') {
          result = { prompts: [] };
        } else if (method === 'prompts/call') {
          result = {
            messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Unsupported prompts call' }] }]
          };
        } else if (method === 'resources/list') {
          result = { resources: [] };
        } else if (method === 'resources/read') {
          result = { contents: [{ uri: 'error://unsupported', text: 'Unsupported resources read' }] };
        } else if (method === 'logging/list') {
          result = { logs: [] };
        } else if (method === 'logging/read') {
          result = { contents: [{ uri: 'error://unsupported', text: 'Unsupported logging read' }] };
        } else if (method === 'roots/list') {
          result = { roots: [] };
        } else if (method === 'roots/read') {
          result = { contents: [{ uri: 'error://unsupported', text: 'Unsupported roots read' }] };
        } else if (method === 'tools/call') {
          const { name, arguments: args } = params || {};

          if (!name) {
            throw new Error('Missing tool name');
          }

          let actualMethodName = name;
          if (TOOL_PREFIX && name.startsWith(`${TOOL_PREFIX}_`)) {
            actualMethodName = name.substring(TOOL_PREFIX.length + 1);
          }

          if (!this[actualMethodName]) {
            throw new Error(`Unknown tool: ${name}`);
          }

          let toolContext = {};
          if (args && args.repo && MULTI_INSTANCE.length > 0) {
            const targetInstance = MULTI_INSTANCE.find(i => i.REPO_NAME === args.repo);
            if (targetInstance) {
              toolContext = {
                PROJECT_PATH: targetInstance.PROJECT_PATH,
                REPO_NAME: targetInstance.REPO_NAME,
                LOCAL_BRANCH: targetInstance.LOCAL_BRANCH,
                REMOTE_BRANCH: targetInstance.REMOTE_BRANCH,
                LANGUAGE: targetInstance.LANGUAGE || 'en'
              };
            } else {
              throw new Error(`Repository not found: ${args.repo}`);
            }
          }

          const toolResult = await this[actualMethodName](args || {}, toolContext);

          result = {
            content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }]
          };
        } else if (method === 'ping') {
          logRequest('ping', {}, { status: 'pong' }, null);
          result = { pong: true };
        } else if (method === 'shutdown') {
          result = null;
          setTimeout(() => { process.exit(0); }, 100);
        } else if (method === 'notifications/initialized') {
          logRequest('notifications/initialized', {}, { status: 'initialized' }, null);
        } else if (method === 'notifications/exit') {
          result = null;
          process.exit(0);
        } else {
          throw new Error(`Unknown method: ${method}`);
        }
      } catch (err) {
        error = err.message;
        throw err;
      } finally {
        const safeParams = params || {};
        logRequest(method, safeParams, result, error);
      }

      if (method === 'notifications/initialized' || method === 'notifications/exit') {
        return null;
      }

      if (method === 'shutdown') {
        return { jsonrpc: '2.0', id, result: null };
      }

      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      let errorCode = -32603;
      let errorMessage = error.message;

      if (error.message.includes('Server not initialized')) {
        errorCode = -32002;
      } else if (error.message.includes('Unknown method')) {
        errorCode = -32601;
      } else if (error.message.includes('Unsupported JSON-RPC version')) {
        errorCode = -32600;
      }
      logRequest('error', { error: error.message, stack: error.stack }, null, error.message);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: errorCode, message: errorMessage }
      };
    }
  }

  async start() {
    console.error('MCP Git multi-instance server started');
    console.error(`Multi-instance count: ${MULTI_INSTANCE.length}`);

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
              const errorResponse = {
                jsonrpc: '2.0',
                id: null,
                error: { code: -32603, message: `Internal error: ${requestError.message}` }
              };
              console.log(JSON.stringify(errorResponse));
            }
          }
        }
      } catch (error) {
        console.error('Error processing data:', error.message);
        logRequest('data_processing_error', { error: error.message }, null, error.message);
      }
    });

    process.on('SIGTERM', async () => {
      console.error('Received SIGTERM signal, shutting down server...');
      logRequest('SIGTERM', { signal: 'SIGTERM' }, { status: 'shutting_down' }, null);
      process.exit(0);
    });
  }
}

async function main() {
  console.error('================================');
  console.error(`Time: ${new Date().toISOString()}`);
  console.error(`Language: ${LANGUAGE}`);
  console.error(`Tool Prefix: ${TOOL_PREFIX || '(none)'}`);
  console.error(`Multi Instance: ${MULTI_INSTANCE.length} instance(s)`);
  if (MULTI_INSTANCE.length > 0) {
    console.error(`Instances:`);
    MULTI_INSTANCE.forEach((instance, index) => {
      console.error(`  ${index + 1}. ${instance.REPO_NAME}: ${instance.PROJECT_PATH}`);
    });
  }
  console.error(`Pending Changes: ${pendingChanges.length}`);
  console.error('================================');

  const server = new FinalMCPServer();
  await server.start();
  console.error('MCP Git multi-instance server started successfully');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
