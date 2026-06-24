/**
 * Mock fixtures for the **For Builders** Studio (v0 skeleton).
 *
 * Shapes deliberately mirror what the future `/v1/dev/depts/*` API will return
 * so swapping mock → real backend is a one-line change in mocks.ts. See the
 * design in [doc/product/builders-studio-prd.md](e:\lgh\tools\ai_native\doc\product\builders-studio-prd.md).
 *
 * Sample content (chat text, file bodies, dept names) is fixture data — NOT
 * UI chrome — so it stays inline and untranslated, same convention as the
 * buyer-side COMPANIES/TASKS fixtures.
 */

import type { AgentTeamRole, AgentTier } from "./fixtures";

export type DraftState = "draft" | "in_review" | "published";

/** Rough mock cost weight per task by model tier (元), drives the cost meter. */
export const TIER_COST: Record<AgentTier, number> = { HIGH: 0.1, MEDIUM: 0.04, LOW: 0.01 };

export function estCostPerTask(agents: { tier: AgentTier }[]): number {
  return agents.reduce((s, a) => s + (TIER_COST[a.tier] ?? 0), 0);
}

export interface DraftAgent {
  slug: string;
  display_name: string;
  team_role: AgentTeamRole; // orchestrator | builder | reviewer | ops
  tier: AgentTier;          // HIGH | MEDIUM | LOW
}

export interface DraftFile {
  name: string;             // "SOUL.md" | "AGENTS.md" | ...
  content: string;
  /** Mock "last change" hunk for the diff toggle. */
  diff?: { kind: "add" | "del" | "ctx"; text: string }[];
}

export interface ChatMsg {
  id: string;
  role: "user" | "copilot";
  text: string;
}

export interface BuilderDraft {
  id: string;
  name: string;
  emoji: string;
  mission: string;
  state: DraftState;
  source: "blank" | "fork";
  forked_from?: string;     // e.g. "dept-pub"
  price_monthly: number;
  install_count: number;
  earnings_30d: number;
  agents: DraftAgent[];
  files: DraftFile[];
  skills: { name: string; desc: string }[];
  chat: ChatMsg[];
}

/** Lightweight card shape for the MyDepts gallery. */
export type DraftCard = Pick<
  BuilderDraft,
  "id" | "name" | "emoji" | "mission" | "state" | "install_count" | "earnings_30d"
> & { agent_count: number };

const LOCALIZATION: BuilderDraft = {
  id: "d-localization",
  name: "本地化部门",
  emoji: "🌐",
  mission: "游戏 UI 文案多语言翻译 + 术语库一致性校验",
  state: "draft",
  source: "fork",
  forked_from: "dept-pub",
  price_monthly: 199,
  install_count: 0,
  earnings_30d: 0,
  agents: [
    { slug: "lead", display_name: "本地化部门长", team_role: "orchestrator", tier: "HIGH" },
    { slug: "translator-1", display_name: "译者①", team_role: "builder", tier: "MEDIUM" },
    { slug: "translator-2", display_name: "译者②", team_role: "builder", tier: "MEDIUM" },
    { slug: "reviewer", display_name: "审校", team_role: "reviewer", tier: "HIGH" },
  ],
  skills: [{ name: "glossary_lookup", desc: "术语库一致性校验（接术语库 MCP）" }],
  files: [
    {
      name: "SOUL.md",
      content: `# 本地化部门长 · SOUL

## Role
统筹游戏 UI 文案的多语言翻译，拆解任务、分派给译者、把关术语一致性。

## 信条
- 术语优先于直译：先查术语库，再翻译。
- 语境 > 字面：UI 文案要符合按钮/弹窗的物理位置与长度约束。

## 边界
- 不擅自改动源语言文案，只产出译文与术语建议。
- 不接触计费 / 账号体系。

## 工作流
1. 接收待翻译字符串集 + 目标语言。
2. 查术语库 → 拆分 → 分派译者 → 审校把关 → 交付。
`,
    },
    {
      name: "AGENTS.md",
      content: `# 团队概览

| 角色 | Team Role | Lifecycle | Model tier | SOUL.md path |
|---|---|---|---|---|
| 本地化部门长 | orchestrator | persistent | HIGH | — |
| 译者① | builder | per-task | MEDIUM | agents/translator-1/SOUL.md |
| 译者② | builder | per-task | MEDIUM | agents/translator-2/SOUL.md |
| 审校 | reviewer | per-task | HIGH | agents/reviewer/SOUL.md |
`,
      diff: [
        { kind: "ctx", text: "| 译者① | builder | per-task | MEDIUM | agents/translator-1/SOUL.md |" },
        { kind: "ctx", text: "| 译者② | builder | per-task | MEDIUM | agents/translator-2/SOUL.md |" },
        { kind: "add", text: "| 审校 | reviewer | per-task | HIGH | agents/reviewer/SOUL.md |" },
      ],
    },
  ],
  chat: [
    { id: "m1", role: "user", text: "从官方 dept-pub fork 一个本地化部门：1 个部门长 + 2 译者，专注游戏 UI 文案，要接术语库 MCP。" },
    { id: "m2", role: "copilot", text: "已从 dept-pub 起草「本地化部门」🌐：1 部门长 + 2 译者，挂了一个 glossary_lookup skill 占位（接术语库 MCP）。右侧可看 SOUL / AGENTS / 预览。" },
    { id: "m3", role: "user", text: "加一个审校。" },
    { id: "m4", role: "copilot", text: "已加「审校」（reviewer，HIGH 档）。AGENTS 团队概览表新增一行——切到 AGENTS.md 点「查看改动」可看 diff。要不要把译者设成 MED 档以下？这样买家每次任务更便宜。" },
  ],
};

