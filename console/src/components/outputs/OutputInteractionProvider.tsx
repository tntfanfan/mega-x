import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { normalizeRefs, refKey, type ChatRef } from "../../lib/chatRefs";
import type { ChatMsg } from "../../lib/builderFixtures";
import { fetchListPage, fetchMeta, fetchTree, resolveOutputs, type OutputFile, type OutputListPage,
  type OutputMention, type OutputNode, type ResolvedMention } from "../../lib/outputs";
import { emptyOutputDraft, mentionKey, removeDraftReference, selectDraftOutput, settleOutputDraft, toggleDraftReferencePin, type OutputDraft } from "../../lib/outputRefs";
import type { WorkspaceScope } from "../../lib/workspaceScope";
import type { SendTryMessage } from "../../lib/tryChatWs";
import { useToast } from "../ui/Toast";

type Interactions = {
  scope: WorkspaceScope;
  draft: OutputDraft;
  setText: (text: string) => void;
  referenceOutput: (file: OutputFile) => boolean;
  removeReference: (ref: ChatRef) => void;
  toggleReferencePin: (ref: ChatRef) => void;
  openOutput: (path: string) => void;
  referenceToChat: (file: OutputFile) => void;
  focusToken: number;
  revealToken: number;
  nodes: OutputNode[];
  outputRevision: number;
  fileStates: Record<string, "missing" | "deleted" | "not-ready" | "forbidden" | "error">;
  refresh: () => Promise<void>;
  searchOutputs: (query: string, offset?: number) => Promise<OutputListPage>;
  resolveMentions: (items: OutputMention[], retry?: boolean) => Promise<ResolvedMention[]>;
  beginSubmission: (message: SendTryMessage, consumeDraft?: boolean) => void;
};

const Context = createContext<Interactions | null>(null);

function loadDraft(key: string): OutputDraft {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null") as OutputDraft | null;
    if (value && typeof value.text === "string") {
      const refs = normalizeRefs(value.refs) || [];
      const keys = new Set(refs.map(refKey));
      return { ...emptyOutputDraft(), ...value, refs,
        pinnedRefKeys: Array.isArray(value.pinnedRefKeys) ? value.pinnedRefKeys.filter(key => keys.has(key)) : [] };
    }
  } catch { /* unavailable storage or incompatible draft */ }
  return emptyOutputDraft();
}

