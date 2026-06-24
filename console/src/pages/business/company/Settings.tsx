import { useOutletContext } from "react-router-dom";
import type { Company } from "../../../lib/api";

type Ctx = { company: Company };

export default function Settings() {
  const { company } = useOutletContext<Ctx>();
  return (
    <section className="p-6 space-y-4">
      <h1 className="font-display text-2xl text-heading">公司设置</h1>
      <dl className="text-sm space-y-2">
        <div><dt className="text-muted text-xs uppercase tracking-widest">名称</dt><dd className="text-body">{company.name}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">模板</dt><dd className="text-body font-mono">{company.template_slug}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">网关端口</dt><dd className="text-body font-mono">{company.gateway_port}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">部门数</dt><dd className="text-body">{company.dept_ids.length}</dd></div>
        <div><dt className="text-muted text-xs uppercase tracking-widest">30 天 token</dt><dd className="text-body">{company.token_usage_30d.toLocaleString()}</dd></div>
      </dl>
      <p className="text-xs text-muted pt-4 border-t border-border-solid">完整设置（成员/计费/暂停/删除）将在后续阶段实现。</p>
    </section>
  );
}
