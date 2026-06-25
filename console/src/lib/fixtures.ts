/**
 * Mock fixtures for Phyntom X8 Console.
 *
 * 数据结构对齐 [doc/architecture/product-architecture.md §1.5](e:\lgh\tools\ai_native\doc\architecture\product-architecture.md)
 * 的 SQL schema：
 *   - tenant_instance     ≈ Company
 *   - departments         ≈ Dept（属于 Company）
 *   - agents (sub-agents) ≈ Agent slot in a Dept
 *   - tasks               ≈ Task dispatched to a Dept
 *   - artifacts           ≈ Artifact produced by a Task
 *
 * 切换到真后端时，这份文件的结构应该和 /v1/companies/* 返回值保持兼容
 * （字段 shape 一致），所以替换路径仅是把 mocks.ts 的 handler 改为 fetch。
 */

// ─── Companies (tenant_instance) ──────────────────────────────────────────

export type CompanyState = "running" | "paused" | "provisioning" | "error";

/** 受众：business（公司）/ solo（产线）。后端是同一张 tenant_instance 表，
 *  这个字段只决定前端用哪套术语 / 哪套视图渲染。 */
export type Audience = "business" | "solo";

export interface Company {
  id: string;
  name: string;
  description?: string;
  template_slug: string;            // e.g. "mega-x-default" / "content-newsletter"
  state: CompanyState;
  gateway_port: number;
  dept_ids: string[];               // 该公司启用的部门 id
  token_usage_30d: number;
  active_tasks: number;
  created_at: string;               // ISO8601
  emoji: string;
  last_activity_at: string;
  last_activity_text: string;

  // —— Solo 端字段（业务侧实例可不填） ——
  audience?: Audience;              // 不填默认 business
  revenue_30d?: number;             // 元
  output_count_30d?: number;        // 30 天内产出物数量
  hours_saved_30d?: number;         // 替代人工小时数
  vs_last_month?: number;           // 0.35 = +35%
}

export const COMPANIES: Company[] = [
  {
    id: "c-saas",
    name: "我的 SaaS 创业班底",
    description: "通用 21 部门完整公司，用于自己的 SaaS 产品研发与运营",
    template_slug: "mega-x-default",
    state: "running",
    gateway_port: 18789,
    dept_ids: [
      "dept-ceo", "dept-dev", "dept-ops", "dept-pub", "dept-growth",
      "dept-hr", "dept-finance", "dept-legal", "dept-research", "dept-security",
    ],
    token_usage_30d: 245_320,
    active_tasks: 4,
    created_at: "2026-05-12T08:00:00Z",
    emoji: "🏢",
    last_activity_at: "2026-06-23T16:23:00Z",
    last_activity_text: "dept-dev 完成代码评审：feat/marketplace-api",
  },
  {
    id: "c-drama",
    name: "短剧工作室",
    description: "AI 短剧脚本 + 视频生成 + 渠道发行",
    template_slug: "mcn-content-machine",
    state: "paused",
    gateway_port: 18790,
    dept_ids: ["dept-drama", "dept-cinematic", "dept-pub", "dept-ad", "dept-organic"],
    token_usage_30d: 12_400,
    active_tasks: 0,
    created_at: "2026-04-01T10:30:00Z",
    emoji: "🎬",
    last_activity_at: "2026-06-20T22:11:00Z",
    last_activity_text: "上次活跃 3 天前",
  },
  // ── Solo lines（超级个体的产线，audience=solo）──
  // 后端同样是 tenant_instance，但前端走 Solo 视图。
  {
    id: "l-newsletter",
    name: "我的 newsletter",
    description: "Substack 风格，每周一篇深度长文 + 周日 8 点定时发布",
    template_slug: "content-newsletter",
    state: "running",
    gateway_port: 18792,
    dept_ids: ["dept-pub", "dept-research", "dept-cpo"],
    token_usage_30d: 32_400,
    active_tasks: 3,
    created_at: "2026-04-15T09:00:00Z",
    emoji: "📝",
    last_activity_at: "2026-06-23T16:32:00Z",
    last_activity_text: "主笔起草中：Org-as-Code 专题",
    audience: "solo",
    revenue_30d: 4_200,
    output_count_30d: 8,
    hours_saved_30d: 36,
    vs_last_month: 0.18,
  },
  {
    id: "l-douyin",
    name: "抖音副业",
    description: "口播+剪辑流水线，每周 3 条短视频 + 月度合集",
    template_slug: "short-video",
    state: "running",
    gateway_port: 18793,
    dept_ids: ["dept-drama", "dept-cinematic", "dept-pub", "dept-ad"],
    token_usage_30d: 58_100,
    active_tasks: 2,
    created_at: "2026-03-20T19:00:00Z",
    emoji: "🎬",
    last_activity_at: "2026-06-23T14:08:00Z",
    last_activity_text: "剪辑师完成 #43 初剪",
    audience: "solo",
    revenue_30d: 9_800,
    output_count_30d: 12,
    hours_saved_30d: 64,
    vs_last_month: 0.42,
  },
  {
    id: "l-indie-saas",
    name: "我的独立 SaaS",
    description: "1 人 SaaS：产品/开发/客服/增长一条龙",
    template_slug: "indie-saas",
    state: "running",
    gateway_port: 18794,
    dept_ids: ["dept-dev", "dept-cpo", "dept-ops", "dept-growth", "dept-pub"],
    token_usage_30d: 71_200,
    active_tasks: 2,
    created_at: "2026-02-10T08:00:00Z",
    emoji: "💻",
    last_activity_at: "2026-06-23T15:11:00Z",
    last_activity_text: "全栈完成 marketplace API",
    audience: "solo",
    revenue_30d: 4_420,
    output_count_30d: 2,
    hours_saved_30d: 56,
    vs_last_month: 0.08,
  },
  // Solo 仪表盘里"上次活跃 3 天前"的副业线（已暂停）
  {
    id: "l-knowledge",
    name: "知识星球副业",
    description: "课程内容 + 答疑助手",
    template_slug: "knowledge-course",
    state: "paused",
    gateway_port: 18795,
    dept_ids: ["dept-pub", "dept-research", "dept-cpo"],
    token_usage_30d: 2_300,
    active_tasks: 0,
    created_at: "2026-05-05T08:00:00Z",
    emoji: "📚",
    last_activity_at: "2026-06-20T22:11:00Z",
    last_activity_text: "上次活跃 3 天前",
    audience: "solo",
    revenue_30d: 0,
    output_count_30d: 0,
    hours_saved_30d: 0,
    vs_last_month: -1,
  },
];

