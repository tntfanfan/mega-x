import { Link } from "react-router-dom";

export default function AdminLanding() {
  return (
    <section className="container py-20 space-y-6">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8 Admin</p>
      <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
        Platform internal · 审核 · 风控 · 财务
      </h1>
      <p className="text-body max-w-2xl">
        不对外营销。Marketplace 审核工作台 / Tenant 管理 / 全平台 metrics / 分账与提现。
      </p>
      <div className="pt-4">
        <Link
          to="/admin/review-queue"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          ReviewQueue →
        </Link>
      </div>
    </section>
  );
}
