/**
 * Line-scoped chat state. Lives under LineShell so ChatView can unmount
 * (user switches to Tasks) without losing per-team sessions / drafts.
 *
 * Same logic as business/company/ChatProvider: sessionStorage + server
 * history, refs, pending-reply poll, resume. Paths use /v1/lines.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem, Task } from "../../../lib/api";
import {
  mergeRefs,
  refsForApi,
  type ChatRef,
} from "../../../lib/chatRefs";
import { useToast } from "../../../components/ui/Toast";
import {
  resolveDeptDisplay,
  serverRowToTurn,
  type ChatTurn,
} from "../../business/company/ChatProvider";

export type { ChatTurn, ChatRef };
export { resolveDeptDisplay };

type DeptChatBucket = {
  sessionId?: string;
  turns: ChatTurn[];
  draft: string;
  pendingRefs: ChatRef[];
  historyLoaded?: boolean;
};

type LineChatMap = Record<string, DeptChatBucket>;

type ChatStore = Record<string, LineChatMap>;

type ChatContextValue = {
  line: Company;
  depts: DeptCatalogItem[];
  deptsLoading: boolean;
  reloadDepts: () => Promise<void>;
  deptId: string;
  setDeptId: (id: string) => void;
  turns: ChatTurn[];
  draft: string;
  setDraft: (text: string) => void;
  pendingRefs: ChatRef[];
  addPendingRefs: (refs: ChatRef[]) => void;
  removePendingRef: (ref: ChatRef) => void;
  clearPendingRefs: () => void;
  bringToChat: (
    targetDeptId: string,
    refs: ChatRef[],
    opts?: { draft?: string },
  ) => void;
  sending: boolean;
  canChat: boolean;
  selectedDept: DeptCatalogItem | undefined;
  selectedDeptLabel: string;
  sessionId: string | undefined;
  historyLoading: boolean;
  send: () => Promise<void>;
  appendLocalTurn: (turn: Extract<ChatTurn, { role: "local" }>) => void;
  resumeTask: (taskId: string, opts?: { guidance?: string; stepKey?: string }) => Promise<void>;
  resumingTaskId: string | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);

const STORAGE_PREFIX = "console.solo.chat.v2:";

const PENDING_POLL_INTERVAL_MS = 5000;
const PENDING_POLL_TOTAL_MS = 15 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storageKey(lineId: string): string {
  return `${STORAGE_PREFIX}${lineId}`;
}

function loadLineMap(lineId: string): LineChatMap {
  try {
    const raw = sessionStorage.getItem(storageKey(lineId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LineChatMap;
    if (!parsed || typeof parsed !== "object") return {};
    const out: LineChatMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = {
        sessionId: v?.sessionId,
        turns: Array.isArray(v?.turns) ? v.turns : [],
        draft: typeof v?.draft === "string" ? v.draft : "",
        pendingRefs: Array.isArray(v?.pendingRefs) ? v.pendingRefs : [],
        historyLoaded: false,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function saveLineMap(lineId: string, map: LineChatMap): void {
  try {
    const slim: LineChatMap = {};
    for (const [k, v] of Object.entries(map)) {
      slim[k] = {
        sessionId: v.sessionId,
        turns: v.turns,
        draft: v.draft,
        pendingRefs: v.pendingRefs,
      };
    }
    sessionStorage.setItem(storageKey(lineId), JSON.stringify(slim));
  } catch {
    // quota / private mode — in-memory state still works for the session
  }
}

function emptyBucket(): DeptChatBucket {
  return { turns: [], draft: "", pendingRefs: [] };
}

export function ChatProvider({
  line,
  children,
}: {
  line: Company;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [deptId, setDeptIdState] = useState(line.dept_ids[0] ?? "");
  const [sending, setSending] = useState(false);
  const [resumingTaskId, setResumingTaskId] = useState<string | null>(null);

  const storeRef = useRef<ChatStore>({});
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  if (storeRef.current[line.id] === undefined) {
    storeRef.current[line.id] = loadLineMap(line.id);
  }

  const lineMap = storeRef.current[line.id] ?? {};
  const bucket = (deptId && lineMap[deptId]) || emptyBucket();

  const persist = useCallback(
    (next: LineChatMap) => {
      storeRef.current[line.id] = next;
      saveLineMap(line.id, next);
      rerender();
    },
    [line.id, rerender],
  );

  const updateBucket = useCallback(
    (activeDept: string, patch: Partial<DeptChatBucket> | ((cur: DeptChatBucket) => DeptChatBucket)) => {
      const prev = storeRef.current[line.id] ?? {};
      const cur = prev[activeDept] ?? emptyBucket();
      const nextBucket = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
      persist({ ...prev, [activeDept]: nextBucket });
    },
    [line.id, persist],
  );

  const setDeptId = useCallback((id: string) => {
    setDeptIdState(id);
  }, []);

  const setDraft = useCallback(
    (text: string) => {
      if (!deptId) return;
      updateBucket(deptId, { draft: text });
    },
    [deptId, updateBucket],
  );

  const addPendingRefs = useCallback(
    (refs: ChatRef[]) => {
      if (!deptId || refs.length === 0) return;
      updateBucket(deptId, (cur) => ({
        ...cur,
        pendingRefs: mergeRefs(cur.pendingRefs, refs),
      }));
    },
    [deptId, updateBucket],
  );

  const removePendingRef = useCallback(
    (ref: ChatRef) => {
      if (!deptId) return;
      updateBucket(deptId, (cur) => ({
        ...cur,
        pendingRefs: (cur.pendingRefs || []).filter(
          (r) => !(r.type === ref.type && r.id === ref.id && r.taskId === ref.taskId),
        ),
      }));
    },
    [deptId, updateBucket],
  );

  const clearPendingRefs = useCallback(() => {
    if (!deptId) return;
    updateBucket(deptId, { pendingRefs: [] });
  }, [deptId, updateBucket]);

  const bringToChat = useCallback(
    (targetDeptId: string, refs: ChatRef[], opts?: { draft?: string }) => {
      if (!targetDeptId) return;
      setDeptIdState(targetDeptId);
      updateBucket(targetDeptId, (cur) => ({
        ...cur,
        pendingRefs: mergeRefs(cur.pendingRefs, refs),
        draft: opts?.draft !== undefined ? opts.draft : cur.draft,
      }));
      navigate(`/solo/l/${line.id}/chat`);
    },
    [line.id, navigate, updateBucket],
  );

  const appendLocalTurn = useCallback(
    (turn: Extract<ChatTurn, { role: "local" }>) => {
      if (!deptId) return;
      updateBucket(deptId, (cur) => ({
        ...cur,
        turns: [...cur.turns, turn],
      }));
    },
    [deptId, updateBucket],
  );

  const deptIdsKey = (line.dept_ids || []).join(",");

  const reloadDepts = useCallback(async () => {
    if (storeRef.current[line.id] === undefined) {
      storeRef.current[line.id] = loadLineMap(line.id);
    }
    setDeptsLoading(true);
    try {
      const r = await api.get<{ items: DeptCatalogItem[] }>(
        `/v1/lines/${line.id}/depts`,
      );
      setDepts(r.items);
      if (r.items.length === 0) {
        setDeptIdState("");
        return;
      }
      setDeptIdState((cur) =>
        r.items.some((d) => d.id === cur) ? cur : r.items[0].id,
      );
    } catch (e) {
      toast.error(
        apiErrorMessage(e, t("solo.line.conversations.depts-error")),
      );
    } finally {
      setDeptsLoading(false);
    }
  }, [line.id, t, toast]);

  useEffect(() => {
    void reloadDepts();
  }, [line.id, deptIdsKey, reloadDepts]);

  useEffect(() => {
    if (!deptId) return;
    const cur = storeRef.current[line.id]?.[deptId];
    if (cur?.historyLoaded) return;
    let cancelled = false;
    api
      .get<{ items: Record<string, unknown>[] }>(
        `/v1/lines/${line.id}/chat?dept_id=${encodeURIComponent(deptId)}&limit=200`,
      )
      .then((r) => {
        if (cancelled) return;
        const serverTurns = (r.items || [])
          .map((row) => serverRowToTurn(row))
          .filter((x): x is ChatTurn => x != null);
        updateBucket(deptId, (bucketCur) => {
          if (serverTurns.length === 0) {
            return { ...bucketCur, historyLoaded: true };
          }
          return {
            ...bucketCur,
            turns: serverTurns,
            historyLoaded: true,
            sessionId:
              bucketCur.sessionId ||
              [...serverTurns]
                .reverse()
                .find(
                  (turn): turn is Extract<ChatTurn, { role: "user" | "assistant" }> =>
                    turn.role === "user" || turn.role === "assistant",
                )?.session_id,
          };
        });
      })
      .catch(() => {
        if (cancelled) return;
        updateBucket(deptId, { historyLoaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [line.id, deptId, updateBucket]);

  const selectedDept = useMemo(
    () => depts.find((d) => d.id === deptId),
    [depts, deptId],
  );
  const selectedDeptLabel = deptId
    ? resolveDeptDisplay(deptId, depts).label
    : "";

  const canChat = line.state === "running" || line.state === "provisioning";

  // A dept lead that delegates answers with a progress line, then posts the
  // real deliverable minutes later. Poll for it so the chat doesn't look dead.
  const waitForPendingReply = useCallback(
    async (activeDept: string, assistantLabel: string) => {
      const deadline = Date.now() + PENDING_POLL_TOTAL_MS;
      while (Date.now() < deadline) {
        await sleep(PENDING_POLL_INTERVAL_MS);
        let res: { resolved: boolean; working: boolean; reply?: string };
        try {
          res = await api.get(
            `/v1/lines/${line.id}/chat/pending?dept_id=${encodeURIComponent(activeDept)}`,
          );
        } catch {
          return; // older backend / offline — leave the progress line as-is
        }
        if (res.resolved && res.reply) {
          updateBucket(activeDept, (cur) => ({
            ...cur,
            turns: [
              ...cur.turns,
              { role: "assistant", text: res.reply as string, label: assistantLabel },
            ],
          }));
          return;
        }
        if (!res.working) return;
      }
    },
    [line.id, updateBucket],
  );

  const send = useCallback(async () => {
    const msg = bucket.draft.trim();
    const activeDept = deptId;
    if (!msg || sending || !activeDept) return;
    setSending(true);
    const assistantLabel = resolveDeptDisplay(activeDept, depts).name;
    const sessionId = storeRef.current[line.id]?.[activeDept]?.sessionId;
    const refs = storeRef.current[line.id]?.[activeDept]?.pendingRefs ?? [];
    updateBucket(activeDept, (cur) => ({
      ...cur,
      draft: "",
      pendingRefs: [],
      turns: [
        ...cur.turns,
        {
          role: "user",
          text: msg,
          label: t("solo.line.chat.speaker.you"),
          refs: refs.length ? refs : undefined,
        },
      ],
    }));
    try {
      const res = await api.post<{
        ok: boolean;
        reply: string;
        session_id?: string;
        error?: string;
        pending?: boolean;
      }>(`/v1/lines/${line.id}/chat`, {
        message: msg,
        dept_id: activeDept,
        session_id: sessionId,
        refs: refs.length ? refsForApi(refs) : undefined,
      });
      if (res.pending) void waitForPendingReply(activeDept, assistantLabel);
      const nextTurns: ChatTurn[] = [
        {
          role: "assistant",
          text: res.reply || res.error || t("solo.line.chat.empty-reply"),
          session_id: res.session_id,
          label: assistantLabel,
        },
      ];
      const failedTaskRef = refs.find(
        (r) =>
          (r.type === "task" || r.type === "step") &&
          /failed|失败|blocked|受阻/i.test(`${r.detail || ""} ${r.label}`),
      );
      if (failedTaskRef) {
        const tid =
          failedTaskRef.taskId ||
          (failedTaskRef.type === "task" ? failedTaskRef.id : "");
        if (tid) {
          nextTurns.push({
            role: "local",
            kind: "resume_prompt",
            taskId: tid,
            taskTitle: failedTaskRef.label.split(" · ")[0] || tid,
          });
        }
      }
      updateBucket(activeDept, (cur) => ({
        ...cur,
        sessionId: res.session_id ?? cur.sessionId,
        turns: [...cur.turns, ...nextTurns],
      }));
      if (!res.ok) {
        toast.error(
          res.error || t("solo.line.conversations.send-error"),
        );
      }
    } catch (e) {
      const err = apiErrorMessage(e, t("solo.line.conversations.send-error"));
      let recovered = false;
      let shouldPoll = false;
      try {
        const hist = await api.get<{ items: Record<string, unknown>[] }>(
          `/v1/lines/${line.id}/chat?dept_id=${encodeURIComponent(activeDept)}&limit=200`,
        );
        const serverTurns = (hist.items || [])
          .map((row) => serverRowToTurn(row))
          .filter((x): x is ChatTurn => x != null);
        if (serverTurns.some((turn) => turn.role === "assistant")) {
          updateBucket(activeDept, (cur) => ({
            ...cur,
            turns: serverTurns,
            historyLoaded: true,
            sessionId:
              cur.sessionId ||
              [...serverTurns]
                .reverse()
                .find(
                  (turn): turn is Extract<ChatTurn, { role: "user" | "assistant" }> =>
                    turn.role === "user" || turn.role === "assistant",
                )?.session_id,
          }));
          recovered = true;
          const lastAsst = [...serverTurns]
            .reverse()
            .find((turn) => turn.role === "assistant");
          shouldPoll = Boolean(
            lastAsst && lastAsst.role === "assistant" && lastAsst.pending,
          );
        }
      } catch {
        // offline — fall through to the error bubble
      }
      if (!recovered) {
        updateBucket(activeDept, (cur) => ({
          ...cur,
          turns: [
            ...cur.turns,
            { role: "assistant", text: err, label: assistantLabel },
          ],
        }));
        toast.error(err);
      } else if (shouldPoll) {
        void waitForPendingReply(activeDept, assistantLabel);
      }
    } finally {
      setSending(false);
    }
  }, [
    bucket.draft,
    line.id,
    deptId,
    depts,
    sending,
    t,
    toast,
    updateBucket,
    waitForPendingReply,
  ]);

  const resumeTask = useCallback(
    async (taskId: string, opts?: { guidance?: string; stepKey?: string }) => {
      if (!taskId || resumingTaskId) return;
      setResumingTaskId(taskId);
      try {
        const task = await api.post<Task>(
          `/v1/lines/${line.id}/tasks/${taskId}/resume`,
          {
            guidance: opts?.guidance || bucket.draft.trim() || undefined,
            step_key: opts?.stepKey,
            chat_session_id: bucket.sessionId,
          },
        );
        appendLocalTurn({
          role: "local",
          kind: "task_resumed",
          taskId,
          taskTitle: task.title || taskId,
          text: opts?.guidance,
        });
        if (bucket.draft.trim() && opts?.guidance === bucket.draft.trim()) {
          setDraft("");
        }
        toast.success(t("solo.line.chat.resume.started"));
      } catch (e) {
        toast.error(apiErrorMessage(e, t("solo.line.chat.resume.error")));
      } finally {
        setResumingTaskId(null);
      }
    },
    [
      appendLocalTurn,
      bucket.draft,
      bucket.sessionId,
      line.id,
      resumingTaskId,
      setDraft,
      t,
      toast,
    ],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      line,
      depts,
      deptsLoading,
      reloadDepts,
      deptId,
      setDeptId,
      turns: bucket.turns,
      draft: bucket.draft,
      setDraft,
      pendingRefs: bucket.pendingRefs ?? [],
      addPendingRefs,
      removePendingRef,
      clearPendingRefs,
      bringToChat,
      sending,
      canChat,
      selectedDept,
      selectedDeptLabel,
      sessionId: bucket.sessionId,
      historyLoading: !bucket.historyLoaded,
      send,
      appendLocalTurn,
      resumeTask,
      resumingTaskId,
    }),
    [
      line,
      depts,
      deptsLoading,
      reloadDepts,
      deptId,
      setDeptId,
      bucket.turns,
      bucket.draft,
      bucket.pendingRefs,
      bucket.sessionId,
      bucket.historyLoaded,
      setDraft,
      addPendingRefs,
      removePendingRef,
      clearPendingRefs,
      bringToChat,
      sending,
      canChat,
      selectedDept,
      selectedDeptLabel,
      send,
      appendLocalTurn,
      resumeTask,
      resumingTaskId,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useTeamChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useTeamChat must be used within ChatProvider");
  }
  return ctx;
}