// ─── Line templates（超级个体的产线模板，对应后端 ai_native_template 的子集）─
// 每个模板预设了「该产线需要哪些部门」+「每个部门内 agent 的人话叫法」

export interface LineTemplate {
  slug: string;
  emoji: string;
  /** i18n key for the display name + description, e.g. "solo.line-tpl.content-newsletter.name" */
  name_key: string;
  desc_key: string;
  /** ai-native 部门 id 列表 */
  dept_ids: string[];
  /** 默认预估每月帮你产出 / 节省多少（用于 wizard 展示） */
  monthly_output_estimate: number;
  hours_saved_estimate: number;
}

export const LINE_TEMPLATES: LineTemplate[] = [
  {
    slug: "content-newsletter", emoji: "📝",
    name_key: "solo.line-tpl.content-newsletter.name",
    desc_key: "solo.line-tpl.content-newsletter.desc",
    dept_ids: ["dept-pub", "dept-research", "dept-cpo"],
    monthly_output_estimate: 8, hours_saved_estimate: 32,
  },
  {
    slug: "short-video", emoji: "🎬",
    name_key: "solo.line-tpl.short-video.name",
    desc_key: "solo.line-tpl.short-video.desc",
    dept_ids: ["dept-drama", "dept-cinematic", "dept-pub", "dept-ad"],
    monthly_output_estimate: 12, hours_saved_estimate: 64,
  },
  {
    slug: "indie-saas", emoji: "💻",
    name_key: "solo.line-tpl.indie-saas.name",
    desc_key: "solo.line-tpl.indie-saas.desc",
    dept_ids: ["dept-dev", "dept-cpo", "dept-ops", "dept-growth", "dept-pub"],
    monthly_output_estimate: 4, hours_saved_estimate: 48,
  },
  {
    slug: "dtc-store", emoji: "🛒",
    name_key: "solo.line-tpl.dtc-store.name",
    desc_key: "solo.line-tpl.dtc-store.desc",
    dept_ids: ["dept-pub", "dept-ad", "dept-growth", "dept-finance", "dept-organic"],
    monthly_output_estimate: 16, hours_saved_estimate: 52,
  },
  {
    slug: "knowledge-course", emoji: "📚",
    name_key: "solo.line-tpl.knowledge-course.name",
    desc_key: "solo.line-tpl.knowledge-course.desc",
    dept_ids: ["dept-pub", "dept-research", "dept-cpo", "dept-organic"],
    monthly_output_estimate: 6, hours_saved_estimate: 28,
  },
  {
    slug: "consultancy", emoji: "🎨",
    name_key: "solo.line-tpl.consultancy.name",
    desc_key: "solo.line-tpl.consultancy.desc",
    dept_ids: ["dept-research", "dept-pub", "dept-legal", "dept-finance"],
    monthly_output_estimate: 6, hours_saved_estimate: 40,
  },
];

