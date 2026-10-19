/**
 * 产出物按「环节」分栏：设定 → 剧本 → 资产 → 分镜 → 视频 → 成片，外加审查。
 * 环节只是看的角度，不是流程：哪一栏都能随时点开、随时让主创改。
 */

import { logicalOf, versionOf, type ProjectStatus, type StatusItem } from "./api";

export type StageId = "setting" | "story" | "assets" | "boards" | "clips" | "cut" | "review";
export type Stage = { id: StageId; label: string; kinds: string[]; empty: string; suggest: string };

export const STAGES: Stage[] = [
  { id: "setting", label: "设定", kinds: ["bible", "outline", "arc", "reference"], empty: "还没有世界观和大纲。", suggest: "先帮我把这部剧的 bible 和总纲定下来。" },
  { id: "story", label: "剧本", kinds: ["novel", "script"], empty: "还没有剧本。", suggest: "写第 1 集剧本。" },
  { id: "assets", label: "资产", kinds: ["profile", "abilities", "concept"], empty: "还没有人物、地点、道具。", suggest: "把主要人物的设定整理出来，再给主角出概念图。" },
  { id: "boards", label: "分镜", kinds: ["storyboard", "shot-list"], empty: "还没有分镜。", suggest: "给第 1 集拆镜头、出分镜。" },
  { id: "clips", label: "视频", kinds: ["clip"], empty: "还没有视频片段。", suggest: "把第 1 集已定的分镜做成视频。" },
  { id: "cut", label: "成片", kinds: ["cut"], empty: "还没有成片。", suggest: "把第 1 集剪成片。" },
  { id: "review", label: "审查", kinds: ["review"], empty: "还没有审查意见。", suggest: "审一下现在的剧本，看看有没有前后矛盾。" },
];

export function stageOf(kind: string): StageId {
  return STAGES.find(s => s.kinds.includes(kind))?.id || "setting";
}

export const KIND_LABEL: Record<string, string> = {
  bible: "Bible", outline: "总纲", arc: "分段大纲", novel: "正文", script: "剧本", profile: "设定", abilities: "能力",
  concept: "概念图", storyboard: "分镜", "shot-list": "镜头名单", clip: "视频", cut: "成片", reference: "参考", review: "审查",
};
const ASSET: Record<string, string> = { character: "人物", location: "地点", prop: "道具" };

/** 一栏里的小标题：第 N 集 / 人物 / 分段大纲…；同一小标题下的卡片排在一起。 */
export function sectionOf(item: StatusItem): string {
  const scope = item.scope || {};
  if (typeof scope.episode === "number") return `第 ${scope.episode} 集`;
  if (typeof scope.asset_kind === "string") return ASSET[scope.asset_kind] || scope.asset_kind;
  if (item.kind === "arc") return "分段大纲";
  if (item.kind === "reference") return "参考";
  return "";
}

/** 卡片上的短名：同一小标题下不用再重复「第 1 集」。 */
export function shortLabel(item: StatusItem): string {
  const scope = item.scope || {};
  const name = KIND_LABEL[item.kind] || item.kind;
  if (typeof scope.shot === "number") return `镜头 ${scope.shot}`;
  if (typeof scope.slug === "string") return item.kind === "concept" ? `${scope.slug} · ${scope.variant ?? ""}` : `${scope.slug} · ${name}`;
  if (typeof scope.episode === "number") return name;
  return item.label;
}

export type ItemState = "canonical" | "stale" | "draft" | "deprecated";

/** 一项产出物整体的状态：有生效版就是生效；生效版的上游变了（它变成过期）就是过期。 */
export function itemState(item: StatusItem): ItemState {
  if (item.canonical) return "canonical";
  if (item.stale.length) return "stale";
  if (item.latest_status === "deprecated") return "deprecated";
  return "draft";
}

/** 生效的不是最新一版：有新稿等你看。 */
export function hasNewer(item: StatusItem): boolean {
  return Boolean(item.canonical && item.latest !== item.canonical && item.latest_status !== "deprecated");
}

/** 这一项「在用」的那一版：生效版，没有就是过期的旧生效版，再没有就是最新稿。 */
export function itemRef(item: StatusItem): string {
  return item.canonical || item.stale[item.stale.length - 1] || item.latest;
}

export function stageItems(status: ProjectStatus | null, stage: StageId): StatusItem[] {
  return (status?.items || []).filter(i => stageOf(i.kind) === stage);
}

/** `ref` 的人话名字：「第 1 集 剧本 v2」，找不到就用文件名。 */
export function refLabel(status: ProjectStatus | null, ref: string): string {
  const logical = logicalOf(ref);
  const item = status?.items.find(i => i.logical === logical);
  const v = /@v(\d+)$/.exec(ref) || /\.v(\d{3,})\./.exec(ref);
  const version = v ? ` v${Number(v[1])}` : "";
  if (item) return `${item.label}${version}`;
  const slash = logical.lastIndexOf("/");
  return `${slash >= 0 ? logical.slice(slash + 1) : logical}${version}`;
}

export function shortVersion(ref: string): string {
  const v = versionOf(ref);
  const n = /^v0*(\d+)$/.exec(v);
  return n ? `v${n[1]}` : v;
}

const AUTHORS: Record<string, string> = {
  user: "你", main: "主创", lead: "主创",
  "concept-batch": "概念图批量", "storyboard-batch": "分镜批量", "video-batch": "视频批量",
  "story-reviewer": "审稿", "continuity-reviewer": "一致性审查", "reference-researcher": "参考搜集",
};

export function authorLabel(by?: string): string {
  if (!by) return "";
  return AUTHORS[by] || by;
}

/** 「刚刚 / 5 分钟前 / 今天 14:20 / 10-18 09:30 / 2025-12-01」 */
export function timeLabel(at?: string | null, now = Date.now()): string {
  if (!at) return "";
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return "";
  const diff = (now - t.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const today = new Date(now);
  if (t.toDateString() === today.toDateString()) return `今天 ${hm}`;
  if (t.getFullYear() === today.getFullYear()) return `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${hm}`;
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
