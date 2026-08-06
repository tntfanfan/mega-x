/**
 * Solo line chat panel — POST /v1/lines/:id/chat → openclaw agent / Gateway WS RPC.
 *
 * 独立路由已取消，嵌在「任务」页右侧（见 TasksList）。
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem } from "../../../lib/api";
import { Markdown } from "../../../components/ui/Markdown";
import { useToast } from "../../../components/ui/Toast";

type Turn = { role: "user" | "assistant"; text: string; session_id?: string; label?: string };

export interface ChatPanelProps {
  line: Company;
  className?: string;
}

export function ChatPanel({ line, className = "" }: ChatPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [deptId, setDeptId] = useState(line.dept_ids[0] ?? "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionsByDept, setSessionsByDept] = useState<Record<string, string>>({});
  const [turnsByDept, setTurnsByDept] = useState<Record<string, Turn[]>>({});
  const canChat = line.state === "running" || line.state === "provisioning";

  useEffect(() => {
    api
      .get<{ items: DeptCatalogItem[] }>(`/v1/lines/${line.id}/depts`)
      .then((r) => {
        setDepts(r.items);
        if (r.items.length === 0) return;
        setDeptId((cur) =>
          r.items.some((d) => d.id === cur) ? cur : r.items[0].id,
        );
      })
      .catch((e) =>
        toast.error(apiErrorMessage(e, t("solo.line.conversations.depts-error"))),
      );
  }, [line.id, toast, t]);

  const selectedDept = useMemo(
    () => depts.find((d) => d.id === deptId),
    [depts, deptId],
  );
  const selectedDeptLabel = selectedDept
    ? `${selectedDept.emoji ? `${selectedDept.emoji} ` : ""}${selectedDept.name}`
    : deptId;
  const turns = deptId ? turnsByDept[deptId] ?? [] : [];

  const selectOptions: { id: string; label: string }[] =
    depts.length > 0
      ? depts.map((d) => ({
          id: d.id,
          label: `${d.emoji ? `${d.emoji} ` : ""}${d.name}`,
        }))
      : line.dept_ids.map((id) => ({ id, label: id }));

  const send = async () => {
    const msg = input.trim();
    const activeDept = deptId;
    if (!msg || sending || !activeDept) return;
    setSending(true);
    setInput("");
    const assistantLabel = selectedDept?.name || activeDept || "Agent";
    setTurnsByDept((cur) => ({
      ...cur,
      [activeDept]: [...(cur[activeDept] ?? []), { role: "user", text: msg, label: "你" }],
    }));
    try {
      const res = await api.post<{
        ok: boolean;
        reply: string;
        session_id?: string;
        error?: string;
      }>(`/v1/lines/${line.id}/chat`, {
        message: msg,
        dept_id: activeDept,
        session_id: sessionsByDept[activeDept],
      });
      if (res.session_id) {
        setSessionsByDept((cur) => ({ ...cur, [activeDept]: res.session_id! }));
      }
      setTurnsByDept((cur) => ({
        ...cur,
        [activeDept]: [
          ...(cur[activeDept] ?? []),
          {
            role: "assistant",
            text: res.reply || res.error || "(空回复)",
            session_id: res.session_id,
            label: assistantLabel,
          },
        ],
      }));
      if (!res.ok) toast.error(res.error || t("solo.line.conversations.send-error"));
    } catch (e) {
      const err = apiErrorMessage(e, t("solo.line.conversations.send-error"));
      setTurnsByDept((cur) => ({
        ...cur,
        [activeDept]: [
          ...(cur[activeDept] ?? []),
          { role: "assistant", text: err, label: assistantLabel },
        ],
      }));
      toast.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      <div className="px-4 py-3 border-b border-border-solid shrink-0 space-y-2">
        <div className="text-xs text-muted">{t("solo.line.conversations.title")}</div>
        <label className="block">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
            {t("solo.line.conversations.team-label")}
          </div>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="w-full bg-surface border border-border-solid rounded px-3 py-1.5 text-sm"
          >
            {selectOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex-1 min-h-0 p-4 space-y-3 overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-sm text-muted">
            {selectedDept
              ? t("solo.line.conversations.hint", { team: selectedDeptLabel })
              : t("solo.line.conversations.empty")}
          </p>
        )}
        {turns.map((turn, i) => (
          <div
            key={i}
            className={`text-sm ${turn.role === "user" ? "text-heading" : "text-body"}`}
          >
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
              {turn.label || (turn.role === "user" ? "你" : selectedDept?.name || "Agent")}
            </div>
            {turn.role === "assistant" ? (
              <Markdown text={turn.text} />
            ) : (
              <p className="leading-relaxed whitespace-pre-wrap">{turn.text}</p>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border-solid shrink-0 space-y-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={t("solo.line.conversations.placeholder")}
            disabled={sending || !canChat}
            className="flex-1 bg-surface border border-border-solid rounded px-3 py-2 text-sm disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !input.trim() || !canChat}
            className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {sending ? "…" : t("solo.line.conversations.send")}
          </button>
        </div>
        {line.state === "provisioning" ? (
          <p className="text-xs text-muted">{t("solo.line.conversations.provisioning")}</p>
        ) : line.state !== "running" ? (
          <p className="text-xs text-muted">{t("solo.line.conversations.not-ready", { state: line.state })}</p>
        ) : null}
      </div>
    </div>
  );
}