// ─── 部门 → "小组" 的人话翻译表（Solo 端用）──
// 同一个 ai-native dept 在不同产线模板里可能叫不同名字。
// e.g. dept-pub 在 newsletter 里叫"内容组"，在 short-video 里叫"文案组"。
// 这是为了让 Solo 用户感受到"AI 团队是为我的业务量身定做的"，不是"通用模板"。

export interface GroupLabel {
  emoji: string;
  label_key: string;          // i18n key, e.g. "solo.group.content-newsletter.dept-pub.label"
  lead_title_key: string;     // 主理人叫什么，e.g. "主笔"
  helper_title_key: string;   // 助手叫什么，e.g. "写手"
  reviewer_title_key: string; // 审稿员，e.g. "审稿"
  ops_title_key: string;      // 数据员
}

/** GROUP_LABELS[template_slug][dept_id] = GroupLabel */
export const GROUP_LABELS: Record<string, Record<string, GroupLabel>> = {
  "content-newsletter": {
    "dept-pub":      { emoji: "📝", label_key: "solo.group.content.label",  lead_title_key: "solo.group.content.lead",  helper_title_key: "solo.group.content.helper",  reviewer_title_key: "solo.group.content.reviewer", ops_title_key: "solo.group.content.ops" },
    "dept-research": { emoji: "🔍", label_key: "solo.group.research.label", lead_title_key: "solo.group.research.lead", helper_title_key: "solo.group.research.helper", reviewer_title_key: "solo.group.research.reviewer", ops_title_key: "solo.group.research.ops" },
    "dept-cpo":      { emoji: "🎯", label_key: "solo.group.editor.label",   lead_title_key: "solo.group.editor.lead",   helper_title_key: "solo.group.editor.helper",   reviewer_title_key: "solo.group.editor.reviewer",   ops_title_key: "solo.group.editor.ops" },
  },
  "short-video": {
    "dept-drama":     { emoji: "📝", label_key: "solo.group.script.label",   lead_title_key: "solo.group.script.lead",   helper_title_key: "solo.group.script.helper",   reviewer_title_key: "solo.group.script.reviewer",   ops_title_key: "solo.group.script.ops" },
    "dept-cinematic": { emoji: "🎬", label_key: "solo.group.video.label",    lead_title_key: "solo.group.video.lead",    helper_title_key: "solo.group.video.helper",    reviewer_title_key: "solo.group.video.reviewer",    ops_title_key: "solo.group.video.ops" },
    "dept-pub":       { emoji: "📢", label_key: "solo.group.distribution.label", lead_title_key: "solo.group.distribution.lead", helper_title_key: "solo.group.distribution.helper", reviewer_title_key: "solo.group.distribution.reviewer", ops_title_key: "solo.group.distribution.ops" },
    "dept-ad":        { emoji: "💰", label_key: "solo.group.ads.label",      lead_title_key: "solo.group.ads.lead",      helper_title_key: "solo.group.ads.helper",      reviewer_title_key: "solo.group.ads.reviewer",      ops_title_key: "solo.group.ads.ops" },
  },
  "indie-saas": {
    "dept-dev":     { emoji: "💻", label_key: "solo.group.engineering.label", lead_title_key: "solo.group.engineering.lead", helper_title_key: "solo.group.engineering.helper", reviewer_title_key: "solo.group.engineering.reviewer", ops_title_key: "solo.group.engineering.ops" },
    "dept-cpo":     { emoji: "🎯", label_key: "solo.group.product.label",     lead_title_key: "solo.group.product.lead",     helper_title_key: "solo.group.product.helper",     reviewer_title_key: "solo.group.product.reviewer",     ops_title_key: "solo.group.product.ops" },
    "dept-ops":     { emoji: "⚙️", label_key: "solo.group.devops.label",      lead_title_key: "solo.group.devops.lead",      helper_title_key: "solo.group.devops.helper",      reviewer_title_key: "solo.group.devops.reviewer",      ops_title_key: "solo.group.devops.ops" },
    "dept-growth":  { emoji: "📈", label_key: "solo.group.growth.label",     lead_title_key: "solo.group.growth.lead",     helper_title_key: "solo.group.growth.helper",     reviewer_title_key: "solo.group.growth.reviewer",     ops_title_key: "solo.group.growth.ops" },
    "dept-pub":     { emoji: "📢", label_key: "solo.group.marketing.label",  lead_title_key: "solo.group.marketing.lead",  helper_title_key: "solo.group.marketing.helper",  reviewer_title_key: "solo.group.marketing.reviewer",  ops_title_key: "solo.group.marketing.ops" },
  },
  "knowledge-course": {
    "dept-pub":      { emoji: "📝", label_key: "solo.group.content.label",  lead_title_key: "solo.group.content.lead",  helper_title_key: "solo.group.content.helper",  reviewer_title_key: "solo.group.content.reviewer", ops_title_key: "solo.group.content.ops" },
    "dept-research": { emoji: "🔍", label_key: "solo.group.research.label", lead_title_key: "solo.group.research.lead", helper_title_key: "solo.group.research.helper", reviewer_title_key: "solo.group.research.reviewer", ops_title_key: "solo.group.research.ops" },
    "dept-cpo":      { emoji: "🎯", label_key: "solo.group.curriculum.label", lead_title_key: "solo.group.curriculum.lead", helper_title_key: "solo.group.curriculum.helper", reviewer_title_key: "solo.group.curriculum.reviewer", ops_title_key: "solo.group.curriculum.ops" },
    "dept-organic":  { emoji: "🌱", label_key: "solo.group.community.label", lead_title_key: "solo.group.community.lead", helper_title_key: "solo.group.community.helper", reviewer_title_key: "solo.group.community.reviewer", ops_title_key: "solo.group.community.ops" },
  },
};