const SEO: BuilderDraft = {
  id: "d-seo",
  name: "SEO 落地页专家",
  emoji: "🔍",
  mission: "落地页优化 + 关键词研究 + 结构化数据",
  state: "published",
  source: "blank",
  price_monthly: 299,
  install_count: 218,
  earnings_30d: 6483,
  agents: [
    { slug: "lead", display_name: "SEO 部门长", team_role: "orchestrator", tier: "HIGH" },
    { slug: "writer", display_name: "落地页写手", team_role: "builder", tier: "MEDIUM" },
    { slug: "auditor", display_name: "技术审计", team_role: "reviewer", tier: "HIGH" },
  ],
  skills: [{ name: "serp_scrape", desc: "SERP 抓取 + 竞品标题分析" }],
  files: [
    { name: "SOUL.md", content: "# SEO 部门长 · SOUL\n\n## Role\n以搜索意图为中心优化落地页…\n" },
    { name: "AGENTS.md", content: "# 团队概览\n\n| 角色 | Team Role | Lifecycle | Model tier | SOUL.md path |\n|---|---|---|---|---|\n| SEO 部门长 | orchestrator | persistent | HIGH | — |\n" },
  ],
  chat: [
    { id: "m1", role: "copilot", text: "「SEO 落地页专家」已上架，近 30 天 218 装机。要发新版本就直接在这里改组，提交后进审核。" },
  ],
};

/** A blank starting point for `/dev/depts/new/studio`. */
export const NEW_DRAFT: BuilderDraft = {
  id: "new",
  name: "未命名部门",
  emoji: "✨",
  mission: "",
  state: "draft",
  source: "blank",
  price_monthly: 0,
  install_count: 0,
  earnings_30d: 0,
  agents: [{ slug: "lead", display_name: "部门长", team_role: "orchestrator", tier: "HIGH" }],
  skills: [],
  files: [
    { name: "SOUL.md", content: "# 部门长 · SOUL\n\n## Role\n（描述这个部门长负责什么）\n\n## 信条\n\n## 边界\n\n## 工作流\n" },
    { name: "AGENTS.md", content: "# 团队概览\n\n| 角色 | Team Role | Lifecycle | Model tier | SOUL.md path |\n|---|---|---|---|---|\n| 部门长 | orchestrator | persistent | HIGH | — |\n" },
  ],
  chat: [
    { id: "m1", role: "copilot", text: "嗨，我是 Recruiter。用一句话告诉我你想要一个什么部门，或者说「从官方 dept-xxx fork」，我来起草。" },
  ],
};

export const BUILDER_DRAFTS: BuilderDraft[] = [LOCALIZATION, SEO];

export function draftToCard(d: BuilderDraft): DraftCard {
  return {
    id: d.id, name: d.name, emoji: d.emoji, mission: d.mission, state: d.state,
    install_count: d.install_count, earnings_30d: d.earnings_30d, agent_count: d.agents.length,
  };
}
