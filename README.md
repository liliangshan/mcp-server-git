# MCP Server Git

A Model Context Protocol (MCP) server for executing git push operations with flexible branch mapping.

## Features

- Execute `git push` commands with flexible branch mapping and auto add/commit
- Comprehensive Git operations: status, diff, add, log, push
- Push history tracking and duplicate prevention
- Pending changes review system with forced validation
- Operation logging for debugging and monitoring
- Support for multiple languages (English, Chinese, Traditional Chinese)
- Environment variable configuration for flexibility
- Proxy support (HTTP, HTTPS, SOCKS5) for corporate networks

## Installation

```bash
npm install -g @liangshanli/mcp-server-git
```

## Environment Variables

The server requires the following environment variables:

### Required
- `PROJECT_PATH`: Absolute path to the git repository
- `LOCAL_BRANCH`: Local branch name to push from
- `REMOTE_BRANCH`: Remote branch name to push to

### Optional
- `REMOTE_NAME`: Remote name (default: "origin")
- `PULL_SOURCE_BRANCH`: Source branch for `git_pull` (default: same as `REMOTE_BRANCH`)
- `GIT_PUSH_FLAGS`: Additional git push flags (default: "--progress")
- `TOOL_PREFIX`: Prefix for MCP tool names (default: "")
- `REPO_NAME`: Repository identifier for logging and identification
- `LANGUAGE`: Language for messages ("en", "zh", "zh-CN", "zh-TW") (default: "en")
- `MCP_LOG_DIR`: Directory for log files (default: "./.setting" or "./.setting.{REPO_NAME}")
- `MCP_LOG_FILE`: Log filename (default: "mcp-git.log")
- `MCP_PUSH_HISTORY_FILE`: Push history filename (default: "push-history.json")
- `MCP_CHANGES_FILE`: Pending changes filename (default: "pending-changes.json")
- `HTTP_PROXY`: HTTP proxy URL (e.g., "http://proxy.company.com:8080")
- `HTTPS_PROXY`: HTTPS proxy URL (e.g., "http://proxy.company.com:8080")
- `SOCKS_PROXY`: SOCKS5 proxy URL (e.g., "socks5://proxy.company.com:1080"). Note: Git may require additional configuration for SOCKS5 proxy support.
- `NO_PROXY`: Comma-separated list of hosts that should not use proxy
- `ALL_PROXY`: Universal proxy URL for all protocols

## Usage

### 1. Set Environment Variables

```bash
export PROJECT_PATH="/path/to/your/git/repository"
export LOCAL_BRANCH="main"
export REMOTE_BRANCH="main"
export REMOTE_NAME="origin"  # optional
export GIT_PUSH_FLAGS="--progress --verbose"  # optional
export TOOL_PREFIX="myproject"  # optional
export REPO_NAME="my-project"  # optional

# Proxy settings (optional)
export HTTP_PROXY="http://proxy.company.com:8080"
export HTTPS_PROXY="http://proxy.company.com:8080"
export SOCKS_PROXY="socks5://proxy.company.com:1080"
export NO_PROXY="localhost,127.0.0.1,.local"
```

### 2. Start the Server

#### Using npm script
```bash
npm start
```

#### Using the CLI
```bash
mcp-server-git
```

#### Using start-server.js (with validation)
```bash
npm run start-managed
```

## Editor Integration

### Multiple Project Instances Support

You can configure multiple instances of the Git MCP server in your editor to manage different repositories simultaneously. Use `REPO_NAME` and `TOOL_PREFIX` to isolate the tools and logs for each project.

#### Cursor Editor Configuration

Create or update `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "git-web-app": {
      "command": "npx",
      "args": ["@liangshanli/mcp-server-git"],
      "env": {
        "PROJECT_PATH": "D:/projects/web-app",
        "LOCAL_BRANCH": "main",
        "REMOTE_BRANCH": "main",
        "REPO_NAME": "web-app",
        "TOOL_PREFIX": "web"
      }
    },
    "git-api-service": {
      "command": "npx",
      "args": ["@liangshanli/mcp-server-git"],
      "env": {
        "PROJECT_PATH": "D:/projects/api-service",
        "LOCAL_BRANCH": "develop",
        "REMOTE_BRANCH": "develop",
        "REPO_NAME": "api-service",
        "TOOL_PREFIX": "api"
      }
    }
  }
}
```

**Benefits of Multiple Instances:**
- **Tool Isolation**: Each instance has its own prefixed tools (e.g., `web_git_push`, `api_git_push`).
- **Log Isolation**: Logs are stored in separate directories (e.g., `./.setting.web-app/`, `./.setting.api-service/`).
- **Independent Config**: Different branches and paths for each repository.

### 3. MCP Tools

The server provides the following MCP tools:

#### `git_push` (or `<TOOL_PREFIX>_git_push`)
Execute git push command with a commit message. **Automatically adds and commits changes before pushing. Requires reviewing pending changes first.**