/** 给定产线模板 + 部门 id，返回该组的人话叫法。缺省时回退到部门 catalog 默认名。 */
export function lookupGroupLabel(template_slug: string, dept_id: string): GroupLabel | null {
  return GROUP_LABELS[template_slug]?.[dept_id] ?? null;
}

// ─── Leverage KPI（杠杆指标，超级个体仪表盘头部） ────────────────────────

export interface LeverageKpi {
  output_count_30d: number;     // 跨产线月度产出
  hours_saved_30d: number;      // 月度替代人工
  revenue_30d: number;          // 月度收入
  vs_last_month: number;        // 0.35 = +35%
  active_lines: number;
  total_teammates: number;
}

// ─── Department catalog (Phyntom X8 Departments) ──────────────────────────

export interface DeptCatalogItem {
  id: string;
  name: string;
  emoji: string;
  short_desc: string;
  source_type: "builtin" | "marketplace";
  publisher?: string;
  price_monthly: number;                          // 元 / 月 ; 0 = official free
  role_count: number;
  tier_breakdown: { HIGH: number; MEDIUM: number; LOW: number };
  rating?: number;                                // 0-5
  install_count?: number;
  category: "leadership" | "engineering" | "creative" | "ops" | "finance" |
            "research" | "marketing" | "security" | "vertical";
}

