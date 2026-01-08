# MCP Server Git

一个用于执行 git push 操作的模型上下文协议 (MCP) 服务器，支持灵活的分支映射。

## 功能特性

- 使用可配置的远程仓库、源分支和目标分支执行 `git push` 命令
- 推送历史跟踪和重复推送预防
- 操作日志记录用于调试和监控
- 支持多种语言（英语、中文）
- 环境变量配置以提高灵活性

## 安装

```bash
npm install -g @liangshanli/mcp-server-git
```

## 环境变量

服务器需要以下环境变量：

### 必需变量
- `PROJECT_PATH`: git 仓库的绝对路径
- `LOCAL_BRANCH`: 要推送的本地分支名称
- `REMOTE_BRANCH`: 要推送到的远程分支名称

### 可选变量
- `REMOTE_NAME`: 远程仓库名称（默认："origin"）
- `PULL_SOURCE_BRANCH`: `git_pull` 的源分支（默认：与 `REMOTE_BRANCH` 相同）
- `GIT_PUSH_FLAGS`: 额外的git push标志（默认："--progress"）
- `TOOL_PREFIX`: MCP工具名称前缀（默认：""）
- `REPO_NAME`: 仓库标识符，用于日志记录和标识
- `LANGUAGE`: 消息语言（"en", "zh", "zh-CN", "zh-TW"）（默认："en"）
- `MCP_LOG_DIR`: 日志文件目录（默认："./.setting" 或 "./.setting.{REPO_NAME}"）
- `MCP_LOG_FILE`: 日志文件名（默认："mcp-git.log"）
- `MCP_PUSH_HISTORY_FILE`: 推送历史文件名（默认："push-history.json"）
- `MCP_CHANGES_FILE`: 待处理修改文件名（默认："pending-changes.json"）
- `HTTP_PROXY`: HTTP 代理 URL（例如："http://proxy.company.com:8080"）
- `HTTPS_PROXY`: HTTPS 代理 URL（例如："http://proxy.company.com:8080"）
- `SOCKS_PROXY`: SOCKS5 代理 URL（例如："socks5://proxy.company.com:1080"）。注意：Git 可能需要额外配置才能支持 SOCKS5 代理。
- `NO_PROXY`: 不使用代理的主机列表（逗号分隔）
- `ALL_PROXY`: 适用于所有协议的通用代理 URL

## 使用方法

### 1. 设置环境变量

```bash
export PROJECT_PATH="/path/to/your/git/repository"
export LOCAL_BRANCH="main"
export REMOTE_BRANCH="main"
export REMOTE_NAME="origin"  # 可选
export GIT_PUSH_FLAGS="--progress --verbose"  # 可选
export TOOL_PREFIX="myproject"  # 可选
export REPO_NAME="my-project"  # 可选

# 代理设置（可选）
export HTTP_PROXY="http://proxy.company.com:8080"
export HTTPS_PROXY="http://proxy.company.com:8080"
export SOCKS_PROXY="socks5://proxy.company.com:1080"
export NO_PROXY="localhost,127.0.0.1,.local"
```

### 2. 启动服务器

#### 使用 npm 脚本
```bash
npm start
```

#### 使用 CLI
```bash
mcp-server-git
```

#### 使用 start-server.js（带验证）
```bash
npm run start-managed
```

## 编辑器集成

### 多项目实例支持

你可以在编辑器中配置多个 Git MCP 服务器实例，以便同时管理不同的仓库。通过设置 `REPO_NAME` 和 `TOOL_PREFIX`，可以隔离每个项目的工具名称和日志。

#### Cursor 编辑器配置

在项目根目录创建或更新 `.cursor/mcp.json`：

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

**多实例集成的优势：**
- **工具隔离**：每个实例都有带前缀的独立工具（例如：`web_git_push`, `api_git_push`）。
- **日志隔离**：日志存储在不同的目录中（例如：`./.setting.web-app/`, `./.setting.api-service/`）。
- **独立配置**：每个仓库可以配置不同的分支映射和项目路径。

## 💡 最佳实践与使用建议

为了充分发挥 MCP Git Server 的威力，建议在与 AI 协作时遵循以下“强约束”指令：

1. **原子化记录 (`save_changes`)**：
   - **指令建议**：“请在每次完成一个独立的小功能或修复一个 Bug 后，立即调用 `save_changes` 工具。你需要明确列出修改的文件，并用一两句话简述你的修改逻辑。严禁累积大量变动而不记录。”
   - **价值**：这能确保 AI 的记忆碎片被实时固化，防止在后续复杂的重构中丢失初始意图。

2. **模块化推送 (`git_push`)**：
   - **指令建议**：“当我们完成当前功能模块的所有开发和自测后，请通过调用 `git_push` 进行推送。在推送前，你必须先通过 `get_pending_changes` 完整读取并总结我们本次会话的所有保存记录，生成一份结构清晰、涵盖所有变动的 Commit Message。”
   - **价值**：将“总结历史记录”作为推送的法定前置步骤，彻底消灭“金鱼脑”提交。

3. **阶段性复盘**：
   - 如果会话过程极长（如持续数小时），可以偶尔要求 AI 调用 `get_pending_changes` 进行一次中场总结，确保存储的记录与当前的实际代码状态完全吻合。

