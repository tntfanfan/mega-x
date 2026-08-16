/**
 * Company-scoped chat state. Lives under CompanyShell so ChatView can unmount
 * (user switches to Tasks) without losing per-dept sessions / drafts.
 *
 * Storage key = companyId + deptId. sessionStorage restores within the same tab;
 * server history (GET /chat) is the source of truth once loaded.
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
  normalizeRefs,
  refsForApi,
  type ChatRef,
} from "../../../lib/chatRefs";
import { resolveDeptDisplay } from "../../../lib/depts";
import { useToast } from "../../../components/ui/Toast";

export { resolveDeptDisplay };
export type { ChatRef };

export type ChatTurn =
  | {
      role: "user" | "assistant";
      text: string;
      session_id?: string;
      label?: string;
      refs?: ChatRef[];
    }
  | {
      role: "local";
      kind: "task_dispatched";
      taskId: string;
      taskTitle: string;
      /** true = agent auto-detected; false/absent = user clicked dispatch */
      auto?: boolean;
    }
  | {
      role: "local";
      kind: "task_resumed";
      taskId: string;
      taskTitle: string;
      text?: string;
    }
  | {
      role: "local";
      kind: "task_event";
      taskId: string;
      taskTitle: string;
      event: "failed" | "done" | "artifact";
      detail?: string;
    }
  | {
      role: "local";
      kind: "resume_prompt";
      taskId: string;
      taskTitle: string;
    };

type DeptChatBucket = {
  sessionId?: string;
  turns: ChatTurn[];
  draft: string;
  pendingRefs: ChatRef[];
  historyLoaded?: boolean;
};

type CompanyChatMap = Record<string, DeptChatBucket>; // deptId → bucket

type ChatStore = Record<string, CompanyChatMap>; // companyId → …