export const DEPT_CATALOG: DeptCatalogItem[] = [
  { id: "dept-ceo",        name: "CEO / 总控",          emoji: "👔", short_desc: "战略 + 跨部门编排",       source_type: "builtin", price_monthly: 0, role_count: 1, tier_breakdown: { HIGH: 1, MEDIUM: 0, LOW: 0 }, category: "leadership" },
  { id: "dept-dev",        name: "研发与代码评审",       emoji: "🛠️", short_desc: "工程 + Review",          source_type: "builtin", price_monthly: 0, role_count: 6, tier_breakdown: { HIGH: 1, MEDIUM: 4, LOW: 1 }, category: "engineering" },
  { id: "dept-ops",        name: "运维与可靠性",         emoji: "⚙️", short_desc: "Infra + SRE",             source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 0, MEDIUM: 2, LOW: 2 }, category: "ops" },
  { id: "dept-pub",        name: "官方渠道发行",         emoji: "📢", short_desc: "Discord/Steam/微博",      source_type: "builtin", price_monthly: 0, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 }, category: "marketing" },
  { id: "dept-growth",     name: "增长与变现",           emoji: "📈", short_desc: "ASO + 活动 + 计价",        source_type: "builtin", price_monthly: 0, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 }, category: "marketing" },
  { id: "dept-organic",    name: "有机账号运营",         emoji: "🌱", short_desc: "X/Reddit/小红书养号",      source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 0, MEDIUM: 3, LOW: 1 }, category: "marketing" },
  { id: "dept-ad",         name: "广告投放",            emoji: "💰", short_desc: "买量 + 计费 + 投放",        source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 }, category: "marketing" },
  { id: "dept-drama",      name: "剧本与短剧",           emoji: "🎭", short_desc: "脚本 + 分镜 + 字幕",        source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 }, category: "creative" },
  { id: "dept-cinematic",  name: "影视化 CG",            emoji: "🎬", short_desc: "开场 CG / 剧情动画",       source_type: "builtin", price_monthly: 0, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 }, category: "creative" },
  { id: "dept-game",       name: "像素沙盒游戏",         emoji: "🎮", short_desc: "玩法 + 关卡 + 平衡",        source_type: "builtin", price_monthly: 0, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 }, category: "creative" },
  { id: "dept-finance",    name: "财务",                emoji: "💼", short_desc: "记账 + 报表 + 税务",        source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 }, category: "finance" },
  { id: "dept-ir",         name: "投资者关系",           emoji: "📊", short_desc: "BP + 股东沟通",            source_type: "builtin", price_monthly: 0, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 0 }, category: "finance" },
  { id: "dept-legal",      name: "法务与合规",           emoji: "⚖️", short_desc: "合同 + 隐私 + 牌照",        source_type: "builtin", price_monthly: 0, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 0 }, category: "security" },
  { id: "dept-security",   name: "安全",                emoji: "🛡️", short_desc: "AppSec + InfraSec",         source_type: "builtin", price_monthly: 0, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 1, LOW: 1 }, category: "security" },
  { id: "dept-research",   name: "研究与情报",           emoji: "🔬", short_desc: "市场 + 竞品 + 论文",        source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 }, category: "research" },
  { id: "dept-cpo",        name: "产品策略 CPO",         emoji: "🎯", short_desc: "PRD + 路线图 + KPI",        source_type: "builtin", price_monthly: 0, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 0 }, category: "leadership" },
  { id: "dept-hr",         name: "招聘与组织管理",       emoji: "👥", short_desc: "HR Skills 部门工厂",        source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 }, category: "leadership" },
  { id: "dept-production", name: "项目出品",             emoji: "📋", short_desc: "PM + 上线 + 验收",          source_type: "builtin", price_monthly: 0, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 }, category: "ops" },
  { id: "dept-panel",      name: "专家面板",             emoji: "🧠", short_desc: "7 位垂直专家",              source_type: "builtin", price_monthly: 0, role_count: 7, tier_breakdown: { HIGH: 7, MEDIUM: 0, LOW: 0 }, category: "research" },
  { id: "dept-quant",      name: "多策略量化",           emoji: "📈", short_desc: "信号 + 风险 + 执行",        source_type: "builtin", price_monthly: 0, role_count: 6, tier_breakdown: { HIGH: 2, MEDIUM: 3, LOW: 1 }, category: "vertical" },
  { id: "dept-template",   name: "HR 自检模板",          emoji: "🧪", short_desc: "测试用，可重生成",          source_type: "builtin", price_monthly: 0, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 1, LOW: 1 }, category: "research" },

  // Marketplace 第三方部门示例
  { id: "dept-mkt-seo",    name: "SEO 专家",            emoji: "🔍", short_desc: "落地页优化 + 关键词",        source_type: "marketplace", publisher: "@indie-seo", price_monthly: 299, rating: 4.6, install_count: 218, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 0 }, category: "marketing" },
  { id: "dept-mkt-ai-drama", name: "AI 短剧生成器",      emoji: "📺", short_desc: "脚本→分镜→视频一键产出",     source_type: "marketplace", publisher: "@drama-lab",  price_monthly: 499, rating: 4.3, install_count: 56,  role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 }, category: "creative" },
];

// ─── Agents in a department (per-company instance) ────────────────────────

export type AgentTeamRole = "orchestrator" | "builder" | "reviewer" | "ops";
export type AgentTier = "HIGH" | "MEDIUM" | "LOW";
export type AgentStatus = "idle" | "working" | "blocked" | "done" | "error";

