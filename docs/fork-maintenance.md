# Fork 维护手册

本文档说明本 Fork（`summer-like-coding/signoz`）相对上游 `SigNoz/signoz` 的差异点与同步策略。

## 1. Fork 改动总览

| 类别       | 路径                                                             | 说明                                                  |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| 新功能     | `frontend/src/container/SpanDetailsDrawer/LLMConversation/`      | LLM 对话渲染 Tab，支持 GenAI / OpenInference 双协议   |
| 新功能集成 | `frontend/src/pages/TraceDetailsV3/SpanDetailsPanel/SpanDetailsPanel.tsx` | 条件渲染 AI Tab                                |
| 构建       | `Dockerfile.frontend`                                            | 多阶段构建，复用上游服务端镜像 + 注入自定义前端       |
| 文档       | `README.md` 顶部                                                 | Fork 构建说明 + 企业版授权声明                        |
| 文档       | `docs/fork-maintenance.md`                                       | 本文件                                                |

> 上游已在 commit `c86df3ad`（v0.124 → v0.125 之间）从 Yarn 迁移至 **pnpm 10**。本 fork 同步该决策，不再维护 yarn 制品。

## 2. 与上游同步策略

### 2.1 常规同步流程

```bash
git fetch upstream
git checkout feat-genai-ui
git rebase upstream/main
```

逐个提交解决冲突即可。若需放弃当前 rebase 并恢复到开始前状态，可使用 `git rebase --abort`；该命令不会删除原分支已有提交。遇到 hx/crossterm 编辑器崩溃问题时使用 `GIT_EDITOR=true git rebase --continue`。

### 2.2 上游 TraceDetailsV3 `SpanDetailsPanel` 变更

LLM Tab 集成在 `SpanDetailsContent` 中：合并 span 的 resource 与 attributes 得到 `llmTagMap`，以 `isAISpan(llmTagMap)` 判断是否显示 AI Tab，并用 `LLMConversationView` 渲染内容。若上游重构 Tab 结构：

- 优先解决冲突保留上游结构
- 在新结构中保留 `isAISpan(llmTagMap)` 条件及 `LLMConversationView` 渲染
- 不要回滚上游的其他 Tab 改动

### 2.3 上游 `@signozhq/ui` 迁移

上游持续将 antd 组件替换为 `@signozhq/ui/*`（Button / Switch / Tooltip / Typography / Dropdown 等）。我们的 `JsonView.tsx` 已迁移；`LLMConversation/*` 多数文件仍使用 antd（不影响功能，可作为后续重构任务）。

- 使用 `TooltipSimple` 时必须配 `TooltipProvider`（Radix 上下文要求）
- Switch 新 API：`value=` / `onChange=`（不是 antd 的 `checked=`）
- Button 新 API：`variant="ghost"` `size="icon"` `color="secondary"`

### 2.4 上游基础镜像升级

`Dockerfile.frontend` 中默认 `SIGNOZ_BASE_IMAGE` 已 pin 至 `signoz/signoz-community:v0.144.0`。
跟进上游新版本时：

