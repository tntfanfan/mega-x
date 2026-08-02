/**
 * Company conversations — real invoke adapter (R3).
 * POST /v1/companies/:id/chat → openclaw agent / Gateway WS RPC.
 */

import { useOutletContext } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { company: Company };
type Turn = { role: "user" | "assistant"; text: string; session_id?: string };

export default function Conversations() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [deptId, setDeptId] = useState(company.dept_ids[0] ?? "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [turns, setTurns] = useState<Turn[]>([]);
  // provisioning = dept install/remove rebuilding the container; the backend
  // now waits for the reconcile before invoking, so keep the input usable.
  const canChat = company.state === "running" || company.state === "provisioning";

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true);
    setInput("");
    setTurns((cur) => [...cur, { role: "user", text: msg }]);
    try {
      const res = await api.post<{
        ok: boolean;
        reply: string;
        session_id?: string;
        error?: string;
      }>(`/v1/companies/${company.id}/chat`, {
        message: msg,
        dept_id: deptId || undefined,
        session_id: sessionId,
      });
      if (res.session_id) setSessionId(res.session_id);
      setTurns((cur) => [
        ...cur,
        { role: "assistant", text: res.reply || res.error || "(空回复)", session_id: res.session_id },
      ]);
      if (!res.ok) toast.error(res.error || t("business.company.conversations.send-error", { defaultValue: "对话失败" }));
    } catch (e) {
      const err = apiErrorMessage(e, "对话失败");
      setTurns((cur) => [...cur, { role: "assistant", text: err }]);
      toast.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="p-6 flex flex-col h-full max-w-3xl gap-4">
      <header>
        <h1 className="font-display text-2xl text-heading">
          {t("business.company.conversations.title")}
        </h1>
        <p className="text-sm text-muted">
          {t("business.company.conversations.subtitle")}
        </p>
      </header>

      <label className="block max-w-xs">
        <div className="text-xs uppercase tracking-widest text-muted mb-1">部门</div>
        <select
          value={deptId}
          onChange={(e) => { setDeptId(e.target.value); setSessionId(undefined); }}
          className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm"
        >
          {company.dept_ids.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </label>

      <div className="flex-1 min-h-[240px] border border-border-solid rounded bg-surface/50 p-4 space-y-3 overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-sm text-muted">向实例中的部门发消息，走真实 Gateway 对话。</p>
        )}
        {turns.map((turn, i) => (
          <div
            key={i}
            className={`text-sm whitespace-pre-wrap ${
              turn.role === "user" ? "text-heading" : "text-body"
            }`}
          >
            <span className="text-[10px] uppercase tracking-widest text-muted me-2">
              {turn.role === "user" ? "你" : "Agent"}
            </span>
            {turn.text}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="输入消息…"
          disabled={sending || !canChat}
          className="flex-1 bg-surface border border-border-solid rounded px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !input.trim() || !canChat}
          className="rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {sending ? "…" : "发送"}
        </button>
      </div>
      {company.state === "provisioning" ? (
        <p className="text-xs text-muted">实例重建中（安装/移除部门后约需 1 分钟）——可以直接发消息，就绪后会自动送达</p>
      ) : company.state !== "running" ? (
        <p className="text-xs text-muted">实例状态：{company.state}（就绪后可对话）</p>
      ) : null}
    </section>
  );
}