export interface Agent {
  id: string;                  // unique within (company, dept)
  company_id: string;
  dept_id: string;
  slug: string;                // builder-default / orchestrator / reviewer / ops-data
  display_name: string;
  team_role: AgentTeamRole;
  tier: AgentTier;
  status: AgentStatus;
  soul_summary: string;        // 一两句描述 agent 人设
  bubble: string;              // 当前正在做什么的气泡文案
  skills_count: number;
  recent_activity: string[];   // 最近 N 条 activity text
}

// 给每家公司、每个部门生成 agents
function genAgents(): Agent[] {
  const agents: Agent[] = [];
  for (const company of COMPANIES) {
    for (const deptId of company.dept_ids) {
      const dept = DEPT_CATALOG.find((d) => d.id === deptId);
      if (!dept) continue;
      // orchestrator 一个
      agents.push({
        id: `${company.id}-${deptId}-orchestrator`,
        company_id: company.id, dept_id: deptId, slug: "orchestrator",
        display_name: `${dept.name} Lead`, team_role: "orchestrator", tier: "HIGH",
        status: company.state === "running" ? "working" : "idle",
        soul_summary: `${dept.name}的部门长，负责拆解需求并分派任务。`,
        bubble: company.state === "running" ? "正在拆解需求…" : "待命中",
        skills_count: 8 + Math.floor((deptId.length * 7) % 5),
        recent_activity: ["接收任务", "拆解为 3 个子任务", "派给 builder"],
      });
      // builders 若干
      const builderCount = Math.max(1, dept.tier_breakdown.MEDIUM);
      for (let i = 0; i < builderCount; i++) {
        agents.push({
          id: `${company.id}-${deptId}-builder-${i + 1}`,
          company_id: company.id, dept_id: deptId, slug: `builder-${i + 1}`,
          display_name: `Builder ${i + 1}`, team_role: "builder", tier: "MEDIUM",
          status: company.state === "running" && i === 0 ? "working" : "idle",
          soul_summary: `${dept.name}的 builder，专注实现具体工作。`,
          bubble: i === 0 && company.state === "running" ? `处理中 (${(deptId).split("-")[1]})` : "等待派活",
          skills_count: 12,
          recent_activity: ["接收子任务", "工作中…"],
        });
      }
      // reviewer
      if (dept.tier_breakdown.HIGH > 0 || dept.tier_breakdown.MEDIUM > 0) {
        agents.push({
          id: `${company.id}-${deptId}-reviewer`,
          company_id: company.id, dept_id: deptId, slug: "reviewer",
          display_name: "Reviewer", team_role: "reviewer", tier: "HIGH",
          status: "idle",
          soul_summary: `${dept.name}的 reviewer，把关质量与风险。`,
          bubble: "审稿待命",
          skills_count: 5,
          recent_activity: ["上次审稿 12 分钟前"],
        });
      }
      // ops
      if (dept.tier_breakdown.LOW > 0) {
        agents.push({
          id: `${company.id}-${deptId}-ops`,
          company_id: company.id, dept_id: deptId, slug: "ops",
          display_name: "Ops", team_role: "ops", tier: "LOW",
          status: "idle",
          soul_summary: `${dept.name}的 ops，处理数据收集与调度。`,
          bubble: "数据收集中",
          skills_count: 3,
          recent_activity: ["定时拉取数据", "整理日志"],
        });
      }
    }
  }
  return agents;
}

export const AGENTS: Agent[] = genAgents();

// ─── Tasks ────────────────────────────────────────────────────────────────

export type TaskState = "pending" | "in_progress" | "review" | "done" | "cancelled" | "failed";
export type ArtifactType = "markdown" | "image" | "video" | "audio" | "code" | "table" | "json" | "pdf";

export interface Task {
  id: string;
  company_id: string;
  dept_id: string;
  title: string;
  brief: string;
  state: TaskState;
  progress: number;          // 0..1
  created_at: string;
  deadline?: string;
  expected_artifacts: ArtifactType[];
  token_used: number;
  cost_yuan: number;
  artifact_ids: string[];
}

