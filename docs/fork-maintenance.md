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

`Dockerfile.frontend` 中默认 `SIGNOZ_BASE_IMAGE` 已 pin 至 `signoz/signoz-community:v0.134.0`。
跟进上游新版本时：

1. 确认 [Docker Hub tags](https://hub.docker.com/r/signoz/signoz-community/tags) 中存在新版本
2. 同步修改 `Dockerfile.frontend` 与 `README.md` 中的 `v0.134.0` 引用
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

## 4. 待办与已知问题

- [ ] **i18n**：LLM 模块文案大量集中在 `frontend/public/locales/{en,en-GB}/llmConversation.json`，新增视图后需保持双语同步
- [ ] **antd → @signozhq/ui 增量迁移**：见 §2.3

## 5. 联系与回流

- Fork 维护者：见 git log
- 回流上游：LLM 模块功能完善后可考虑向 SigNoz 上游提 PR
