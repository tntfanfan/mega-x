# Research Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已提交投研工作台的全部浏览器功能迁移到 Mega X 公司控制台，并保持原有接口行为和现有视觉风格。

**Architecture:** 复用公司工作空间壳、认证、API 包装器、语言选择和 Tailwind 令牌。纯业务逻辑与数据移到研究模块，页面拆成研究、任务、成果、目录和对话组件；上下文切换及卸载清理在 hooks 内统一管理。

**Tech Stack:** React 18、TypeScript、React Router 6 HashRouter、Tailwind CSS、i18next、Vite 5、Node test runner。

**Spec:** `docs/superpowers/specs/2026-10-07-research-frontend-migration-design.md`

## Global Constraints

- 来源基线：`platform/ai_native@5ca0c93ed772c4a6ad0a9ce5d9e3ca17cb1142f8`；使用已提交的 11 个 workbench 文件。
- 代码、文档及验证结果只保存在本地，禁止执行 git push、远端 PR 创建、发布或部署；推送由用户操作。
- 使用 `/console/#/business/c/:companyId/research`，沿用原 `/v1/companies/...` 接口。
- 背景 `#07090F`、面板 `#0D1119`、主色 `#D4A84E`、标题 `#E8DCC8`；字体 Instrument Serif、Barlow、Share Tech Mono。
- 中文和英文完整迁移；阿拉伯语投研区明确回退英语，研究请求语言与可见文案一致。
- 状态轮询 5 秒，对话生成轮询 2 秒，能力轮询 30 秒；隐藏页面暂停不必要请求，卸载清理。
- 重试保留 `Idempotency-Key`；输入最多 4000 字符；圆桌 2～4 人；成果每次增加 200 条。
- 验证不自动创建公司、安装部门、提交研究、发送对话或取消真实任务。写接口使用受控测试响应。
- 保留后端源代码；前端生产产物不依赖后端 `/workbench/` 静态资源。

## Review Focus

- 请求发送后切换公司或会话：旧响应必须被丢弃，旧请求不能改变新页面的 busy 状态。
- 网络超时后重发：请求编号复用，修改语言、市场、公司或消息后必须获得独立编号。
- 前后端不同主机及恶意签名 URL：报告基址跟随 API，仅允许 API 来源和签名路径。
- 英语切换及受限角色：新会话隐藏原有 CN 流派，历史会话保留固定参与者和原始内容。
- React StrictMode、标签页隐藏及组件卸载：无重复写请求，轮询与订阅可回收，无过期 UI 更新。

## 文件职责

- `console/src/lib/research/types.ts`：研究能力、任务、运行、操作、人物、会话、轮次及报告绑定的接口类型。
- `console/src/lib/research/core.ts`：代码规范化、市场能力、运行阶段、请求编号和引用校验。
- `console/src/lib/research/catalog.ts`：原完整流派/人物数据与语言过滤。
- `console/src/lib/research/copy.ts`：原英文文案和纯翻译函数，保留作者文案与用户内容边界。
- `console/src/lib/research/client.ts`：对现有 API 包装器的研究接口适配、请求超时和成果 URL 校验。
- `console/src/hooks/useResearch.ts`：公司研究状态、详情、分页、操作和竞态隔离。
- `console/src/hooks/useResearchDialogue.ts`：人物/会话/轮次、草稿、幂等发送和对话轮询。
- `console/src/components/research/ResearchForm.tsx`：安装状态、能力和研究输入。
- `console/src/components/research/ResearchTasks.tsx`：筛选、列表、执行详情和运行操作。
- `console/src/components/research/ResearchOutputs.tsx`：成果、预览、下载与继续加载。
- `console/src/components/research/InvestorCatalog.tsx`：目录与人物进入讨论。
- `console/src/components/research/ResearchDialogue.tsx`：会话、角色选择、圆桌、输入和证据上下文。
- `console/src/components/research/DialogueTurns.tsx`：用户问题、单人/多人发言、引用和状态提示。
- `console/src/pages/business/company/ResearchView.tsx`：公司上下文与组件编排。
- `console/tests/research*.test.mjs`：纯逻辑、接口协议和迁移行为回归。
- `console/tests/research-browser.mjs`：受控 API 响应下的浏览器回归脚本。

## Task 1: 纯逻辑、数据与文案

**Files:** Create `types.ts`, `core.ts`, `catalog.ts`, `copy.ts` above; create `console/tests/researchCore.test.mjs`, `researchCatalog.test.mjs`, `researchCopy.test.mjs`.

