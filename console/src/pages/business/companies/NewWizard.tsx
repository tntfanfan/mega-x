import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../../lib/api";

const TEMPLATES = [
  { slug: "mega-x-default", emoji: "🏢", name: "通用班底", depts: 21, desc: "最常用，21 个部门完整公司" },
  { slug: "game-studio", emoji: "🎮", name: "游戏工作室", depts: 8, desc: "独立游戏开发团队" },
  { slug: "mcn-content-machine", emoji: "🎬", name: "MCN 内容厂", depts: 6, desc: "AI 短剧 + 内容工业化" },
  { slug: "fintech-research", emoji: "📊", name: "金融研究", depts: 10, desc: "量化策略 + 投研" },
  { slug: "solo-assistant", emoji: "👤", name: "C 端轻量", depts: 3, desc: "个人助手套餐" },
  { slug: "law-firm", emoji: "⚖️", name: "法律事务所", depts: 5, desc: "合同 + 合规 + 诉讼" },
];

export default function NewWizard() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [tplSlug, setTplSlug] = useState(TEMPLATES[0].slug);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const c = await api.post<{ id: string }>("/v1/companies", { name, template_slug: tplSlug });
      navigate(`/business/c/${c.id}/`);
    } catch (e) { console.error(e); setSubmitting(false); }
  };

  return (
    <section className="container py-10 max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">创建新公司</h1>
        <p className="text-sm text-muted mt-1">选择模板后会自动 provision OpenClaw gateway，约 30 秒。</p>
      </header>

      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">公司名称</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="我的 SaaS 创业班底"
          className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
        />
      </label>

      <div className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-2">选择模板</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => setTplSlug(t.slug)}
              className={`text-left p-4 rounded border transition-colors ${
                tplSlug === t.slug
                  ? "bg-primary/10 border-primary"
                  : "bg-surface border-border-solid hover:border-primary"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{t.emoji}</span>
                <span className="text-sm text-heading">{t.name}</span>
                <span className="text-[10px] text-muted ml-auto">{t.depts} 部门</span>
              </div>
              <p className="text-[11px] text-muted mt-1">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button onClick={() => navigate("/business/")} className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary">取消</button>
        <button onClick={submit} disabled={!name.trim() || submitting} className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50">
          {submitting ? "实例化中..." : "创建公司 →"}
        </button>
      </div>
    </section>
  );
}
