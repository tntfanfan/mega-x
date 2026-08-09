/**
 * Line-scoped chat state. Lives under LineShell so ChatView can unmount
 * (user switches to Tasks) without losing per-team sessions / drafts.
 *
 * Storage key = lineId + deptId. sessionStorage restores within the same tab.
 * Mirrors business/company/ChatProvider — paths use /v1/lines.
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
import { useToast } from "../../../components/ui/Toast";
import {
  resolveDeptDisplay,
  type ChatTurn,
} from "../../business/company/ChatProvider";

export type { ChatTurn };
export { resolveDeptDisplay };

type DeptChatBucket = {
  sessionId?: string;
  turns: ChatTurn[];
  draft: string;
};

type LineChatMap = Record<string, DeptChatBucket>; // deptId → bucket

type ChatStore = Record<string, LineChatMap>; // lineId → …

type ChatContextValue = {
  line: Company;
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

const STORAGE_PREFIX = "console.solo.chat.v1:";

function storageKey(lineId: string): string {
  return `${STORAGE_PREFIX}${lineId}`;
}

function loadLineMap(lineId: string): LineChatMap {
  try {
    const raw = sessionStorage.getItem(storageKey(lineId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LineChatMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLineMap(lineId: string, map: LineChatMap): void {
  try {
    sessionStorage.setItem(storageKey(lineId), JSON.stringify(map));
  } catch {
    // quota / private mode — in-memory state still works for the session
  }
}

function emptyBucket(): DeptChatBucket {
  return { turns: [], draft: "" };
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
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [deptId, setDeptIdState] = useState(line.dept_ids[0] ?? "");
  const [sending, setSending] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setDeptsLoading(true);
    if (storeRef.current[line.id] === undefined) {
      storeRef.current[line.id] = loadLineMap(line.id);
    }
    setDeptIdState(line.dept_ids[0] ?? "");
    api
      .get<{ items: DeptCatalogItem[] }>(`/v1/lines/${line.id}/depts`)
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
          apiErrorMessage(e, t("solo.line.conversations.depts-error")),
        );
      })
      .finally(() => {
        if (!cancelled) setDeptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id, toast, t]);

  const selectedDept = useMemo(
    () => depts.find((d) => d.id === deptId),
    [depts, deptId],
  );
  const selectedDeptLabel = deptId
    ? resolveDeptDisplay(deptId, depts).label
    : "";

  const canChat = line.state === "running" || line.state === "provisioning";

  const send = useCallback(async () => {
    const msg = bucket.draft.trim();
    const activeDept = deptId;
    if (!msg || sending || !activeDept) return;
    setSending(true);
    const assistantLabel = resolveDeptDisplay(activeDept, depts).name;
    const sessionId = storeRef.current[line.id]?.[activeDept]?.sessionId;
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
      }>(`/v1/lines/${line.id}/chat`, {
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
          res.error || t("solo.line.conversations.send-error"),
        );
      }
    } catch (e) {
      const err = apiErrorMessage(e, t("solo.line.conversations.send-error"));
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
    line.id,
    deptId,
    depts,
    sending,
    t,
    toast,
    updateBucket,
  ]);

  const value = useMemo<ChatContextValue>(
    () => ({
      line,
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
      line,
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

export function useTeamChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useTeamChat must be used within ChatProvider");
  }
  return ctx;
}
