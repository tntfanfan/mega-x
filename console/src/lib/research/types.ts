export type Market = "A" | "US";
export type ResearchLanguage = "zh" | "en";
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type MarketCapability = {
  can_submit?: boolean;
  supported_depths?: string[];
  reason?: string;
};
export type ResearchCapabilities = MarketCapability & {
  supported_languages?: string[];
  markets?: Partial<Record<Market, MarketCapability>>;
};
export type Department = {
  execution_reason?: string;
  capabilities: ResearchCapabilities;
  installation_status?: string;
  can_install?: boolean;
  operation_id?: string;
};
export type Operation = {
  status?: string;
  error?: unknown;
  message?: string;
  detail?: unknown;
};
export type ResearchRun = {
  id?: string;
  state?: string;
  last_seq?: number;
  stage_state?: string;
  started_at?: string;
  ended_at?: string;
  error?: unknown;
  result?: { quality?: string; gaps?: string[] };
  runtime_events?: { state?: string; error_code?: string | null }[];
};
export type ResearchTask = {
  id: string;
  title?: string;
  state: string;
  created_at?: string;
  executor?: string;
  run?: ResearchRun;
  research?: { request?: { market?: Market } };
};
export type ResearchFile = {
  path: string;
  name: string;
  size?: number;
  task_id?: string;
  run_id?: string;
};
export type ResearchRequest = {
  market: Market;
  ticker: string;
  depth: string;
  school: null;
  language: ResearchLanguage;
};
export type ReportBinding = { task_id: string; run_id: string };
export type Persona = {
  id: string;
  name?: string;
  name_en?: string;
  summary?: string;
  summary_en?: string;
  version?: string;
  school_id?: string;
};
export type DialogueCapabilities = { can_send?: boolean; reason?: string };
export type Conversation = {
  id: string;
  kind?: "single" | "roundtable";
  title?: string;
  mode?: string;
  updated_at?: string;
  persona_snapshot: Persona;
  participant_snapshots?: Persona[];
  report?: ReportBinding;
  sections?: { id: string; title?: string }[];
  evidence?: {
    ticker?: string;
    generated_at?: string;
    currency?: string;
    coverage?: string;
    omitted_sections?: string[];
  };
};
export type Speech = {
  persona_id?: string;
  state: string;
  reply?: string;
  error?: string;
  truncated?: boolean;
  citation_warning?: boolean;
  history_coverage?: string;
  citations?: string[];
};
export type DialogueTurn = Speech & {
  id: string;
  message: string;
  speeches?: Speech[];
};
export type ConversationRequest = {
  persona_id?: string;
  persona_ids?: string[];
  report: ReportBinding | null;
};
export type DialogueContext = {
  company: string;
  cid: string;
  persona: string;
  generation: number;
};