export const TASKS: Task[] = [
  {
    id: "t-001", company_id: "c-saas", dept_id: "dept-pub",
    title: "写一篇 Phyntom X8 发布博客",
    brief: "3000 字技术调性，目标读者 CTO/VP Engineering，包含产品定位+技术差异化+早期 case",
    state: "in_progress", progress: 0.65,
    created_at: "2026-06-23T16:23:00Z",
    deadline: "2026-06-23T18:00:00Z",
    expected_artifacts: ["markdown"],
    token_used: 4200, cost_yuan: 0.12,
    artifact_ids: ["art-001", "art-002", "art-003"],
  },
  {
    id: "t-002", company_id: "c-saas", dept_id: "dept-dev",
    title: "实现 marketplace catalog SQL schema",
    brief: "按 product-architecture.md §1.5 写出 Alembic migration",
    state: "done", progress: 1,
    created_at: "2026-06-23T14:00:00Z",
    expected_artifacts: ["code"],
    token_used: 8800, cost_yuan: 0.34,
    artifact_ids: ["art-004"],
  },
  {
    id: "t-003", company_id: "c-saas", dept_id: "dept-design",
    title: "设计 Console 顶部导航视觉",
    brief: "金色调，覆盖 dropdown / dropdown active / hover 三态",
    state: "review", progress: 0.92,
    created_at: "2026-06-23T11:08:00Z",
    expected_artifacts: ["image"],
    token_used: 2100, cost_yuan: 0.08,
    artifact_ids: ["art-005"],
  },
  {
    id: "t-004", company_id: "c-saas", dept_id: "dept-finance",
    title: "6 月份月度报表",
    brief: "P&L + cash flow + 关键 KPI",
    state: "done", progress: 1,
    created_at: "2026-06-22T18:30:00Z",
    expected_artifacts: ["table", "pdf"],
    token_used: 1500, cost_yuan: 0.04,
    artifact_ids: ["art-006"],
  },
  {
    id: "t-005", company_id: "l-newsletter", dept_id: "dept-research",
    title: "本周 AI infra 行业早报",
    brief: "周一 8:00 推送，关注 OpenAI / Anthropic / Mistral 三家",
    state: "done", progress: 1,
    created_at: "2026-06-23T08:00:00Z",
    expected_artifacts: ["markdown"],
    token_used: 1100, cost_yuan: 0.03,
    artifact_ids: ["art-007"],
  },
  {
    id: "t-006", company_id: "l-newsletter", dept_id: "dept-pub",
    title: "整理本周 Twitter 草稿",
    brief: "8 条短推文，主题：Phyntom X8 产品形态",
    state: "in_progress", progress: 0.30,
    created_at: "2026-06-23T14:11:00Z",
    expected_artifacts: ["markdown"],
    token_used: 600, cost_yuan: 0.02,
    artifact_ids: [],
  },
];

// ─── Artifacts ────────────────────────────────────────────────────────────

export interface Artifact {
  id: string;
  task_id: string;
  company_id: string;
  dept_id: string;
  name: string;
  type: ArtifactType;
  size_bytes: number;
  created_at: string;
  preview_text?: string;        // 用于 markdown / code / json 的预览
  thumbnail_url?: string;       // 用于 image / video
  url?: string;                  // 下载链接（mock 用 data: 或 placeholder）
}

