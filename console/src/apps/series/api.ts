/**
 * 网剧应用的 HTTP 接口（都在 appBase 下，见 platform/apps/series/server.py）。
 */

import { ApiError, api } from "../../lib/api";

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/$/, "");

export type MediaItem = { url: string; mime?: string };
export type AskOption = { label: string; description?: string };
export type AskQuestion = { header?: string; question: string; options: AskOption[]; multi?: boolean };
/** `mcp__ui__ask` 的提问。旧历史里是单题 `{question, options: string[], multi}`，用 askQuestions 读。 */
export type Ask = { id?: string; questions?: AskQuestion[]; question?: string; options?: (string | AskOption)[]; multi?: boolean };
/** 一题的回答：选中的选项 + 「其他」里写的话。 */
export type AskAnswer = { choices: string[]; text?: string };

/** 页面给每题自动加的选项。 */
export const ASK_DECIDE = "你定";

export function askQuestions(ask: Ask): AskQuestion[] {
  const raw = Array.isArray(ask.questions) ? ask.questions : ask.question ? [{ question: ask.question, options: ask.options || [], multi: ask.multi }] : [];
  return raw.map(q => ({
    header: q.header,
    question: String(q.question || ""),
    options: (q.options || []).map(o => (typeof o === "string" ? { label: o } : o)).filter(o => o.label && o.label !== ASK_DECIDE),
    multi: Boolean(q.multi),
  }));
}

/** 回答显示成的消息，和服务端 live.answer_text 一致。 */
export function answerText(questions: AskQuestion[], answers: AskAnswer[]): string {
  const lines = answers.map(a => [...new Set([...a.choices, ...(a.text?.trim() ? [a.text.trim()] : [])])].join("、"));
  if (questions.length === 1) return lines[0] || "";
  return questions.map((q, i) => `${q.header || q.question}：${lines[i] || ""}`).join("\n");
}
export type ChatRef = { ref: string; label?: string; project_id?: string };

export type Message = {
  id: string;
  at: string;
  role: "user" | "assistant";
  text: string;
  refs?: ChatRef[];
  resend_of?: string;
  answer_to?: string;
  client_message_id?: string;
  key?: string;
  source?: string;
  label?: string;
  media?: MediaItem[];
  asks?: Ask[];
  error?: string;
  cancelled?: boolean;
  reply_to?: string;
};

export type Session = { id: string; title: string; created_at?: string; updated_at?: string; project_id?: string | null; busy?: boolean };
export type History = {
  session: Session;
  messages: Message[];
  live: { seq: number; done: boolean; reply_to: string } | null;
  project_id: string | null;
};

export type ProjectSummary = { project_id: string; title: string; snapshot?: string; updated_at?: string };
export type Status = "draft" | "canonical" | "stale" | "deprecated" | string;
export type StatusItem = {
  logical: string;
  kind: string;
  scope: Record<string, unknown>;
  label: string;
  latest: string;
  latest_status: Status;
  canonical: string | null;
  stale: string[];
  group: string;
  /** `media?path=…` of the shown version's first image (canonical, else latest) */
  thumb?: string | null;
  media_kind?: "image" | "video" | null;
};
export type Job = { job_id: string; kind: string; target_ref?: string | null; state: string; at?: string };
export type ProjectStatus = {
  project_id: string;
  title: string;
  items: StatusItem[];
  jobs: Job[];
  overview?: unknown;
};
export type Version = {
  ref: string;
  status: Status;
  files: string[];
  depends_on: string[];
  revision_of?: string | null;
  created_by?: string;
  created_at?: string;
  text?: string | null;
  media: MediaItem[];
  downstream: string[];
  /** A text version the page can edit: `body` without frontmatter, `fields` = the author's frontmatter lines. */
  editable?: boolean;
  body?: string;
  fields?: string;
};
export type ArtifactDetail = { project_id: string; logical: string; label: string; versions: Version[] };

export type Action = "canonical" | "uncanonical" | "deprecate";
export type Impacts = { items: { ref: string; label?: string; status?: string }[]; summary: { kind: string; label?: string; count?: number }[]; from: string[] };
export type ActionResult =
  | { ok: true; ref: string; status: Status; unchanged?: boolean; impacts?: Impacts; marked?: number }
  | { ok: false; needs_confirm: true; ref: string; action: Action; status: Status; impacts: Impacts };

