# Codex / Claude Code 双模式配置实施计划

日期：2026-07-13
状态：实施完成并通过最终验证（2026-07-14）
范围：仅本地运行；不引入远程账户、多用户或云端配置同步

## 1. 目标

让 AgentArena 对 Codex 和 Claude Code 的本地运行行为变得明确、可验证：

1. 用户选择官方订阅时，直接使用当前机器上已经登录并配置好的官方命令行工具。
2. 用户选择 Claude Code 第三方 Provider 时，使用 AgentArena 保存的 Provider 信息，在全新的临时配置环境中完成鉴权检查和任务执行。
3. 第三方模式不得读取当前 Claude 官方登录、个人设置、插件、MCP 连接或个人规则。
4. 两种模式都只在 AgentArena 的临时仓库副本中修改任务代码，不主动修改原仓库或用户个人配置。
5. 项目说明文件继续生效；项目工具配置只在第三方模式中隔离。

## 2. 完成标准

只有同时满足以下条件，才算实施完成：

- 官方 Codex 使用当前登录和当前 `CODEX_HOME`；未设置时使用默认 Codex 目录。
- 官方 Claude Code 使用当前登录和当前 `CLAUDE_CONFIG_DIR`；未设置时使用默认 Claude 目录。
- 官方模式不生成替代用户配置，不启用忽略用户配置的参数。
- 第三方 Claude 的鉴权检查和正式执行都使用同一个隔离环境构造入口。
- 每次第三方检查、每次第三方运行都有不同的临时配置目录，并能在成功、失败、超时和取消后清理。
- 第三方环境只保留系统启动所需变量，并使用 AgentArena Profile 明确提供的地址、模型、密钥和附加环境。
- 第三方临时仓库保留仓库中的 `AGENTS.md`、`CLAUDE.md`，并排除仓库根目录的 `.claude/`、`.codex/`、`.mcp.json`。
- 隔离动作在 Git 基线建立前完成，不会被计为智能体修改。
- 第三方运行无法确认隔离能力时必须停止并给出升级提示，不能退回读取个人配置。
- 页面清楚说明两种模式的差异和外部命令行工具可能产生的正常本地写入。
- 编译、类型检查、静态检查、目标测试、完整测试、页面流程和真实命令行检查全部通过。

## 3. 模式契约

### 3.1 自动判定规则

不新增独立的“模式”字段，避免它与 Provider 选择互相矛盾。

- Codex：当前产品只支持官方本地模式。
- Claude Code：由已解析 Profile 的 `kind` 决定。
  - `official`：官方本地模式。
  - 其他类型：第三方隔离模式。
- `providerProfileId` 为空或指向内置官方 Profile 时，结果都必须是官方模式。
- 保存过的第三方 Profile 不需要迁移；现有接口格式保持不变。

### 3.2 行为矩阵

| 项目 | Codex 官方 | Claude 官方 | Claude 第三方 |
|---|---|---|---|
| 登录来源 | 当前 Codex 登录 | 当前 Claude 登录 | AgentArena 保存的 Provider 密钥 |
| 个人配置 | 完整读取 | 完整读取 | 不读取 |
| 自定义配置目录 | 尊重 `CODEX_HOME` | 尊重 `CLAUDE_CONFIG_DIR` | 强制覆盖为全新临时目录 |
| 插件 / MCP / 个人规则 | 按当前本地配置 | 按当前本地配置 | 禁止读取 |
| 项目说明文件 | 保留 | 保留 | 保留 |
| 项目工具配置 | 保持现有行为 | 保持现有行为 | 从临时仓库副本中隔离 |
| 会话过程文件 | 使用临时会话行为 | 不保存会话 | 不保存会话，并清理临时配置 |
| AgentArena 是否改个人配置 | 否 | 否 | 否 |

说明：官方模式只保证 AgentArena 不主动改个人配置。Codex 或 Claude Code 自身仍可能按其正常行为更新缓存、历史记录或登录状态，页面必须如实提示。

## 4. 设计选择

### 4.1 采用的方案：按 Profile 类型准备运行环境

建立一个 Claude 运行环境准备入口。它根据已解析的 Profile 返回：

