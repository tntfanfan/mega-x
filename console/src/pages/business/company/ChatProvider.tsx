/**
 * Company-scoped chat state. Lives under CompanyShell so ChatView can unmount
 * (user switches to Tasks) without losing per-dept sessions / drafts.
 *
 * Storage key = companyId + deptId. sessionStorage restores within the same tab.
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
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem, Task } from "../../../lib/api";
import { resolveDeptDisplay } from "../../../lib/depts";
import { useToast } from "../../../components/ui/Toast";

export { resolveDeptDisplay };

export type ChatTurn =
  | {
      role: "user" | "assistant";
      text: string;
      session_id?: string;
      label?: string;
    }
  | {
      role: "local";
      kind: "task_dispatched";
      taskId: string;
      taskTitle: string;
      /** true = agent auto-detected; false/absent = user clicked dispatch */
      auto?: boolean;
    };

type DeptChatBucket = {
  sessionId?: string;
  turns: ChatTurn[];
  draft: string;
};

type CompanyChatMap = Record<string, DeptChatBucket>; // deptId → bucket

type ChatStore = Record<string, CompanyChatMap>; // companyId → …

type ChatContextValue = {
  company: Company;
  depts: DeptCatalogItem[];
  deptsLoading: boolean;
  deptId: string;
  setDeptId: (id: string) => void;
  turns: ChatTurn[];
  draft: string;
  setDraft: (text: string) => void;
  sending: boolean;
  canChat: boolean;
  selectedDept: DeptCatalogItem | undefined;
  selectedDeptLabel: string;
  sessionId: string | undefined;
  send: () => Promise<void>;
  appendLocalTurn: (turn: Extract<ChatTurn, { role: "local" }>) => void;
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
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCompanyMap(companyId: string, map: CompanyChatMap): void {
  try {
    sessionStorage.setItem(storageKey(companyId), JSON.stringify(map));
  } catch {
    // quota / private mode — in-memory state still works for the session
  }
}

function emptyBucket(): DeptChatBucket {
  return { turns: [], draft: "" };
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
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [deptId, setDeptIdState] = useState(company.dept_ids[0] ?? "");
  const [sending, setSending] = useState(false);

  // Full in-memory store keyed by companyId so switching companies never
  // bleeds sessions. Only the active company's map is sessionStorage-backed.
  const storeRef = useRef<ChatStore>({});
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  // Ensure active company map is hydrated once.
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

  // Load departments whenever the company changes.
  useEffect(() => {
    let cancelled = false;
    setDeptsLoading(true);
    if (storeRef.current[company.id] === undefined) {
      storeRef.current[company.id] = loadCompanyMap(company.id);
    }
    setDeptIdState(company.dept_ids[0] ?? "");
    api
      .get<{ items: DeptCatalogItem[] }>(`/v1/companies/${company.id}/depts`)
      .then((r) => {
        if (cancelled) return;
        setDepts(r.items);
        if (r.items.length === 0) return;
        setDeptIdState((cur) =>
          r.items.some((d) => d.id === cur) ? cur : r.items[0].id,
        );
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(
          apiErrorMessage(e, t("business.company.conversations.depts-error")),
        );
      })
      .finally(() => {
        if (!cancelled) setDeptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only re-fetch when the company identity changes — not on every poll
    // that replaces the company object (provisioning refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, toast, t]);

  const selectedDept = useMemo(
    () => depts.find((d) => d.id === deptId),
    [depts, deptId],
  );
  const selectedDeptLabel = deptId
    ? resolveDeptDisplay(deptId, depts).label
    : "";

  // provisioning = dept install/remove rebuilding the container; the backend
  // now waits for the reconcile before invoking, so keep the input usable.
  const canChat = company.state === "running" || company.state === "provisioning";

  const send = useCallback(async () => {
    const msg = bucket.draft.trim();
    const activeDept = deptId;
    if (!msg || sending || !activeDept) return;
    setSending(true);
    const assistantLabel = resolveDeptDisplay(activeDept, depts).name;
    const sessionId = storeRef.current[company.id]?.[activeDept]?.sessionId;
    updateBucket(activeDept, (cur) => ({
      ...cur,
      draft: "",
      turns: [...cur.turns, { role: "user", text: msg, label: "你" }],
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
      });
      const nextTurns: ChatTurn[] = [
        {
          role: "assistant",
          text: res.reply || res.error || "(空回复)",
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

  const value = useMemo<ChatContextValue>(
    () => ({
      company,
      depts,
      deptsLoading,
      deptId,
      setDeptId,
      turns: bucket.turns,
      draft: bucket.draft,
      setDraft,
      sending,
      canChat,
      selectedDept,
      selectedDeptLabel,
      sessionId: bucket.sessionId,
      send,
      appendLocalTurn,
    }),
    [
      company,
      depts,
      deptsLoading,
      deptId,
      setDeptId,
      bucket.turns,
      bucket.draft,
      bucket.sessionId,
      setDraft,
      sending,
      canChat,
      selectedDept,
      selectedDeptLabel,
      send,
      appendLocalTurn,
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
