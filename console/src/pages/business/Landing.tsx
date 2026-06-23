import { Link } from "react-router-dom";

export default function BusinessLanding() {
  return (
    <section className="container py-20 space-y-6">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8 for Business</p>
      <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
        Hire 21 AI departments. Pay by usage.
      </h1>
      <p className="text-body max-w-2xl">
        B + G + 团队工作台。订阅 Marketplace 上的官方 + 第三方部门，按 token 用量计费；
        提供 Org Canvas / 对话 / 账单 / 审批 / 角色管理。
      </p>
      <div className="pt-4 flex gap-3">
        <Link
          to="/business/dashboard"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          进入工作台 →
        </Link>
        <a
          href="https://mega-x.ai/phyntom-x8.html"
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border-solid px-5 py-2 text-sm text-body hover:text-primary hover:border-primary transition"
        >
          产品介绍
        </a>
      </div>
    </section>
  );
}