- 当前模式；
- 进程环境；
- 需要追加的命令参数；
- 临时配置目录信息；
- 必须执行的清理动作。

官方模式返回当前本地环境，不创建临时配置。第三方模式创建独立配置目录、清除继承的 Provider 配置、加入 Profile 配置，并返回清理动作。

鉴权检查和正式执行必须调用同一个入口，不能再分别拼装环境。

### 4.2 不采用的方案

1. 不增加一个独立的 `runtimeMode` 请求字段。现有 Profile 类型已经能够唯一判断，新增字段只会制造冲突状态。
2. 不对所有 Claude 运行一律隔离。这样会破坏官方订阅读取当前登录和个人配置的目标。
3. 不把 `.codex`、`.mcp.json` 加入全局仓库忽略列表。那会改变 Codex、Claude 官方模式和其他智能体的项目上下文。
4. 不复制官方登录文件到临时目录。Claude 官方登录已验证不能靠简单复制可靠恢复，而且用户已经选择直接使用当前官方配置。

## 5. 实施步骤

所有步骤按测试先行执行。每一步先补失败测试，再写最小实现，使测试通过后才进入下一步。

### 第 1 步：固定双模式契约

目标文件：

- `packages/core/src/types/agent.ts`
- `packages/adapters/src/runtime-resolution.ts`
- `tests/adapters.test.mjs`
- `tests/provider-profiles.test.mjs`

工作内容：

1. 保持外部请求结构不变，继续通过 `providerProfileId` 选择 Claude Profile。
2. 在适配器内部定义清晰的官方模式与第三方隔离模式，不把内部模式暴露成新的用户配置字段。
3. 测试 `providerProfileId` 为空、官方 ID、第三方 ID 三种输入，确保模式判定唯一且稳定。
4. 确认运行结果继续记录 Provider 名称、类型和来源，报告格式不回退。

完成条件：模式判定测试全部通过，现有保存数据和接口无需迁移。

### 第 2 步：让 Codex 官方模式真正沿用当前配置

目标文件：

- `packages/adapters/src/runtime-resolution.ts`
- `packages/adapters/src/codex-adapter.ts`
- `apps/web-report/src/launcher/module.js`
- `tests/adapters.test.mjs`
- `scripts/run-web-report-e2e.mjs`

工作内容：

1. 读取 Codex 默认配置时，优先使用当前 `CODEX_HOME`，未设置时才读取默认目录。
2. Codex 正式执行时显式保留当前 `CODEX_HOME`，确保运行前显示、鉴权检查和实际 CLI 使用同一目录。
3. 不加入忽略用户配置的参数，不创建 AgentArena 专属 Codex 用户配置目录。
4. 新建 Codex 默认选项时，模型和推理等级保持为空；页面只显示当前检测值作为说明和占位提示。
5. 用户主动填写模型或推理等级时，仍视为本次运行的显式覆盖。
6. 已保存的旧选项如果带有明确模型或推理等级，继续按原行为运行，不做数据迁移。

测试重点：

- 自定义 `CODEX_HOME` 下的配置能被解析并用于执行环境。
- 默认空值不会被页面重新提交成固定覆盖。
- 显式填写仍然优先于本地默认值。
- 运行参数继续保留临时会话行为。

完成条件：Codex 默认运行使用运行当下的本地配置，页面不再暗中固定检测值。

### 第 3 步：建立 Claude 共用运行环境准备入口

目标文件：

- 新建 `packages/adapters/src/claude-runtime-environment.ts`
- `packages/adapters/src/claude-provider-profiles.ts`
- `packages/adapters/src/index.ts`
- `tests/adapters.test.mjs`

工作内容：

1. 新模块只负责“官方直用或第三方隔离”的环境生命周期，不负责 Provider 的增删改。
2. 官方模式：
   - 不创建配置目录；
   - 不生成 `.claude/settings.local.json`；
   - 不注入第三方地址、密钥或兼容设置；
   - 显式保留当前 `CLAUDE_CONFIG_DIR`，其余使用当前官方登录和个人配置。
