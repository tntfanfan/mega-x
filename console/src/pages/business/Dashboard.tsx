import { useEffect, useState } from "react";
import { api, type DeptCard, type Me } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function BusinessDashboard() {
  const { me, loading: meLoading } = useAuth();
  const [depts, setDepts] = useState<DeptCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: DeptCard[]; total: number }>("/v1/depts")
      .then((res) => setDepts(res.items))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <section className="container py-10 space-y-8">
      <header className="space-y-1">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">Business</p>
        <h1 className="font-display text-3xl text-heading">Dashboard</h1>
      </header>

      <MeBlock me={me} loading={meLoading} />
      <DeptsBlock depts={depts} error={error} />
    </section>
  );
}

function MeBlock({ me, loading }: { me: Me | null; loading: boolean }) {
  return (
    <div className="rounded-md border border-border-solid bg-surface p-5">
      <h2 className="text-muted text-xs uppercase tracking-widest mb-3">/v1/me (mock)</h2>
      {loading ? (
        <p className="text-body text-sm">Loading…</p>
      ) : me ? (
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <dt className="text-muted">User</dt>
          <dd className="text-body">
            {me.user.display_name} <span className="text-muted">({me.user.email})</span>
          </dd>
          <dt className="text-muted">Roles</dt>
          <dd className="text-body">{me.roles.join(", ")}</dd>
          <dt className="text-muted">Tenants</dt>
          <dd className="text-body">{me.tenants.map((t) => t.name).join(", ")}</dd>
        </dl>
      ) : (
        <p className="text-fusion text-sm">未登录或后端不可达</p>
      )}
    </div>
  );
}

function DeptsBlock({ depts, error }: { depts: DeptCard[] | null; error: string | null }) {
  return (
    <div>
      <h2 className="text-muted text-xs uppercase tracking-widest mb-3">
        /v1/depts (mock, from roster.json) — {depts?.length ?? "…"}
      </h2>
      {error && <p className="text-fusion text-sm">{error}</p>}
      {depts && (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {depts.map((d) => (
            <li
              key={d.id}
              className="rounded-md border border-border-solid bg-surface p-4 hover:border-primary transition"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg text-heading">{d.id}</h3>
                <span
                  className={
                    "text-[10px] tracking-widest uppercase px-2 py-0.5 rounded " +
                    (d.source_type === "builtin"
                      ? "bg-primary/10 text-primary"
                      : "bg-ai/10 text-ai")
                  }
                >
                  {d.source_type}
                </span>
              </div>
              <p className="text-body text-sm mt-1">{d.name}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                <span>{d.role_count} agents</span>
                <span className="text-heading">·</span>
                <Tier label="HIGH" n={d.tier_breakdown.HIGH} />
                <Tier label="MED" n={d.tier_breakdown.MEDIUM} />
                <Tier label="LOW" n={d.tier_breakdown.LOW} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tier({ label, n }: { label: string; n: number }) {
  if (!n) return null;
  return (
    <span className="text-muted">
      {label}: <span className="text-body">{n}</span>
    </span>
  );
}