type ChatContextValue = {
  company: Company;
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

const STORAGE_PREFIX = "console.chat.v1:";

function storageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`;
}

function loadCompanyMap(companyId: string): CompanyChatMap {
  try {
    const raw = sessionStorage.getItem(storageKey(companyId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CompanyChatMap;
    if (!parsed || typeof parsed !== "object") return {};
    // Ensure pendingRefs exists on hydrated buckets.
    const out: CompanyChatMap = {};
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

function saveCompanyMap(companyId: string, map: CompanyChatMap): void {
  try {
    // Don't persist historyLoaded — always re-fetch on new tab session.
    const slim: CompanyChatMap = {};
    for (const [k, v] of Object.entries(map)) {
      slim[k] = {
        sessionId: v.sessionId,
        turns: v.turns,
        draft: v.draft,
        pendingRefs: v.pendingRefs,
      };
    }
    sessionStorage.setItem(storageKey(companyId), JSON.stringify(slim));
  } catch {
    // quota / private mode — in-memory state still works for the session
  }
}

function emptyBucket(): DeptChatBucket {
  return { turns: [], draft: "", pendingRefs: [] };
}

export function serverRowToTurn(row: Record<string, unknown>): ChatTurn | null {
  const role = row.role;
  if (role === "local") {
    const kind = String(row.kind || "");
    if (kind === "task_dispatched") {
      return {
        role: "local",
        kind: "task_dispatched",
        taskId: String(row.taskId || row.task_id || ""),
        taskTitle: String(row.taskTitle || row.task_title || row.title || ""),
        auto: Boolean(row.auto),
      };
    }
    if (kind === "task_resumed") {
      return {
        role: "local",
        kind: "task_resumed",
        taskId: String(row.taskId || row.task_id || ""),
        taskTitle: String(row.taskTitle || row.task_title || ""),
        text: row.text != null ? String(row.text) : undefined,
      };
    }
    if (kind === "task_event") {
      const event = String(row.event || "failed");
      if (event !== "failed" && event !== "done" && event !== "artifact") return null;
      return {
        role: "local",
        kind: "task_event",
        taskId: String(row.taskId || row.task_id || ""),
        taskTitle: String(row.taskTitle || row.task_title || ""),
        event,
        detail: row.detail != null ? String(row.detail) : undefined,
      };
    }
    if (kind === "resume_prompt") {
      return {
        role: "local",
        kind: "resume_prompt",
        taskId: String(row.taskId || row.task_id || ""),
        taskTitle: String(row.taskTitle || row.task_title || ""),
      };
    }
    return null;
  }
  if (role === "user" || role === "assistant") {
    return {
      role,
      text: String(row.text || ""),
      session_id: row.session_id != null ? String(row.session_id) : undefined,
      label: row.label != null ? String(row.label) : undefined,
      refs: normalizeRefs(row.refs),
    };
  }
  return null;
}

export function ChatProvider({
  company,
  children,
}: {
  company: Company;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [deptId, setDeptIdState] = useState(company.dept_ids[0] ?? "");
  const [sending, setSending] = useState(false);
  const [resumingTaskId, setResumingTaskId] = useState<string | null>(null);

  const storeRef = useRef<ChatStore>({});
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  if (storeRef.current[company.id] === undefined) {
    storeRef.current[company.id] = loadCompanyMap(company.id);
  }

  const companyMap = storeRef.current[company.id] ?? {};
  const bucket = (deptId && companyMap[deptId]) || emptyBucket();

  const persist = useCallback(
    (next: CompanyChatMap) => {
      storeRef.current[company.id] = next;
      saveCompanyMap(company.id, next);
      rerender();
    },
    [company.id, rerender],
  );

  const updateBucket = useCallback(
    (activeDept: string, patch: Partial<DeptChatBucket> | ((cur: DeptChatBucket) => DeptChatBucket)) => {
      const prev = storeRef.current[company.id] ?? {};
      const cur = prev[activeDept] ?? emptyBucket();
      const nextBucket = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
      persist({ ...prev, [activeDept]: nextBucket });
    },
    [company.id, persist],
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
      navigate(`/business/c/${company.id}/chat`);
    },
    [company.id, navigate, updateBucket],
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

  const deptIdsKey = (company.dept_ids || []).join(",");

  const reloadDepts = useCallback(async () => {
    if (storeRef.current[company.id] === undefined) {
      storeRef.current[company.id] = loadCompanyMap(company.id);
    }
    setDeptsLoading(true);
    try {
      const r = await api.get<{ items: DeptCatalogItem[] }>(
        `/v1/companies/${company.id}/depts`,
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
        apiErrorMessage(e, t("business.company.conversations.depts-error")),
      );
    } finally {
      setDeptsLoading(false);
    }
  }, [company.id, t, toast]);

  // Reload when the company or its installed depts change (install/remove
  // used to mutate dept_ids in place, so ChatProvider never saw the update).
  useEffect(() => {
    void reloadDepts();
  }, [company.id, deptIdsKey, reloadDepts]);

  // Hydrate history from server when switching depts (once per dept per mount).
  useEffect(() => {
    if (!deptId) return;
    const cur = storeRef.current[company.id]?.[deptId];
    if (cur?.historyLoaded) return;
    let cancelled = false;
    api
      .get<{ items: Record<string, unknown>[] }>(
        `/v1/companies/${company.id}/chat?dept_id=${encodeURIComponent(deptId)}&limit=200`,
      )
      .then((r) => {
        if (cancelled) return;
        const serverTurns = (r.items || [])
          .map((row) => serverRowToTurn(row))
          .filter((x): x is ChatTurn => x != null);
        updateBucket(deptId, (bucketCur) => {
          // Prefer server when it has content; keep local-only turns that
          // haven't been flushed yet by appending after a short overlap check.
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
        // Offline / older backend — keep sessionStorage turns.
        updateBucket(deptId, { historyLoaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [company.id, deptId, updateBucket]);

  const selectedDept = useMemo(
    () => depts.find((d) => d.id === deptId),
    [depts, deptId],
  );
  const selectedDeptLabel = deptId
    ? resolveDeptDisplay(deptId, depts).label
    : "";

  const canChat = company.state === "running" || company.state === "provisioning";

  const send = useCallback(async () => {
    const msg = bucket.draft.trim();
    const activeDept = deptId;
    if (!msg || sending || !activeDept) return;
    setSending(true);
    const assistantLabel = resolveDeptDisplay(activeDept, depts).name;
    const sessionId = storeRef.current[company.id]?.[activeDept]?.sessionId;
    const refs = storeRef.current[company.id]?.[activeDept]?.pendingRefs ?? [];
    updateBucket(activeDept, (cur) => ({
      ...cur,
      draft: "",
      pendingRefs: [],
      turns: [
        ...cur.turns,
        {
          role: "user",
          text: msg,
          label: t("business.company.chat.speaker.you"),
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
        task?: Task;
      }>(`/v1/companies/${company.id}/chat`, {
        message: msg,
        dept_id: activeDept,
        session_id: sessionId,
        refs: refs.length ? refsForApi(refs) : undefined,
      });
      const nextTurns: ChatTurn[] = [
        {
          role: "assistant",
          text: res.reply || res.error || t("business.company.chat.empty-reply"),
          session_id: res.session_id,
          label: assistantLabel,
        },
      ];
      if (res.task?.id) {
        nextTurns.push({
          role: "local",
          kind: "task_dispatched",
          taskId: res.task.id,
          taskTitle: res.task.title || msg.slice(0, 30),
          auto: true,
        });
      }
      // After discussing a failed task/step, offer resume.
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
          res.error || t("business.company.conversations.send-error"),
        );
      }
    } catch (e) {
      const err = apiErrorMessage(e, t("business.company.conversations.send-error"));
      updateBucket(activeDept, (cur) => ({
        ...cur,
        turns: [
          ...cur.turns,
          { role: "assistant", text: err, label: assistantLabel },
        ],
      }));
      toast.error(err);
    } finally {
      setSending(false);
    }
  }, [
    bucket.draft,
    company.id,
    deptId,
    depts,
    sending,
    t,
    toast,
    updateBucket,
  ]);

  const resumeTask = useCallback(
    async (taskId: string, opts?: { guidance?: string; stepKey?: string }) => {
      if (!taskId || resumingTaskId) return;
      setResumingTaskId(taskId);
      try {
        const task = await api.post<Task>(
          `/v1/companies/${company.id}/tasks/${taskId}/resume`,
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
        toast.success(t("business.company.chat.resume.started"));
      } catch (e) {
        toast.error(apiErrorMessage(e, t("business.company.chat.resume.error")));
      } finally {
        setResumingTaskId(null);
      }
    },
    [
      appendLocalTurn,
      bucket.draft,
      bucket.sessionId,
      company.id,
      resumingTaskId,
      setDraft,
      t,
      toast,
    ],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      company,
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
      company,
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

export function useDeptChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useDeptChat must be used within ChatProvider");
  }
  return ctx;
}