3. 第三方模式：
   - 使用系统临时目录为每次操作创建唯一根目录；
   - 在根目录内创建新的 Claude 配置目录；
   - 设置新的 `CLAUDE_CONFIG_DIR`；
   - 先移除继承环境中的 `CLAUDE_CONFIG_DIR`、Anthropic 地址/模型/密钥变量，以及 Claude 切换 Bedrock、Vertex、Foundry 的开关；普通任务明确允许的 AWS、Google 等工具凭据不因本功能被全局删除；
   - 再加入 AgentArena Profile 中保存的地址、模型、密钥和允许的附加环境；
   - 定义不可由 `extraEnv` 覆盖的保留字段：隔离目录、系统启动路径、专用密钥、专用地址、专用模型和设置来源；Profile 的专用表单字段和 AgentArena 生成的隔离值最终优先；
   - 新保存的 Profile 若在 `extraEnv` 使用保留字段，保存时直接拒绝并指出应使用哪个专用字段；已有 Profile 若包含保留字段，运行前阻止并要求用户修正，不能静默忽略或放宽隔离；
   - 密钥只进入子进程环境，不写文件、不写日志、不写 trace。
4. 第三方命令统一追加：
   - 只读取隔离配置目录对应的用户设置来源；
   - 严格禁止自动加载项目 MCP 配置；
   - 保留现有的不保存会话行为。
5. 返回幂等清理动作；重复调用清理不能报错。
6. 如果当前 Claude Code 不支持隔离所需参数，第三方模式直接返回不可运行，并提示升级；禁止降级到非隔离方式。

测试重点：

- 官方模式不创建任何新配置文件或目录。
- 第三方模式不继承预先设置的官方密钥、地址、云平台登录和个人配置目录。
- Profile 明确保存的字段全部生效。
- 保留字段不能通过 `extraEnv` 覆盖，普通任务工具凭据仍按任务允许列表传递。
- 两次并发准备得到不同目录。
- 清理后目录不存在。
- 准备过程失败或回调抛错时仍会清理。
- 所有生成文件都不含密钥。

完成条件：环境准备入口可以独立证明官方直用和第三方隔离两种行为。

### 第 4 步：统一 Claude 鉴权检查与正式执行

目标文件：

- `packages/adapters/src/claude-adapter.ts`
- `packages/adapters/src/invocation-probes.ts`
- `tests/adapters.test.mjs`
- `tests/health-cache.test.mjs`

工作内容：

1. 删除第三方检查在 `process.cwd()` 写 `.claude/settings.local.json` 的路径。
2. Claude 官方鉴权继续在当前本地配置下执行。
3. Claude 第三方鉴权通过共用环境入口创建独立探测目录，并把隔离参数和隔离环境传给真实测试命令。
4. 独立 Provider 测试接口、统一适配器运行前检查、doctor 检查都复用相同准备逻辑。
5. 正式执行通过同一入口获得环境和参数，并在 `finally` 中清理临时配置。
6. 成功、失败、超时、取消、传输降级都必须走清理路径。
7. 健康缓存只保存结果，不保存临时路径或敏感环境；现有按 Provider 与地址失效的行为保持不变。
8. trace 只记录模式、Provider 名称和是否隔离，不记录密钥或完整环境。

测试重点：

- 在原项目放置带标记内容的 `.claude/settings.local.json`，执行第三方检查后内容和时间均不变。
- 鉴权检查子进程能看到隔离目录和 Profile 环境，看不到用户当前 Claude 配置。
- 正式执行与鉴权检查收到相同的隔离参数集合。
- 官方检查与正式执行均能看到当前官方配置目录。
- 健康缓存命中时不会留下新的临时目录。

完成条件：所有 Claude 入口都不再各自拼装配置，原项目配置不会被鉴权检查触碰。

### 第 5 步：在临时仓库中隔离第三方工具配置

目标文件：

- `packages/runner/src/workspace-operations.ts`
- `tests/runner.test.mjs`

工作内容：

1. 仓库复制完成后，根据预检结果中的 Agent 和 Provider 类型判断是否为 Claude 第三方模式。
2. 仅第三方模式从临时副本移除以下精确路径：
   - `.claude/`
   - `.codex/`
   - `.mcp.json`
3. 隔离在 Git 初始化和基线提交前完成。
4. 明确保留：
   - `AGENTS.md`
   - `CLAUDE.md`
   - 项目源代码、任务说明和普通配置。