export const ARTIFACTS: Artifact[] = [
  { id: "art-001", task_id: "t-001", company_id: "c-saas", dept_id: "dept-pub", name: "outline.md",  type: "markdown", size_bytes: 1240,  created_at: "2026-06-23T16:24:00Z", preview_text: "# Phyntom X8 发布博客 — 提纲\n\n1. 引言（为什么需要 AI 公司）\n2. 产品形态（Console / Marketplace / Departments）\n3. 技术差异化\n4. 早期 case\n5. 接下来" },
  { id: "art-002", task_id: "t-001", company_id: "c-saas", dept_id: "dept-pub", name: "draft-v1.md", type: "markdown", size_bytes: 8420,  created_at: "2026-06-23T16:28:00Z", preview_text: "# 当 AI Agent 长成一家公司\n\n_byline_  · 2026-06-23\n\n## 引言\n\n2024 至今，AI Agent 工具层出不穷，但...（草稿一）" },
  { id: "art-003", task_id: "t-001", company_id: "c-saas", dept_id: "dept-pub", name: "draft-v2.md", type: "markdown", size_bytes: 11930, created_at: "2026-06-23T16:35:00Z", preview_text: "# 当 AI Agent 长成一家公司：Phyntom X8 发布\n\n_byline_  · 2026-06-23\n\n## TL;DR\n\n我们今天发布 Phyntom X8 —— 第一个把整建制 AI 公司做成可订阅产品的平台。\n\n## 为什么\n\n...（草稿二，正在 review）" },
  { id: "art-004", task_id: "t-002", company_id: "c-saas", dept_id: "dept-dev", name: "0001_init.py", type: "code",     size_bytes: 4220,  created_at: "2026-06-23T15:18:00Z", preview_text: "\"\"\"Alembic init migration — Phyntom X8 platform.\"\"\"\nfrom alembic import op\nimport sqlalchemy as sa\n\nrevision = '0001_init'\n...\n" },
  { id: "art-005", task_id: "t-003", company_id: "c-saas", dept_id: "dept-design", name: "topbar-v2.png", type: "image", size_bytes: 218_400, created_at: "2026-06-23T12:01:00Z", thumbnail_url: "/console/assets/mock-thumb-topbar.svg" },
  { id: "art-006", task_id: "t-004", company_id: "c-saas", dept_id: "dept-finance", name: "june-2026.xlsx", type: "table", size_bytes: 12_800, created_at: "2026-06-22T22:00:00Z" },
  { id: "art-007", task_id: "t-005", company_id: "l-newsletter", dept_id: "dept-research", name: "weekly-2026-w25.md", type: "markdown", size_bytes: 6240, created_at: "2026-06-23T08:42:00Z", preview_text: "# AI Infra 周报 · 2026-W25\n\n## 头条\n\n1. **OpenAI** 发布 GPT-5.5 ...\n2. **Anthropic** Claude 4.7 ...\n3. **Mistral** ...\n" },
];

// ─── Activity events (for NewsTicker + Canvas bubbles) ────────────────────

export interface ActivityEvent {
  id: string;
  ts: string;
  company_id: string;
  dept_id: string;
  agent_id?: string;
  type: "task_received" | "handoff" | "review_gate" | "task_done" | "artifact" | "info";
  state?: AgentStatus;
  text: string;
  task_id?: string;
}

export const ACTIVITY: ActivityEvent[] = [
  { id: "a-1", ts: "2026-06-23T16:35:00Z", company_id: "c-saas", dept_id: "dept-pub", agent_id: "c-saas-dept-pub-builder-1", type: "artifact",     text: "draft-v2.md 已提交", task_id: "t-001" },
  { id: "a-2", ts: "2026-06-23T16:30:00Z", company_id: "c-saas", dept_id: "dept-pub", agent_id: "c-saas-dept-pub-reviewer",  type: "review_gate",  text: "审稿：3 处建议", task_id: "t-001" },
  { id: "a-3", ts: "2026-06-23T16:28:00Z", company_id: "c-saas", dept_id: "dept-pub", agent_id: "c-saas-dept-pub-builder-1", type: "artifact",     text: "draft-v1.md 提交", task_id: "t-001" },
  { id: "a-4", ts: "2026-06-23T16:24:00Z", company_id: "c-saas", dept_id: "dept-pub", agent_id: "c-saas-dept-pub-builder-1", type: "handoff",      text: "outline.md → builder", task_id: "t-001" },
  { id: "a-5", ts: "2026-06-23T16:23:00Z", company_id: "c-saas", dept_id: "dept-pub", agent_id: "c-saas-dept-pub-orchestrator", type: "task_received", text: "新任务：写发布博客", task_id: "t-001" },
  { id: "a-6", ts: "2026-06-23T15:42:00Z", company_id: "l-newsletter", dept_id: "dept-research", type: "task_done", text: "本周市场早报已完成", task_id: "t-005" },
  { id: "a-7", ts: "2026-06-23T15:18:00Z", company_id: "c-saas", dept_id: "dept-dev", type: "task_done", text: "catalog SQL schema migration 完成", task_id: "t-002" },
  { id: "a-8", ts: "2026-06-23T14:00:00Z", company_id: "c-saas", dept_id: "dept-dev", type: "task_received", text: "实现 marketplace catalog schema", task_id: "t-002" },
];

// ─── Me ───────────────────────────────────────────────────────────────────

export const ME = {
  user: {
    id: "user-dev-0001",
    email: "dev@mega-x.ai",
    display_name: "Dev User",
  },
  roles: ["tenant_owner", "developer"],
  tenants: [{ id: "tenant-dev-0001", name: "Dev Tenant", role: "owner" }],
  _mock: true,
};