/** The version a file on disk belongs to: its text, one of its media, or its copy in the object store. */
export type FileOwner = { ref: string; logical: string; kind: string; status: Status; role: "text" | "media" | "object" };
export type FileEntry = { path: string; dir?: boolean; size?: number; mtime?: string; owner?: FileOwner };
/** The project directory as it is on disk. `root` is the collection-relative path of the project. */
export type FileTree = { project_id: string; root: string; entries: FileEntry[]; files: number; bytes: number; truncated: boolean };
export type FileContent = {
  path: string;
  size: number;
  mtime: string;
  mime: string;
  /** `media?path=…`: the raw bytes */
  url: string;
  text: string | null;
  truncated?: boolean;
  binary?: boolean;
  owner?: FileOwner;
};

export type EditResult = { ok: true; ref: string; unchanged?: boolean; from?: string; warnings?: string[] };

export class ActionRefused extends Error {
  problems: string[];
  constructor(message: string, problems: string[]) {
    super(message);
    this.problems = problems;
  }
}

/** A 409 / 400 with `{detail, problems}` from the app → ActionRefused. */
async function refusable<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (e) {
    if (e instanceof ApiError && e.body && typeof e.body === "object") {
      const b = e.body as { detail?: unknown; problems?: unknown };
      if (typeof b.detail === "string") throw new ActionRefused(b.detail, Array.isArray(b.problems) ? b.problems.map(String) : []);
    }
    throw e;
  }
}

export function seriesApi(appBase: string) {
  const q = encodeURIComponent;
  return {
    sessions: () => api.get<{ sessions: Session[] }>(`${appBase}/sessions`).then(r => r.sessions),
    createSession: (body: { title?: string; project_id?: string } = {}) => api.post<Session>(`${appBase}/sessions`, body),
    history: (sid: string) => api.get<History>(`${appBase}/sessions/${q(sid)}/history`),
    setProject: (sid: string, projectId: string) =>
      api.put<{ project_id: string; previous?: string | null }>(`${appBase}/sessions/${q(sid)}/project`, { project_id: projectId }),
    projects: () => api.get<{ projects: ProjectSummary[] }>(`${appBase}/projects`).then(r => r.projects),
    status: (pid: string) => api.get<ProjectStatus>(`${appBase}/projects/${q(pid)}/status`),
    artifact: (pid: string, logical: string) =>
      api.get<ArtifactDetail>(`${appBase}/projects/${q(pid)}/artifacts?logical=${q(logical)}`),
    action: (pid: string, body: { action: Action; ref: string; confirm?: boolean; allow_draft?: boolean }) =>
      refusable(api.post<ActionResult>(`${appBase}/projects/${q(pid)}/actions`, body)),
    /** The user's text as a new draft version of `ref` (same scope, dependencies and media). */
    edit: (pid: string, body: { ref: string; body: string; fields?: string }) =>
      refusable(api.post<EditResult>(`${appBase}/projects/${q(pid)}/edits`, body)),
    files: (pid: string) => api.get<FileTree>(`${appBase}/projects/${q(pid)}/files`),
    file: (pid: string, path: string) => api.get<FileContent>(`${appBase}/projects/${q(pid)}/file?path=${q(path)}`),
    /** `media?path=…` from the app → a URL the browser can load (cookie rides along, same origin). */
    mediaSrc: (url: string) => /^https?:\/\//i.test(url) ? url : `${API_BASE}${appBase}/${url.replace(/^\//, "")}`,
    eventsUrl: (pid: string) => `${API_BASE}${appBase}/projects/${q(pid)}/events`,
  };
}

export type SeriesApi = ReturnType<typeof seriesApi>;

/** 「定稿」= 最终使用的那一版：下游统一以它为准。 */
export const STATUS_LABEL: Record<string, string> = { canonical: "定稿", stale: "过期", deprecated: "弃用", draft: "草稿" };

/** `path/to/file.md@v002` → `v002` */
export function versionOf(ref: string): string {
  const at = ref.lastIndexOf("@");
  return at >= 0 ? ref.slice(at + 1) : ref;
}

/** `story/ep-001/script-ep-001.v002.md@v2` → `story/ep-001/script-ep-001` (the logical artifact). */
export function logicalOf(ref: string): string {
  return ref.replace(/@v\d+$/, "").replace(/\.v\d{3,}\.[a-z0-9]+$/i, "");
}

export function isVideo(item: MediaItem): boolean {
  return (item.mime || "").startsWith("video/") || /\.(mp4|webm)(?:[?&#]|%|$)/i.test(item.url);
}

export function isImage(item: MediaItem): boolean {
  return (item.mime || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)(?:[?&#]|%|$)/i.test(item.url);
}