5. 路径不存在时安静通过；删除失败时中止该智能体运行并给出明确错误，不能带着未隔离配置继续执行。
6. 记录不含敏感内容的隔离结果，便于报告说明本次运行使用了第三方隔离环境。

测试重点：

- 第三方 Claude 副本中三个工具配置路径均不存在，两个项目说明文件仍存在。
- 隔离文件不出现在智能体变更列表中。
- Claude 官方、Codex 和其他智能体的复制行为不变。
- 并发工作区互不影响，原仓库文件完全不变。

完成条件：第三方隔离只作用于自己的临时工作区，不污染比较结果和其他智能体。

### 第 6 步：补齐页面说明和失败反馈

目标文件：

- `apps/web-report/src/launcher/module.js`
- `scripts/run-web-report-e2e.mjs`
- `tests/api-routes.test.mjs`

工作内容：

1. Codex 默认选项显示：使用当前本地登录与配置；填写模型或推理等级会形成单次覆盖。
2. Claude 官方 Profile 显示：使用当前 Claude Code 登录、个人配置、插件和 MCP；AgentArena 不主动修改这些配置。
3. Claude 第三方 Profile 显示：使用全新临时配置，不读取当前官方登录、个人规则、插件或 MCP；仍保留 `AGENTS.md` 和 `CLAUDE.md`。
4. “测试连接”旁说明它使用与正式运行相同的隔离策略。
5. 第三方 CLI 版本不支持隔离时，提示升级，不给出关闭隔离继续运行的选项。
6. 清理失败时给出可理解的本地临时目录清理提示，但不显示密钥或完整环境内容。

完成条件：用户在点击运行前就能准确知道两种模式会读取什么、不会读取什么。

### 第 7 步：同步文档

目标文件：

- `docs/adapter-capabilities.md`
- `docs/http-api.md`
- `docs/ui-and-adapters.md`
- `docs/troubleshooting.md`
- `docs/DEVLOG.md`

工作内容：

1. 说明 `providerProfileId` 的自动模式语义，接口结构不变。
2. 说明官方模式与第三方隔离模式的读取边界。
3. 说明自定义 `CODEX_HOME`、`CLAUDE_CONFIG_DIR` 的行为。
4. 增加第三方隔离能力不足、临时目录清理失败的排查方式。
5. 实施完成后按仓库规则在 `DEVLOG` 记录这次架构边界调整；本次只写计划，不提前记录。

完成条件：页面、接口文档、能力说明和真实行为一致。

## 6. 测试与验证顺序

开发时每次完成一个小步骤，先运行对应包的构建和目标测试，保持测试先行的短反馈循环。

最终工程验证严格按以下顺序执行，任一步失败都只修复本功能，不处理无关问题：

1. 编译：`pnpm build`
2. 类型检查：`pnpm typecheck`
3. 静态检查：`pnpm lint`
4. 目标测试：
   - `node --test tests/adapters.test.mjs tests/provider-profiles.test.mjs tests/health-cache.test.mjs`
   - `node --test tests/runner.test.mjs tests/api-routes.test.mjs`
5. 完整单元与集成测试：`node --test --test-concurrency=1 tests/*.test.mjs`，复用第 1 步构建结果，避免再次触发构建号变更。
6. 页面端到端检查：`node scripts/run-web-report-e2e.mjs`，复用第 1 步构建结果。
7. 构建后运行检查：
   - 官方 Codex：确认读取当前登录和 `CODEX_HOME`，AgentArena 不创建或改写个人配置；记录 Codex CLI 自身可能产生的正常本地状态更新。
   - 官方 Claude：确认读取当前登录和 `CLAUDE_CONFIG_DIR`，AgentArena 不创建或改写个人配置；记录 Claude Code 自身可能产生的正常本地状态更新。
   - 第三方 Claude 连接测试：确认原项目和个人 Claude 配置哈希不变，临时配置已清理。
   - 第三方 Claude 代表性任务：确认临时仓库保留说明文件、排除工具配置，运行结束无残留配置目录。
   - doctor：使用 `node packages/cli/dist/index.js doctor --agents codex,claude-code --probe-auth --strict` 检查官方模式；第三方 Profile 追加 `--claude-profile <profile-id>` 验证同一隔离路径。