**Interfaces:** `Market = "A" | "US"`; `ResearchLanguage = "zh" | "en"`; `normalTicker(value: string, market?: Market): string`; `marketCapabilities(caps: ResearchCapabilities, language: ResearchLanguage): Partial<Record<Market, MarketCapability>>`; `stageStates(run: ResearchRun): ("pending" | "current" | "complete")[]`; `requestKey(store: StorageLike, company: string, action: string, body: unknown): string`; `forgetKey(...)`; `citationTarget(conversation: Conversation, sectionId: string): string | null`; `catalogForLanguage(language: ResearchLanguage): CatalogSchool[]`; `researchLanguage(locale: string): ResearchLanguage`; `translate(language, value, ...interpolations): string`.

- [ ] Write failing tests preserving original assertions: `normalTicker("000001") === "000001.SZ"`, `normalTicker("brk.b", "US") === "BRK-B"`, stage failure at sequence 2 remains current, US supports quick only, English requires executor language support, company/market/language keys differ, known bound section yields report path, user interpolation remains unchanged, English hides original CN catalog schools, Arabic maps to English.
- [ ] Run `node --test console/tests/researchCore.test.mjs console/tests/researchCatalog.test.mjs console/tests/researchCopy.test.mjs`; confirm failure comes from absent migration modules.
- [ ] Implement the declared modules from source HEAD, using the repository's TypeScript transpilation test pattern. Keep exact directory membership, persona IDs, school descriptions, original literal translations and immutable participant snapshots.
- [ ] Re-run the same command; all tests pass. Commit only Task 1 files locally.

## Task 2: API 适配与安全成果链接

**Files:** Create `client.ts`; create `console/tests/researchClient.test.mjs`; reuse `console/src/lib/api.ts` and `outputs.ts` unchanged when their existing init parameters suffice.

**Interfaces:** `createResearchClient(transport: ResearchTransport, apiBase: string, pageOrigin: string): ResearchClient`; transport exposes existing typed `get(path, init?)` and `post(path, body?, init?)`. Client exposes `department(companyId)`, `tasks(companyId)`, `task(companyId, taskId)`, `outputs(companyId, limit, taskId?)`, `operation(operationId)`, `install(companyId)`, `restart(companyId)`, `submit(companyId, request, key)`, `retry(companyId, taskId, key)`, `resume(companyId, taskId, runId)`, `cancel(companyId, taskId, runId)`, `personas(companyId)`, `dialogueCapabilities(companyId)`, `conversations(companyId, limit)`, `conversation(companyId, conversationId)`, `turns(companyId, conversationId)`, `createConversation(companyId, request)`, `sendTurn(companyId, conversationId, request, key)`, `preview(companyId, path)` and `downloadUrl(companyId, path)`.

- [ ] Write failing protocol tests using recording transport: submission/retry/send retain `Idempotency-Key`; report creation includes only `task_id` and `run_id`; encoded IDs cannot alter URL path; unavailable historical operation does not reject research state; relative preview resolves to API host; foreign host, non-HTTP scheme and non-signature path throw; download escapes output path.
- [ ] Run `node --test console/tests/researchClient.test.mjs`; confirm absent client failure.
- [ ] Implement endpoints exactly from source app/dialogue modules with a 20-second timeout and existing cookie behavior. Do not retry writes automatically. For historical operation return an explicit unavailable result.
- [ ] Re-run test; all assertions pass. Commit Task 2 locally.

## Task 3: 研究、任务与成果页面

**Files:** Create `useResearch.ts`, `ResearchForm.tsx`, `ResearchTasks.tsx`, `ResearchOutputs.tsx`, `ResearchView.tsx`; create `console/tests/researchState.test.mjs`.

**Interfaces:** `useResearch(companyId: string, language: ResearchLanguage, client: ResearchClient)` returns department/tasks/selected task/outputs/operation/error/loading/busy/syncedAt, `refresh`, `selectTask`, `loadMore`, `install`, `restart`, `submit`, `retry`, `resume`, `cancel`. Components take this state and translated copy; `ResearchView` consumes `CompanyOutlet` and current i18next language. A generation token checks company and selected task identity before applying a response.

- [ ] Add failing state tests: old company or task generation is rejected; failure clears its own operation only; identical timed-out submissions reuse the original key; terminal/paused states expose only source-supported actions; cancelled poll does not update state; hidden documents suppress polling.
- [ ] Run `node --test console/tests/researchState.test.mjs`; expected red assertions for missing state helpers.
- [ ] Implement company-scoped loading and five-second polling, optional operation lookup, task detail loading, actions, filtering, market/depth constraints, stage rendering, output pagination and safe preview. Extract pure state helpers to `core.ts` as needed so tests exercise decisions used by hooks. Keep input state across polling and language switches.
- [ ] Run all research pure tests. Browser event coverage for hook cleanup and writes belongs to Task 6. Commit Task 3 locally.

## Task 4: 人物目录、对话和圆桌

**Files:** Create `useResearchDialogue.ts`, `InvestorCatalog.tsx`, `ResearchDialogue.tsx`, `DialogueTurns.tsx`; create `console/tests/researchDialogue.test.mjs`.

