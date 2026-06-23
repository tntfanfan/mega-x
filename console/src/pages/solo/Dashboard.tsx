import BusinessDashboard from "../business/Dashboard";

// Solo 与 Business 共享 95% 组件树（doc/product/console-prd.md §1）；
// 默认渲染 Business Dashboard，仅 onboarding 入口与默认推荐部门不同。
export default function SoloDashboard() {
  return <BusinessDashboard />;
}
