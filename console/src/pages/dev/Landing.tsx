import { Link } from "react-router-dom";

export default function DevLanding() {
  return (
    <section className="container py-20 space-y-6">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8 for Builders</p>
      <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
        Publish your AI department. Earn 97%.
      </h1>
      <p className="text-body max-w-2xl">
        Builder 端。Wizard 起草部门 → Web IDE 编辑 SOUL / AGENTS → 沙盒预览 → 提交审核 → 上架。
        第三方部门订阅费 <span className="text-primary">97% 给开发者，3% 给平台</span>。
      </p>
      <div className="pt-4">
        <Link
          to="/dev/home"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          进入 DevHome →
        </Link>
      </div>
    </section>
  );
}