### 3. MCP 工具

服务器提供以下 MCP 工具：

#### `git_push` (或 `<TOOL_PREFIX>_git_push`)
使用提交消息执行 git push 命令。**自动添加并提交修改后推送。需要先审查待处理修改。**

**重要：** 必须先调用 `get_pending_changes` 来审查修改后才能使用此工具。如果修改还未被审查，推送将被阻止。

**执行的操作：**
1. 自动执行 `git add .` 添加所有修改到暂存区
2. 自动执行 `git commit -m "message"` 提交修改
3. 执行 `git push` 推送到远程仓库
4. 清除所有待处理修改并重置审查状态

**参数：**
- `message` (string, 必需): 提交消息

**示例：**
```json
{
  "name": "git_push",
  "arguments": {
    "message": "更新项目文件"
  }
}
```

如果设置了 `TOOL_PREFIX`（例如："myproject"），工具名称将变为 `myproject_git_push`。

**必需的工作流程：**
1. 进行代码修改
2. 调用 `save_changes` 记录修改内容
3. 调用 `get_pending_changes` 审查并标记修改为已审查
4. 调用 `git_push` 自动添加、提交并推送修改
5. 对于后续推送，重复步骤 3-4（每次推送尝试后审查状态都会重置）

这将执行：`git push <REMOTE_NAME> <LOCAL_BRANCH>:<REMOTE_BRANCH> --progress`

#### `get_push_history` (或 `<TOOL_PREFIX>_get_push_history`)
获取最近5次推送历史记录以检查重复项。

**参数：** 无

#### `get_operation_logs` (或 `<TOOL_PREFIX>_get_operation_logs`)
获取操作日志用于调试。

**参数：**
- `limit` (number, 可选): 返回的日志数量（默认：50）
- `offset` (number, 可选): 分页偏移量（默认：0）

#### `git_status` (或 `<TOOL_PREFIX>_git_status`)
显示工作目录和暂存区的状态。

**参数：** 无

**示例：**
```json
{
  "name": "git_status"
}
```

#### `git_diff` (或 `<TOOL_PREFIX>_git_diff`)
显示工作目录与HEAD或暂存区之间的差异。

**参数：**
- `staged` (boolean, 可选): 显示暂存的变更而非未暂存的变更（默认：false）
- `files` (array, 可选): 指定要显示差异的文件

**示例：**
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

#### `git_add` (或 `<TOOL_PREFIX>_git_add`)
将文件内容添加到暂存区。

**参数：**
- `files` (array, 可选): 要添加的文件（默认：["."] 表示所有文件）

**示例：**
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

#### `git_log` (或 `<TOOL_PREFIX>_git_log`)
显示提交历史。

**参数：**
- `limit` (number, 可选): 显示的提交数量（1-100，默认：10）
- `oneline` (boolean, 可选): 以单行格式显示提交（默认：false）

**示例：**
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

#### `git_pull` (或 `<TOOL_PREFIX>_git_pull`)
从配置的远程仓库和源分支执行 git pull 命令。

**参数：** 无

**示例：**
```json
{
  "name": "git_pull"
}
```

这将执行：`git pull <REMOTE_NAME> <PULL_SOURCE_BRANCH>`

#### `save_changes` (或 `<TOOL_PREFIX>_save_changes`)
在推送前保存待处理修改。记录修改的文件和修改内容以供推送前审查。

**参数：**
- `files` (array, 必需): 修改的文件路径数组
- `content` (string, 必需): 修改内容的描述

**示例：**
```json
{
  "name": "save_changes",
  "arguments": {
    "files": ["src/main.js", "src/utils.js"],
    "content": "修复用户认证中的bug"
  }
}
```

#### `get_pending_changes` (或 `<TOOL_PREFIX>_get_pending_changes`)
获取并审查推送前的待处理修改。必须在使用 git_push 前调用此工具来启用推送。

**重要：** 调用此工具会将修改标记为已审查，从而允许 git_push 继续执行。每次推送尝试后审查状态都会重置。

**参数：**
- `limit` (number, 可选): 返回的修改数量（1-1000，默认：1000 - 显示所有修改）
- `offset` (number, 可选): 分页偏移量（默认：0）

## 命令映射

服务器执行以下 git 命令：

```bash
cd <PROJECT_PATH>
git push <REMOTE_NAME> <LOCAL_BRANCH>:<REMOTE_BRANCH> --progress
```

例如，使用默认设置：
```bash
cd /path/to/project
git push origin main:main --progress
```

## 验证

服务器在启动时执行以下验证：

1. 检查必需的环境变量
2. 验证 `PROJECT_PATH` 路径是否存在
3. 确保 `PROJECT_PATH` 是有效的 git 仓库（包含 `.git` 目录）

## 日志记录

- 所有操作都会记录到配置的日志目录中的文件
- 维护推送历史以防止重复操作
- 操作日志包含请求/响应详情用于调试

## 错误处理

- 启动时的环境变量验证
- git 命令错误处理，包含详细的错误消息
- 所有操作和错误的自动日志记录

## 许可证

MIT