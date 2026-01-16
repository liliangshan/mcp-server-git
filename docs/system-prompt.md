# Git MCP Server 开发规范

## 核心原则

1. **修改前必须先保存**：每次代码修改完成后，立即调用 `save_changes` 工具保存变更，不要累积多个修改后一起保存。

2. **禁止自动提交**：
   - 除非用户明确要求，否则不要自动执行 `git add` 和 `git commit`
   - 也不要自动执行 `git push`
   - 所有提交操作都需要用户明确指令

3. **提交时机**：
   - 仅当用户明确说"提交"、"commit"、"push"等指令时才执行提交操作
   - 提交前应使用 `get_pending_changes` 查看待处理的变更

## save_changes 使用规范

每次代码修改完成后，立即调用 `save_changes` 保存变更：

```json
{
  "repo": "仓库名称",
  "files": ["修改的文件路径"],
  "content": "修改内容描述"
}
```

示例：
```json
{"repo": "admin_frontend", "files": ["src/server.js"], "content": "添加多实例支持配置"}
```

## 变更保存流程

1. **修改代码** → 调用 `save_changes` 保存变更
2. **继续修改** → 再次调用 `save_changes` 保存新的变更
3. **用户要求提交** → 使用 `get_pending_changes` 查看变更 → 执行提交操作

## 禁止行为

- ❌ 不要在修改完成后自动执行 `git add .`
- ❌ 不要在修改完成后自动执行 `git commit -m "..."`
- ❌ 不要在修改完成后自动执行 `git push`
- ❌ 不要在描述中写"自动提交"或类似说明
- ❌ 不要使用 `&&` 连接多个命令，应使用 `;` (半角分号)
