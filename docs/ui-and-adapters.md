# 本地 UI 服务与适配器检查（运维与安全）

本文说明 `agentarena ui` 的绑定地址、鉴权行为，以及 `doctor` / `preflight` 的结果语义，避免「看起来能用」的误判。

## `agentarena ui`：监听地址与鉴权

- **本地模式**：UI 只允许绑定 `127.0.0.1`、`localhost`、`::1` 或 `::ffff:127.0.0.1`，默认使用 `127.0.0.1:4320`。不支持局域网或公网访问。
- **敏感路径**（即使在本机、即使是 GET）：必须经过鉴权，例如：
  - `/api/run`、`/api/run/cancel`
  - `/api/preflight`
  - `/api/create-adhoc-taskpack`
  - `/api/provider-profiles` 及其子路径（含密钥相关）
- **令牌**：默认进程启动时生成随机 UUID；也可用 **`--auth-token <secret>`** 固定。浏览器侧由前端存储并在 `apiFetch` 中附加（参见 web-report `app-helpers`）。

## 任务包的本地信任边界

- 任务包可以定义准备、检查和清理命令，因此它本质上是可执行输入。文件保存在本机，不代表文件本身可信。
- 只运行来源明确、内容经过检查的任务包。社区任务包会在页面中显示提醒。
- 本地模式只接受当前仓库或随程序提供的内置仓库，不接受任务包指定的外部仓库网址。
- 任务包不能通过 `envAllowList` 继承本机的 Git 登录辅助设置。确有需要时，只能由操作者通过 `AGENTARENA_EXTRA_ENV` 明确允许。

## Codex / Claude Code 本地配置边界

- Codex 的模型和推理等级留空时，运行会直接使用当时的本地登录与配置；如果设置了 `CODEX_HOME`，检查和正式运行都会使用该目录。页面里检测到的默认值只用于说明，不会自动固定成一次运行覆盖。
- Claude Code 内置官方 Profile 直接使用当前本地登录和个人配置；如果设置了 `CLAUDE_CONFIG_DIR`，正式运行会沿用它。AgentArena 不主动修改个人配置，但 Claude Code 自身仍可能正常更新缓存、历史或登录状态。
- Claude Code 第三方 Profile 使用每次新建的临时配置目录，不读取当前官方登录、个人规则、插件或 MCP。连接测试与正式运行使用同一隔离规则，结束后清理临时配置。
- 第三方临时仓库仍保留 `AGENTS.md`、`CLAUDE.md`，但在建立 Git 基线前移除根目录 `.claude/`、`.codex/` 和 `.mcp.json`，因此隔离动作不会被算成智能体修改。
- Claude Code 的官方与第三方模式都要求操作者在启动 AgentArena 时明确设置 `AGENTARENA_SKIP_PERMISSIONS=1`，才允许无人值守修改临时仓库；未设置时页面和正式预检都会在运行前阻止并说明原因。
- Provider 的 `extraEnv` 不能覆盖隔离目录、系统启动路径、专用地址、模型或密钥字段。已有 Profile 如果包含这些冲突字段，会在修正前被阻止运行。

## `doctor` 与 `preflight`：失败语义

二者都会调用适配器的 **`preflightAdapters`**（UI 中 `/api/preflight` 同理），带 `--probe-auth` 时会尝试探测登录态。

| 现象 | 含义（概要） |
|------|----------------|
| `status: "ready"` | CLI 在 PATH 中可用，基础检查通过；若探测 auth，通常表示关键凭证可用（具体依适配器）。 |
| `status: "unverified"` | 适配器未报错但未完成认证探测（例如未使用 `--probe-auth`）；**不代表已登录**。 |
| `status: "missing"` | 未找到 Agent CLI 或可执行入口。 |
| `status: "blocked"` | 版本/配置不满足要求，或认证探测失败；**不应理解为「agent 已可用」**。 |
| UI 返回 500 + `"Internal server error"` | 服务端捕获未预期异常；查看终端日志中的 `[agentarena] Preflight failed:`。 |
| `doctor --strict` | 任一选中适配器未就绪则 **进程退出码非 0**，适合 CI。 |

**注意**：外部 CLI（Codex、Claude Code、Cursor 等）随厂商升级行为会变；**同一退出码在不同版本下含义可能不同**。合约测试保障 JSON 形状稳定，**不保障**第三方 CLI 长期行为不变。

## 相关自动化测试（契约）

| 区域 | 测试文件 |
|------|-----------|
| HTTP 鉴权、CORS、限流 | `tests/server-unit.test.mjs` |
| `/api/*` 处理器 JSON 形状 | `tests/api-routes.test.mjs`、`tests/contracts-http-api.test.mjs` |
| Trace JSONL / TraceEvent | `tests/trace.test.mjs`、`tests/trace-event-contract.test.mjs` |
| Community / publish 条目字段 | `tests/publish.test.mjs`、`tests/publish-schema-contract.test.mjs` |

修改 `packages/cli/src/commands/api-routes.ts`、`packages/cli/src/server.ts` 或 `packages/core` 中社区/trace 类型时，请同步运行 **`pnpm test`** 并更新上表相关测试。