1. 确认 [Docker Hub tags](https://hub.docker.com/r/signoz/signoz-community/tags) 中存在新版本
2. 同步修改 `Dockerfile.frontend` 与 `README.md` 中的 `v0.144.0` 引用
3. 本地构建烟测：`docker build -f Dockerfile.frontend -t test-signoz .`
4. 校验前端能正常加载且 LLM Tab 可用

## 3. 包管理与本地开发

本 fork 跟随上游使用 **pnpm 10**。

| 操作         | 命令                              |
| ------------ | --------------------------------- |
| 安装依赖     | `cd frontend && pnpm install --frozen-lockfile` |
| 启动开发服务 | `cd frontend && pnpm dev`         |
| 构建         | `cd frontend && pnpm build`       |
| 单测         | `cd frontend && pnpm exec jest`   |
| 类型检查     | `cd frontend && pnpm exec tsgo`   |

Lockfile：`frontend/pnpm-lock.yaml`（由 pnpm 维护，请勿手动编辑）。

### 3.1 `pnpm-workspace.yaml` 相关（上游 v0.144 起引入）

上游已把 `overrides` 从 `frontend/package.json` 迁到 `frontend/pnpm-workspace.yaml`，并新增供应链相关设置。**不要**在 `package.json` 里保留 overrides 副本 —— pnpm 10 只读 workspace 文件，残留副本会让 `--frozen-lockfile` 因 overrides 哈希不一致而失败。

- `minimumReleaseAge: 2880`（48h）：意味着**任何发布不足 48 小时的版本都无法被解析到**，升级依赖时若报 `ERR_PNPM_NO_MATURE_MATCHING_VERSION` 属预期行为。
- `minimumReleaseAgeStrict: true` 在 pnpm 10.x（含当前 pin 的 10.34.4 / CI 的 10.34.6）**不被识别**，属上游配置冗余，pnpm 会静默忽略，无需在本 fork 处理。

### 3.2 pnpm 版本 pin 与 CI 的偏差

`frontend/package.json` 的 `packageManager` 精确 pin `pnpm@10.34.4`，而上游 CI（`jsci.yaml` / `e2eci.yaml` / `goci.yaml` / `gor-*.yaml`）给 `pnpm/action-setup@v6` 传的是 `version: 10`，实际解析为 `latest-10`（当前 10.34.6）。`version` 入参优先级高于 `packageManager`，因此**本地与 Docker 用 10.34.4、CI 用 10.34.x 最新版**。精确 pin 是为 Docker 可重现构建服务的，保留即可，但升级 pin 时需知悉此偏差。

## 4. 待办与已知问题

- [ ] **i18n**：LLM 模块文案大量集中在 `frontend/public/locales/{en,en-GB}/llmConversation.json`，新增视图后需保持双语同步
- [ ] **antd → @signozhq/ui 增量迁移**：见 §2.3
- [ ] **`useSpanContextLogs` 的毫秒→秒补丁**：本 fork 修改了上游文件`SpanLogs/useSpanContextLogs.ts`（对 `startTimestampMillis` 做 `/1000`），修复上游 `prepareQueryRangePayloadV5` 期望秒而 `SpanDetailsPanel` 传入毫秒的单位不一致。这是**对上游文件的 fork 补丁**：若上游日后自行修复该单位问题，rebase 时勿直接取 `ours`，否则会二次换算。
- [ ] **`LinkedSpans.isSpanReference` 收窄**：本 fork 要求 `traceId`/`spanId`/`refType` 三者均为 `string`，而后端这些字段带 `omitempty`，字段缺失的引用会被静默丢弃，导致 linked span 计数与上游/API 不一致。上游原逻辑仅校验 `refType !== 'CHILD_OF'`。
- [ ] **`remark-gfm` 精确 pin**：`package.json` 中 pin 为 `3.0.1`（上游为 `^3.0.1`），当前二者解析结果一致，故暂时无害；但上游一旦为 CVE 提升 `remark-gfm` 版本，精确 pin 会直接导致 lockfile 失败。pin 的原因未记录在案。
- [ ] **`.ignore` 文件**：仅为 ripgrep 生效（`.ignore` 优先级高于 `.gitignore`），对 git 与 Docker 无效；`.slim/deepwork/` 无任何被跟踪文件，容易误导读者以为那是仓库产物路径。
- [ ] **对上游文件的全局行为改动**：`periscope/components/JsonView/JsonView.tsx` 将上游的 `scrollbar: hidden` 改为 `auto`，`JsonView.styles.scss` 还用 `!important` 覆盖了 Monaco 的行宽 —— 这些会影响**所有** `JsonView` 使用方（含上游 DataViewer 的 JSON tab），不限于 LLM 面板。

## 5. 联系与回流

- Fork 维护者：见 git log
- 回流上游：LLM 模块功能完善后可考虑向 SigNoz 上游提 PR
