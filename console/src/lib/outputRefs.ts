import type { ChatRef, OutputChatRef } from "./chatRefs";
import { mergeRefs, refKey } from "./chatRefs";
import type { OutputFile, OutputMention, OutputNode } from "./outputs";
import type { WorkspaceScope } from "./workspaceScope";

export function outputRef(file: OutputFile): OutputChatRef {
  return { type: "output", id: file.path, path: file.path, label: file.name, kind: file.kind,
    taskId: file.task_id || undefined, runId: file.run_id || undefined, mtime: file.mtime, size: file.size };
}

/** A meta lookup can reveal a file beyond the directory tree's loaded depth. */
export function treeWithOutput(nodes: OutputNode[], file: OutputFile): OutputNode[] {
  const parts = file.path.split("/");
  const insert = (items: OutputNode[], depth: number): OutputNode[] => {
    const path = parts.slice(0, depth + 1).join("/");
    const existing = items.find(node => node.path === path);
    const node: OutputNode = depth === parts.length - 1 ? { ...file, label: file.name }
      : { ...(existing || { path, name: parts[depth], label: parts[depth], kind: "dir" }), children: insert(existing?.children || [], depth + 1) };
    return existing ? items.map(item => item.path === path ? node : item) : [...items, node];
  };
  return insert(nodes, 0);
}

export function outputWorkspaceKey(userId: string, scope: WorkspaceScope): string {
  return `${userId}:${scope.kind}:${scope.base}`;
}

export function messageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
}

export function outputPathFromLink(href: string, scope: WorkspaceScope, origin: string): string | null {
  try {
    const url = new URL(href, `${origin}${scope.routeBase}`);
    if (url.origin !== origin) return null;
    const container = scope.kind === "sandbox" ? `/home/openclaw/outputs/${scope.id}/outputs/` : "/home/openclaw/outputs/";
    if (url.pathname.startsWith(container)) return decodeURIComponent(url.pathname.slice(container.length));
    if (url.pathname === `${scope.base}/outputs/raw`) return url.searchParams.get("path");
    if (url.pathname === scope.routeBase || url.pathname === `/console${scope.routeBase}`) return url.searchParams.get("file");
  } catch { /* ordinary or malformed link */ }
  return null;
}

// Text-node matching, never HTML replacement. Paths precede basename matches.
const EXT = "(?:md|txt|csv|tsv|json|ya?ml|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|html?|py|tsx?|jsx?|zip)";
export function mentionPattern(): RegExp {
  return new RegExp(`(?:\\/home\\/openclaw\\/outputs\\/|(?:chat|tasks|board|depts)\\/)[^\\n\\r\\x60<>\\[\\]，。；！？]+?\\.${EXT}(?![\\w.])|[\\p{L}\\p{N}_][\\p{L}\\p{N}_()（）#&%+.-]*\\.${EXT}(?![\\w.])`, "gu");
}

export function mentionCandidates(text: string): OutputMention[] {
  const plain = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "").replace(/!?\[[^\]]*\]\([^)]*\)/g, "");
  const found = new Map<string, OutputMention>();
  for (const match of plain.matchAll(mentionPattern())) {
    const value = match[0];
    const before = plain[(match.index || 0) - 1] || "";
    if (/[\p{L}\p{N}_@/]/u.test(before)) continue;
    const item: OutputMention = { value, match: value.includes("/") ? "path" : "name" };
    found.set(mentionKey(item), item);
  }
  // Inline code is a reliable boundary, including names containing spaces.
  for (const match of plain.matchAll(/`([^`\n]+)`/g)) {
    const value = match[1];
    if (new RegExp(`\\.${EXT}$`, "i").test(value)) {
      const item: OutputMention = { value, match: value.includes("/") ? "path" : "name" };
      found.set(mentionKey(item), item);
    }
  }
  return [...found.values()];
}

export function mentionKey(item: OutputMention): string { return `${item.match}:${item.value}`; }

export type MentionQuery = { start: number; end: number; query: string };
export function activeMention(text: string, caret: number): MentionQuery | null {
  const head = text.slice(0, caret);
  const match = /(^|[\s(（])@([^\s@]*)$/.exec(head);
  if (!match) return null;
  return { start: caret - match[2].length - 1, end: caret, query: match[2] };
}

export type OutputDraft = {
  text: string;
  refs: ChatRef[];
  revision: number;
  textRevision: number;
  refRevisions: Record<string, number>;
  pinnedRefKeys: string[];
  selectedRefKey?: string;
  submission?: { id: string; textRevision: number; refRevisions: Record<string, number>; text?: string; refs?: ChatRef[] };
};

export function emptyOutputDraft(): OutputDraft {
  return { text: "", refs: [], revision: 0, textRevision: 0, refRevisions: {}, pinnedRefKeys: [] };
}

/** Selecting a file replaces the temporary reference and keeps explicit pins. */
export function selectDraftOutput(draft: OutputDraft, file: OutputFile): OutputDraft {
  const ref = outputRef(file), key = refKey(ref);
  const pinned = new Set(draft.pinnedRefKeys || []);
  const refs = mergeRefs(draft.refs.filter(item => pinned.has(refKey(item))), [ref]);
  const revision = draft.revision + 1;
  return { ...draft, refs, selectedRefKey: key, revision,
    refRevisions: Object.fromEntries(refs.map(item => [refKey(item), refKey(item) === key ? revision : draft.refRevisions[refKey(item)]])) };
}

export function removeDraftReference(draft: OutputDraft, ref: ChatRef): OutputDraft {
  const key = refKey(ref), refRevisions = { ...draft.refRevisions };
  delete refRevisions[key];
  return { ...draft, refs: draft.refs.filter(item => refKey(item) !== key), refRevisions,
    pinnedRefKeys: (draft.pinnedRefKeys || []).filter(item => item !== key),
    selectedRefKey: draft.selectedRefKey === key ? undefined : draft.selectedRefKey, revision: draft.revision + 1 };
}

export function toggleDraftReferencePin(draft: OutputDraft, ref: ChatRef): OutputDraft {
  const key = refKey(ref), pins = draft.pinnedRefKeys || [];
  if (!draft.refs.some(item => refKey(item) === key)) return draft;
  if (pins.includes(key) && draft.selectedRefKey !== key) return removeDraftReference(draft, ref);
  const revision = draft.revision + 1;
  return { ...draft, pinnedRefKeys: pins.includes(key) ? pins.filter(item => item !== key) : [...pins, key],
    revision, refRevisions: { ...draft.refRevisions, [key]: revision } };
}

/** An acceptance only consumes the submitted versions, preserving newer edits. */
export function settleOutputDraft(draft: OutputDraft, id: string, accepted: boolean): OutputDraft {
  const snapshot = draft.submission;
  if (!snapshot || snapshot.id !== id) return draft;
  if (!accepted) return { ...draft, submission: undefined };
  const refs = draft.refs.filter(ref => (draft.pinnedRefKeys || []).includes(refKey(ref)) ||
    !Object.prototype.hasOwnProperty.call(snapshot.refRevisions, refKey(ref)) ||
    draft.refRevisions[refKey(ref)] !== snapshot.refRevisions[refKey(ref)]);
  return { ...draft, text: draft.textRevision === snapshot.textRevision ? "" : draft.text, refs,
    selectedRefKey: refs.some(ref => refKey(ref) === draft.selectedRefKey) ? draft.selectedRefKey : undefined, submission: undefined };
}