**Interfaces:** `useResearchDialogue(companyId: string, language: ResearchLanguage, client: ResearchClient)` returns capability/personas/conversations/conversation/turns/mode/participants/persona/message/busy/error/report and `selectMode`, `selectPersona`, `toggleParticipant`, `openConversation`, `newConversation`, `openReport`, `setMessage`, `send`, `loadMore`. `InvestorCatalog.onSelect(personaId)` selects a new single-person discussion. `ResearchTasks.onDiscuss({task_id, run_id})` creates a new report-bound context. `DialogueTurns` receives a conversation and `onCitation(path)`.

- [ ] Write failing tests for 2–4 participants and source ordering; immutable historical participants; language-aware draft/request keys; same failed message retry; stale company/role/conversation responses; report selection retained when changing roles/mode; safe report identity; known-section citations only; 4000 accepted and 4001 rejected; raw generated text not interpreted as HTML.
- [ ] Run `node --test console/tests/researchDialogue.test.mjs`; verify missing-module/behavior failures.
- [ ] Implement the original capabilities/persona/list/detail/turn protocols, draft restoration and active conversation restoration. Poll generating turns every 2 seconds and capabilities every 30 seconds. Cancel timers and pending reads on unmount; generation guards isolate in-flight writes. Preserve completed speeches, truncation, coverage, citation warning and evidence metadata. Disable participant changes for persisted roundtables.
- [ ] Run research tests; connect catalog and report actions to the dialogue component. Commit Task 4 locally.

## Task 5: 控制台入口与视觉整合

**Files:** Modify `console/src/App.tsx`, `console/src/pages/business/company/CompanyShell.tsx`, `console/src/i18n/en.json`, `zh.json`, `ar.json`; add scoped research rules in `console/src/styles/globals.css` only where layout needs them; modify `README.md`.

**Interfaces:** New company child route `research`; sidebar translation key `business.company.tab.research`. Research copy follows active i18next language without additional language selector. Existing `/business/companies/new` and CompanySwitcher provide all company creation/switching actions.

- [ ] Write navigation/render checks for company research route, Chinese/English title and labels, English fallback under Arabic, absence of links to backend `/workbench/`, and existing company creation/switch entry availability.
- [ ] Implement route and navigation, integrate all components and original features, and apply existing color/type/button/spacing tokens. Narrow screens stack panels and allow sidebar navigation without horizontal page overflow. English fallback region uses `lang="en" dir="ltr"` under Arabic shell.
- [ ] Update README with `pnpm install --frozen-lockfile`, `VITE_API_TARGET=http://127.0.0.1:8002 pnpm dev`, route, API-base behavior and test commands. Avoid modifying production environment credentials/configuration.
- [ ] Run `pnpm exec tsc --noEmit`, `pnpm build`, `node --test console/tests/*.test.mjs`. Compare failures with baseline, then commit Task 5 locally when new errors are resolved.

## Task 6: 浏览器回归、来源映射与交付

**Files:** Create `console/tests/research-browser.mjs`, `docs/research-frontend-migration.md`; update task checkboxes in this plan after verified completion.

**Interfaces:** Browser script accepts preview URL and an explicit Playwright runtime path if not installed in this repo. Intercepts `/v1` for all mutation scenarios; real API verification performs only reads. The mapping document connects all 11 source files to destination modules and records baseline SHA and commands/results.

- [ ] Add browser assertions for market/depth restrictions, installation states, submission timeout/key reuse, task controls, bound report discussion, persona switching, roundtable 2–4 selection/order, history pagination, content escaping, signature preview, language switching and preserved input.
- [ ] Add races/cleanup assertions: delayed old company and conversation responses never overwrite new selection; switching routes stops polls; StrictMode mounts do not send writes; hidden pages suppress polls; mobile widths 390px and desktop widths 1440px do not overflow; keyboard focus reaches actionable controls.
- [ ] Start local Vite with explicit API target and mock mode disabled. Run browser regression against fixtures, then read-only smoke checks against running API. Save representative desktop/mobile screenshots locally for visual review.
- [ ] Run production build, typecheck, all Console tests and `git diff --check` after any fixes. Review feature mapping against spec item by item, inspect full local diff, and record actual limitations without claiming unexecuted checks.
- [ ] Commit verified migration changes locally; report route, source coverage, test results and local commits. Never invoke push, remote PR or deployment commands.

## Plan Self-Review

All spec sections have owners: source completeness and pure logic in Task 1; API/protocol security in Task 2; research/tasks/outputs in Task 3; directory/personas/roundtables in Task 4; authentication/company reuse/style/localization/routes in Task 5; browser lifecycle and complete mapping in Task 6. The five review-focus conditions are assigned to Tasks 1–4 and exercised at the browser boundary in Task 6. Signatures share the same typed client and company/language context, avoiding parallel incompatible adapters. Execution stays local and uses no backend mutations for verification.