export function OutputInteractionProvider({ scope, workspaceKey, messages, busy, taskId, selectedPath, onOpen, onFocusChat, onRecoverSubmission, children }: {
  scope: WorkspaceScope; workspaceKey: string; messages: ChatMsg[]; busy: boolean; taskId?: string; selectedPath?: string;
  onOpen: (path: string) => void; onFocusChat: () => void; children: ReactNode;
  onRecoverSubmission: (message: SendTryMessage) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const storageKey = `dev.outputDraft.v1.${workspaceKey}`;
  const [draft, setDraft] = useState(() => loadDraft(storageKey));
  const draftRef = useRef(draft);
  const [nodes, setNodes] = useState<OutputNode[]>([]);
  const [outputRevision, setOutputRevision] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const [revealToken, setRevealToken] = useState(0);
  const [fileStates, setFileStates] = useState<Interactions["fileStates"]>({});
  const cache = useRef(new Map<string, { value: ResolvedMention; at: number }>());
  const pending = useRef(new Map<string, Promise<ResolvedMention>>());
  const searchCache = useRef(new Map<string, { value: OutputListPage; at: number }>());
  const refreshSequence = useRef(0);
  const alive = useRef(true);
  const knownFiles = useRef(new Set<string>());

  useEffect(() => { alive.current = true; return () => { alive.current = false; refreshSequence.current++; }; }, []);

  const updateDraft = useCallback((change: (current: OutputDraft) => OutputDraft) => {
    const next = change(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota / private mode */ }
  }, [storageKey]);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const result = await fetchTree(scope, "", 16);
    if (!alive.current || sequence !== refreshSequence.current) return;
    setNodes(result);
    const paths = new Set<string>();
    const collect = (items: OutputNode[]) => { for (const node of items) { if (node.kind !== "dir") paths.add(node.path); if (node.children) collect(node.children); } };
    collect(result);
    for (const path of paths) knownFiles.current.add(path);
    setFileStates(current => Object.fromEntries(Object.entries(current).filter(([path]) => !paths.has(path))));
    setOutputRevision(v => v + 1);
    searchCache.current.clear();
  }, [scope.base]);

  useEffect(() => {
    const load = () => { if (document.visibilityState === "visible") void refresh().catch(() => {}); };
    load();
    const timer = window.setInterval(load, taskId ? 5000 : 30000);
    document.addEventListener("visibilitychange", load);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [refresh, taskId]);

  useEffect(() => { if (!busy) void refresh().catch(() => {}); }, [busy, refresh]);

  useEffect(() => {
    const id = draftRef.current.submission?.id;
    if (!id) return;
    const message = messages.find(m => m.clientMessageId === id);
    if (!message && draftRef.current.submission?.text !== undefined) {
      const snapshot = draftRef.current.submission;
      onRecoverSubmission({ clientMessageId: id, text: snapshot.text!, refs: snapshot.refs || [] });
    }
    if (message?.status === "accepted" || message?.status === "failed") {
      updateDraft(current => settleOutputDraft(current, id, message.status === "accepted"));
    }
  }, [messages, draft.submission?.id, updateDraft]);

  const setText = (text: string) => updateDraft(current => ({ ...current, text,
    revision: current.revision + 1, textRevision: current.revision + 1 }));

  const referenceOutput = (file: OutputFile): boolean => {
    try {
      updateDraft(d => selectDraftOutput(d, file));
      return true;
    } catch {
      toast.error(t("outputs.refs.limit"));
      return false;
    }
  };

  const openOutput = (path: string) => {
    onOpen(path);
    setRevealToken(v => v + 1);
    void fetchMeta(scope, path).then(() => {
      knownFiles.current.add(path);
      if (alive.current) setFileStates(current => { const next = { ...current }; delete next[path]; return next; });
    }).catch((error) => {
      const status = error?.status;
      const sent = messages.some(m => m.status === "accepted" && m.refs?.some(ref => ref.type === "output" && ref.path === path));
      const state = status === 403 || status === 401 ? "forbidden" : status === 404 ?
        knownFiles.current.has(path) || sent ? "deleted" : "not-ready" : "error";
      if (alive.current) setFileStates(current => ({ ...current, [path]: state }));
      toast.error(t(`outputs.refs.${state}`));
    });
    void refresh().catch(() => {});
  };

  const searchOutputs = async (query: string, offset = 0): Promise<OutputListPage> => {
    const key = `${query}:${offset}:${taskId || ""}:${selectedPath || ""}`;
    const prior = searchCache.current.get(key);
    if (prior && Date.now() - prior.at < 2000) return prior.value;
    const result = await fetchListPage(scope, { q: query, offset, limit: 20, preferred_task_id: taskId, selected_path: selectedPath });
    searchCache.current.set(key, { value: result, at: Date.now() });
    return result;
  };

  const resolveMentions = async (items: OutputMention[], retry = false): Promise<ResolvedMention[]> => {
    const needed = items.filter(item => {
      const key = mentionKey(item), prior = cache.current.get(key);
      return !pending.current.has(key) && (retry || !prior || Date.now() - prior.at > 2000);
    });
    if (needed.length) {
      const request = resolveOutputs(scope, needed);
      for (const item of needed) {
        const key = mentionKey(item);
        const value = request.then(rows => {
          const row = rows.find(r => mentionKey(r) === key) || { ...item, status: "missing" as const, candidates: [] };
          cache.current.set(key, { value: row, at: Date.now() });
          return row;
        }).finally(() => { pending.current.delete(key); });
        pending.current.set(key, value);
      }
    }
    return Promise.all(items.map(item => pending.current.get(mentionKey(item)) || Promise.resolve(cache.current.get(mentionKey(item))!.value)));
  };

  const historyPaths = [...new Set(messages.flatMap(message => (message.refs || []).flatMap(ref => ref.type === "output" ? [ref.path] : [])))].sort();
  const historyPathsKey = JSON.stringify(historyPaths);
  useEffect(() => {
    let stopped = false;
    if (!historyPaths.length) return;
    void resolveMentions(historyPaths.map(value => ({ value, match: "path" }))).then(rows => {
      if (stopped) return;
      setFileStates(current => {
        const next = { ...current };
        for (const row of rows) {
          if (row.status === "resolved") { knownFiles.current.add(row.value); delete next[row.value]; }
          else next[row.value] = row.status === "missing" ? "deleted" : row.code === "forbidden" ? "forbidden" : "error";
        }
        return next;
      });
    }).catch(() => {});
    return () => { stopped = true; };
  }, [historyPathsKey, outputRevision]);

  return <Context.Provider value={{ scope, draft, setText, referenceOutput, openOutput, nodes,
    revealToken, focusToken, outputRevision, refresh, fileStates, searchOutputs, resolveMentions,
    removeReference: ref => updateDraft(d => removeDraftReference(d, ref)),
    toggleReferencePin: ref => updateDraft(d => toggleDraftReferencePin(d, ref)),
    referenceToChat: file => { if (referenceOutput(file)) { onFocusChat(); setFocusToken(v => v + 1); } },
    beginSubmission: (message, consumeDraft = true) => updateDraft(d => d.submission?.id === message.clientMessageId ? d : ({ ...d,
      submission: { id: message.clientMessageId, text: message.text, refs: message.refs,
        textRevision: consumeDraft ? d.textRevision : -1, refRevisions: consumeDraft ? { ...d.refRevisions } : {} } })),
  }}>{children}</Context.Provider>;
}

export function useOutputInteractions(): Interactions {
  const value = useContext(Context);
  if (!value) throw new Error("Output interactions require a workspace provider");
  return value;
}
