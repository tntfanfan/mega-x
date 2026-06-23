import { Link } from "react-router-dom";

const CARDS = [
  {
    href: "/business/",
    title: "For Business",
    line: "Hire 21 AI departments. Pay by usage.",
    body: "B + G + 团队工作台。订阅整建制 AI 公司，按用量计费。",
    badge: "Business",
  },
  {
    href: "/solo/",
    title: "For Solo",
    line: "Run a 1-person AI company. Stripe self-checkout.",
    body: "C 端 / 超级个体。轻量 onboarding，3 部门入门套餐。",
    badge: "Solo",
  },
  {
    href: "/dev/",
    title: "For Builders",
    line: "Publish your AI department. Earn 97% of subscriptions.",
    body: "上架部门到 Marketplace。3% flat 平台抽成。",
    badge: "Builders",
  },
];

export default function Landing() {
  return (
    <section className="container py-20">
      <div className="text-center mb-12 space-y-3">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8</p>
        <h1 className="text-3xl md:text-5xl font-display text-heading leading-tight">
          租一家 AI 公司，<br className="hidden md:block" />而不是租一个 AI 工具。
        </h1>
        <p className="text-body max-w-2xl mx-auto">
          21 个即插即用的 AI 部门 + Marketplace 上架更多。<br />
          请选择你的入口。
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            to={c.href}
            className="group rounded-md border border-border-solid bg-surface p-6 hover:border-primary transition-colors"
          >
            <div className="text-xs text-muted">{c.badge}</div>
            <h2 className="font-display text-2xl mt-2 group-hover:text-primary">{c.title}</h2>
            <p className="text-primary mt-2 text-sm">{c.line}</p>
            <p className="text-body mt-4 text-sm leading-relaxed">{c.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