**Important:** You MUST call `get_pending_changes` to review changes before using this tool. The push will be blocked if changes haven't been reviewed.

**What it does:**
1. Automatically runs `git add .` to stage all changes
2. Automatically runs `git commit -m "message"` to commit changes
3. Executes `git push` to push to remote repository
4. Clears all pending changes and resets review status

**Parameters:**
- `message` (string, required): Commit message

**Example:**
```json
{
  "name": "git_push",
  "arguments": {
    "message": "Update project files"
  }
}
```

If `TOOL_PREFIX` is set (e.g., "myproject"), the tool name becomes `myproject_git_push`.

**Required Workflow:**
1. Make code changes
2. Call `save_changes` to record your modifications
3. Call `get_pending_changes` to review and mark changes as reviewed
4. Call `git_push` to automatically add, commit, and push changes
5. For subsequent pushes, repeat steps 3-4 (review status is reset after each push attempt)

This executes: `git push <REMOTE_NAME> <LOCAL_BRANCH>:<REMOTE_BRANCH> --progress`

#### `get_push_history` (or `<TOOL_PREFIX>_get_push_history`)
Get the last 5 push history records to check for duplicates.

**Parameters:** None

#### `get_operation_logs` (or `<TOOL_PREFIX>_get_operation_logs`)
Get operation logs for debugging.

**Parameters:**
- `limit` (number, optional): Number of logs to return (default: 50)
- `offset` (number, optional): Offset for pagination (default: 0)

#### `git_status` (or `<TOOL_PREFIX>_git_status`)
Show the working directory and staging area status.

**Parameters:** None

**Example:**
```json
{
  "name": "git_status"
}
```

#### `git_diff` (or `<TOOL_PREFIX>_git_diff`)
Show changes between working directory and HEAD or staging area.

**Parameters:**
- `staged` (boolean, optional): Show staged changes instead of unstaged (default: false)
- `files` (array, optional): Specific files to show diff for

**Examples:**
```json
{
  "name": "git_diff"
}
```
```json
{
  "name": "git_diff",
  "arguments": {
    "staged": true
  }
}
```

#### `git_add` (or `<TOOL_PREFIX>_git_add`)
Add file contents to the staging area.

**Parameters:**
- `files` (array, optional): Files to add (default: ["."] for all files)

**Examples:**
```json
{
  "name": "git_add"
}
```
```json
{
  "name": "git_add",
  "arguments": {
    "files": ["src/main.js", "src/utils.js"]
  }
}
```

#### `git_log` (or `<TOOL_PREFIX>_git_log`)
Show commit history.

**Parameters:**
- `limit` (number, optional): Number of commits to show (1-100, default: 10)
- `oneline` (boolean, optional): Show commits in oneline format (default: false)

**Examples:**
```json
{
  "name": "git_log"
}
```
```json
{
  "name": "git_log",
  "arguments": {
    "limit": 5,
    "oneline": true
  }
}
```

#### `git_pull` (or `<TOOL_PREFIX>_git_pull`)
Execute git pull command from the configured remote and source branch.

**Parameters:** None

**Example:**
```json
{
  "name": "git_pull"
}
```

This executes: `git pull <REMOTE_NAME> <PULL_SOURCE_BRANCH>`

#### `save_changes` (or `<TOOL_PREFIX>_save_changes`)
Save pending changes before pushing. Records modified files and change content for review.

**Parameters:**
- `files` (array, required): Array of modified file paths
- `content` (string, required): Description of the changes made

**Example:**
```json
{
  "name": "save_changes",
  "arguments": {
    "files": ["src/main.js", "src/utils.js"],
    "content": "Fixed bug in user authentication"
  }
}
```

#### `get_pending_changes` (or `<TOOL_PREFIX>_get_pending_changes`)
Get and review pending changes before pushing. This tool MUST be called before git_push to enable pushing.

**Important:** Calling this tool marks changes as reviewed, allowing git_push to proceed. The review status is reset after each push attempt.

**Parameters:**
- `limit` (number, optional): Number of changes to return (1-1000, default: 1000 - shows all changes)
- `offset` (number, optional): Offset for pagination (default: 0)

## Command Mapping

The server executes the following git command:

```bash
cd <PROJECT_PATH>
git push <REMOTE_NAME> <LOCAL_BRANCH>:<REMOTE_BRANCH> --progress
```

For example, with the default settings:
```bash
cd /path/to/project
git push origin main:main --progress
```

## Validation

The server performs the following validations on startup:

1. Checks for required environment variables
2. Verifies that `PROJECT_PATH` exists
3. Ensures `PROJECT_PATH` is a valid git repository (contains `.git` directory)

## Logging

- All operations are logged to files in the configured log directory
- Push history is maintained to prevent duplicate operations
- Operation logs include request/response details for debugging

## Error Handling

- Environment variable validation on startup
- Git command error handling with detailed error messages
- Automatic logging of all operations and errors

## License

MIT