/**
 * 项目里那几份「手写 + 系统维护」的 md（PROJECT.md / preferences.md / log.md / story/threads.md）
 * 和每一版开头的 frontmatter，拆成页面能结构化显示的数据。只用 type import，测试可以直接用 node 跑。
 */

/** The project notes the overview reads, by role (paths are project-relative). */
export const NOTE_FILES = {
  project: "PROJECT.md",
  preferences: "preferences.md",
  log: "log.md",
  threads: "story/threads.md",
} as const;
export type NoteId = keyof typeof NOTE_FILES;

export function noteOf(path: string): NoteId | null {
  const hit = (Object.keys(NOTE_FILES) as NoteId[]).find(id => NOTE_FILES[id] === path);
  return hit || null;
}

/** The order and wording of preferences.md (series_mcp.project.PREFERENCE_SECTIONS). */
export const PREFERENCE_SECTIONS: { name: string; hint: string; ask: string }[] = [
  { name: "口味", hint: "喜欢的题材、节奏、画风、语气", ask: "记一下我的口味：" },
  { name: "参照与雷区", hint: "想学的作品，绝对不要的东西", ask: "记一下我的参照和雷区：" },
  { name: "协作方式", hint: "希望主创怎么跟你配合", ask: "以后这样跟我配合：" },
  { name: "纠正与确认", hint: "你纠正过、确认过的事", ask: "记住这条：" },
];

/** HTML comments (`<!-- auto -->`, `<!-- auto:begin -->`) are for the system: never show them. */
export function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

export type Section = { heading: string; body: string };
export type NoteDoc = { title: string; intro: string; sections: Section[] };

/** `# title`, what comes before the first `## `, and each `## ` section (comments removed, bodies trimmed). */
export function parseSections(text: string): NoteDoc {
  const lines = stripComments(text.replace(/\r\n/g, "\n")).split("\n");
  let title = "";
  const intro: string[] = [];
  const sections: Section[] = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h1 = !fence && /^#\s+(.+?)\s*#*\s*$/.exec(line);
    const h2 = !fence && /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h1 && !title && !sections.length) { title = h1[1].trim(); continue; }
    if (h2) { sections.push({ heading: h2[1].trim(), body: "" }); continue; }
    const last = sections[sections.length - 1];
    if (last) last.body += `${line}\n`; else intro.push(line);
  }
  return {
    title,
    intro: intro.join("\n").trim(),
    sections: sections.map(s => ({ heading: s.heading, body: s.body.trim() })),
  };
}

export function sectionBody(doc: NoteDoc | null, heading: string): string {
  return doc?.sections.find(s => s.heading === heading)?.body || "";
}

/** Placeholder text the templates write (`（空）`, `（还没写：…）`) counts as nothing. */
export function isBlank(body: string): boolean {
  const t = body.replace(/^\s*[-*]\s*/gm, "").trim();
  return !t || /^[（(](空|还没写[^）)]*)[）)]$/.test(t);
}

/** `- a\n- b` → `["a", "b"]`; continuation lines join their item; anything else is one item per paragraph. */
export function bullets(body: string): string[] {
  const out: string[] = [];
  let open = false;
  for (const line of body.split("\n")) {
    const m = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (m) { out.push(m[1].trim()); open = true; continue; }
    if (!line.trim()) { open = false; continue; }
    if (open && out.length) out[out.length - 1] += ` ${line.trim()}`;
    else { out.push(line.trim()); open = true; }
  }
  return out.filter(x => x && !isBlank(x));
}

export type LogEntry = { at: string; session: string; text: string };

/** log.md: `- 2026-10-19T10:33:54+08:00 [session] text`, newest last (as written). */
export function parseLog(text: string): LogEntry[] {
  const out: LogEntry[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^\s*[-*]\s+(\d{4}-\d\d-\d\dT[^\s]+)\s+(?:\[([^\]]*)\]\s+)?(.*)$/.exec(line);
    if (m) out.push({ at: m[1], session: m[2] || "", text: m[3].trim() });
    else if (/^\s*[-*]\s+\S/.test(line)) out.push({ at: "", session: "", text: line.replace(/^\s*[-*]\s+/, "").trim() });
  }
  return out;
}