8. 并发检查：同时启动两个第三方 Claude 运行，确认配置目录和环境互不共享。
9. GitNexus 变更影响检查：运行 `detect_changes`，确认只影响预期的适配器、运行前检查、工作区准备和页面流程。
10. Git Diff 自检：确认没有格式化噪音、密钥、个人路径、无关重构或用户文件回退。

真实运行验证必须记录：原配置哈希、运行期间临时路径、运行结束后的清理结果。记录中不得包含密钥内容。

## 7. 向后兼容

- HTTP 请求和保存格式不新增必填字段。
- 已有官方 Profile 和第三方 Profile 不迁移。
- 已有第三方 Profile 如果把隔离保留字段写进 `extraEnv`，仍可读取和编辑，但在修正前不能运行；错误信息必须指出冲突字段和迁移方式。
- 已保存的 Codex 显式模型与推理等级继续生效。
- 未配置 `CODEX_HOME` / `CLAUDE_CONFIG_DIR` 的用户继续使用工具默认目录。
- Claude 官方模式不要求支持新增的第三方隔离参数。
- Claude 第三方模式要求 CLI 支持隔离参数；不支持时明确阻止运行，避免静默泄露个人配置。
- Cursor 等复用 Claude 公共传输层的适配器行为不得改变；隔离参数只从 Claude Code 第三方上层传入。

## 8. 回滚策略

本改动不迁移用户数据，因此可以按一次逻辑提交整体回滚。

回滚时必须同时回滚：

1. 共用 Claude 环境准备入口；
2. 鉴权检查与执行接入；
3. 工作区隔离；
4. 页面模式说明；
5. Codex 默认空覆盖行为。

不能只回滚其中一部分，否则会重新出现“页面承诺隔离但实际未隔离”或“检查和执行环境不同”的状态。

## 9. 实施边界与停止条件

出现以下任一情况时停止实施并重新确认方案：

- 发现 Claude Code 的隔离参数不能阻止读取个人配置或 MCP。
- 为实现隔离必须复制或修改官方登录文件。
- 必须改变现有 Provider 数据结构或要求用户重新保存密钥。
- 必须修改 Cursor 等其他适配器的运行语义。
- 工作区隔离无法在 Git 基线前完成，导致评测结果包含 AgentArena 自身的删除动作。
- 真实验证发现官方模式不能稳定使用当前自定义配置目录。
- 需要支持 Codex 第三方 Provider；这属于新的产品能力，应单独设计，不能混入本次整改。

## 10. 预计最终改动范围

核心范围：

- Codex 配置解析与执行环境
- Claude Provider 环境准备
- Claude 鉴权检查与正式执行
- 第三方 Claude 临时工作区准备
- 启动页面说明
- 适配器、运行器、页面与文档测试

明确不改：

- Provider 存储格式
- 报告和评分算法
- Repository 下载规则
- 其他智能体的配置读取方式
- 远程、多用户或云端运行模式

## 11. 实施结果

- Codex 官方模式已真实执行成功，运行时直接采用当前登录、`CODEX_HOME`、模型和推理设置。
- Claude 官方模式已真实执行成功，直接使用当前官方登录和个人配置，不生成替代配置。
- StepFun 第三方 Profile 已真实执行成功，鉴权和正式任务均使用独立临时配置；核心个人配置未变化，结束后无临时配置目录残留。
- 未明确开启无人值守权限时，Claude 官方和第三方模式都会在运行前阻止并说明原因；明确开启后两种模式均能完成真实文件修改任务。
- 第三方临时仓库保留 `AGENTS.md`、`CLAUDE.md`，并在 Git 基线前排除 `.claude/`、`.codex/`、`.mcp.json`。
- Windows 后台启动脚本不写入第三方密钥；版本检查、帮助检查、鉴权和正式任务从第一条命令起都使用隔离环境。
- 临时配置或启动目录清理失败时会明确返回失败并允许重试，不会把残留敏感信息的任务误报为成功。
- 完整构建、类型检查、静态检查通过；1096 项测试中 1095 项通过、1 项按平台条件跳过；13 项浏览器端到端检查全部通过。
