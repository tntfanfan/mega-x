import { Link } from "react-router-dom";

export default function SoloLanding() {
  return (
    <section className="container py-20 space-y-6">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">Phyntom X8 for Solo</p>
      <h1 className="text-4xl md:text-5xl font-display text-heading max-w-3xl">
        Run a 1-person AI company.
      </h1>
      <p className="text-body max-w-2xl">
        C 端 / 超级个体入口。默认 3 部门轻量套餐（template-solo-assistant），
        Stripe self-checkout，按 token 用量计费。
      </p>
      <div className="pt-4">
        <Link
          to="/solo/dashboard"
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition"
        >
          开始 →
        </Link>
      </div>
    </section>
  );
}
