/**
 * Company conversations — real invoke adapter (R3).
 * POST /v1/companies/:id/chat → openclaw agent / Gateway WS RPC.
 */

import { useOutletContext } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem } from "../../../lib/api";
import { Markdown } from "../../../components/ui/Markdown";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { company: Company };
type Turn = { role: "user" | "assistant"; text: string; session_id?: string; label?: string };

export default function Conversations() {
  const { company } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [deptId, setDeptId] = useState(company.dept_ids[0] ?? "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Per-department chat state — switching depts must not continue another
  // department's session or interleave message history.
  const [sessionsByDept, setSessionsByDept] = useState<Record<string, string>>({});
  const [turnsByDept, setTurnsByDept] = useState<Record<string, Turn[]>>({});
  // provisioning = dept install/remove rebuilding the container; the backend
  // now waits for the reconcile before invoking, so keep the input usable.
  const canChat = company.state === "running" || company.state === "provisioning";

  useEffect(() => {
    api
      .get<{ items: DeptCatalogItem[] }>(`/v1/companies/${company.id}/depts`)
      .then((r) => {
        setDepts(r.items);
        if (r.items.length === 0) return;
        // Keep current selection if still installed; otherwise pick the first.
        setDeptId((cur) =>
          r.items.some((d) => d.id === cur) ? cur : r.items[0].id,
        );
      })
      .catch((e) =>
        toast.error(
          apiErrorMessage(
            e,
            t("business.company.conversations.depts-error", { defaultValue: "加载部门失败" }),
          ),
        ),
      );
  }, [company.id, toast, t]);

  const selectedDept = useMemo(
    () => depts.find((d) => d.id === deptId),
    [depts, deptId],
  );
  const selectedDeptLabel = selectedDept
    ? `${selectedDept.emoji ? `${selectedDept.emoji} ` : ""}${selectedDept.name}`
    : deptId;
  const turns = deptId ? turnsByDept[deptId] ?? [] : [];

  // Fallback options when the depts API hasn't loaded / failed — still chatable by id.
  const selectOptions: { id: string; label: string }[] =
    depts.length > 0
      ? depts.map((d) => ({
          id: d.id,
          label: `${d.emoji ? `${d.emoji} ` : ""}${d.name}`,
        }))
      : company.dept_ids.map((id) => ({ id, label: id }));

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
      }>(`/v1/companies/${company.id}/chat`, {
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
      if (!res.ok) toast.error(res.error || t("business.company.conversations.send-error", { defaultValue: "对话失败" }));
    } catch (e) {
      const err = apiErrorMessage(e, "对话失败");
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
          onChange={(e) => setDeptId(e.target.value)}
          className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm"
        >
          {selectOptions.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </label>

      <div className="flex-1 min-h-[240px] border border-border-solid rounded bg-surface/50 p-4 space-y-3 overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-sm text-muted">
            {selectedDept
              ? `向「${selectedDeptLabel}」发消息，走真实 Gateway 对话。`
              : "向实例中的部门发消息，走真实 Gateway 对话。"}
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