/** Who did it, from the session tag: `ui-…` is the user on the page; anything else is the agent's session. */
export function logActor(entry: LogEntry): "user" | "agent" {
  return entry.session.startsWith("ui") || /^用户/.test(entry.text) ? "user" : "agent";
}

export type Table = { header: string[]; rows: string[][] };

/** The first GFM table in `body`; `null` when there is none. */
export function parseTable(body: string): Table | null {
  const lines = body.split("\n").map(l => l.trim());
  const at = lines.findIndex((l, i) => l.startsWith("|") && /^\|?\s*:?-{2,}/.test(lines[i + 1] || ""));
  if (at < 0) return null;
  const cells = (l: string) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
  const header = cells(lines[at]);
  const rows: string[][] = [];
  for (const l of lines.slice(at + 2)) {
    if (!l.startsWith("|")) break;
    const row = cells(l);
    if (row.some(Boolean)) rows.push(header.map((_, i) => row[i] || ""));
  }
  return { header, rows };
}

// ------------------------------------------------------------ frontmatter

export type Field = { key: string; value: string | string[] };

/** `---\n…\n---\n` at the top → [frontmatter, body]. */
export function splitFrontmatter(text: string): [string, string] {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? [m[1], text.slice(m[0].length)] : ["", text];
}

function scalar(raw: string): string {
  const v = raw.trim();
  if (/^(['"]).*\1$/.test(v)) return v.slice(1, -1);
  if (v === "~" || v === "null") return "";
  return v;
}

/**
 * Just enough YAML to show a version's frontmatter: `key: value`, `key: [a, b]`, a block list
 * (`key:` then `- a`), and nested / multi-line values kept as their text.
 */
export function parseFields(yaml: string): Field[] {
  const out: Field[] = [];
  let last: Field | null = null;
  for (const line of yaml.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const top = /^([A-Za-z_一-鿿][\w一-鿿-]*)\s*:(.*)$/.exec(line);
    if (top) {
      const raw = top[2].trim();
      const flow = /^\[(.*)\]$/.exec(raw);
      last = { key: top[1], value: flow ? flow[1].split(",").map(scalar).filter(Boolean) : raw === "|" || raw === ">" ? "" : scalar(raw) };
      out.push(last);
      continue;
    }
    if (!last) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && (Array.isArray(last.value) || last.value === "")) {
      last.value = [...(Array.isArray(last.value) ? last.value : []), scalar(item[1])];
    } else if (typeof last.value === "string") {
      last.value = `${last.value}${last.value ? "\n" : ""}${line.trim()}`;
    } else {
      last.value = [...last.value.slice(0, -1), `${last.value[last.value.length - 1]} ${line.trim()}`];
    }
  }
  return out;
}

/** What the system writes into every version (series_mcp.project.MANAGED): shown apart from the author's fields. */
export const MANAGED_FIELDS = ["kind", "version", "status", "depends_on", "revision_of", "created_by", "created_at", "session"];

export const FIELD_LABEL: Record<string, string> = {
  kind: "类型", version: "版本", status: "状态", depends_on: "依据", revision_of: "改自", created_by: "作者",
  created_at: "时间", session: "会话", title: "标题", logline: "一句话", aspect: "画幅", art_style: "画风",
  episode_count: "集数", episode_duration_sec: "单集时长（秒）", episode: "集", shot: "镜头", slug: "代号",
  asset_kind: "资产类别", variant: "变体", genre: "类型", tone: "基调", audience: "受众", tags: "标签", name: "名字",
  duration_sec: "时长（秒）", characters: "人物", location: "地点", props: "道具", topic: "主题", target: "对象",
};
