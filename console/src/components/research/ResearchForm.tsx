import { useEffect, useState } from "react";
import {
  marketCapabilities,
  normalTicker,
  reasons,
} from "../../lib/research/core";
import type { Market, ResearchLanguage } from "../../lib/research/types";
import type { ResearchState } from "../../hooks/useResearch";
import {
  Badge,
  Section,
  buttonClass,
  inputClass,
  primaryClass,
  type Copy,
} from "./shared";
export function ResearchForm({
  research,
  companyState,
  language,
  tr,
  onSubmitted,
}: {
  research: ResearchState;
  companyState: string;
  language: ResearchLanguage;
  tr: Copy;
  onSubmitted?: () => void;
}) {
  const [market, setMarket] = useState<Market>("A"),
    [depth, setDepth] = useState("quick"),
    [ticker, setTicker] = useState(""),
    [error, setError] = useState("");
  const caps = marketCapabilities(research.department?.capabilities, language),
    active = market in caps ? market : "A",
    cap = caps[active] || {},
    us = active === "US";
  useEffect(() => {
    if (market !== active) {
      setMarket(active);
      setTicker("");
    }
    if (!cap.supported_depths?.includes(depth))
      setDepth(cap.supported_depths?.[0] || "quick");
  }, [active, market, depth, JSON.stringify(cap.supported_depths)]);
  const status = research.department?.installation_status;
  const readiness =
    status === "pending"
      ? "正在安装投研部。容器重建期间请稍候，页面会自动更新。"
      : status === "failed"
        ? "投研部安装或注册校验失败。可以重新安装；若再次失败，请检查运行日志。"
        : reasons[cap.reason] || `暂不可执行：${cap.reason || "状态未知"}`;
  return (
    <Section
      id="research"
      title={tr("新建股票研究")}
      description={tr("A 股支持快速与标准研究；美股开放后支持快速研究")}
      action={<Badge state={status || companyState} tr={tr} />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="text-base text-heading">{tr("股票投研部")}</h3>
          <p className="mt-1 text-sm text-muted" role="status">
            {research.loading ? tr("正在读取…") : tr(readiness)}
          </p>
        </div>
        <div className="flex gap-2">
          {research.department?.can_install && (
            <button
              className={buttonClass}
              disabled={research.busy}
              onClick={() => void research.install()}
            >
              {tr(status === "failed" ? "重新安装" : "安装投研部")}
            </button>
          )}
          {companyState === "error" && (
            <button
              className={buttonClass}
              disabled={research.busy}
              onClick={() => void research.restart()}
            >
              {tr("重试启动公司")}
            </button>
          )}
        </div>
      </div>
      {research.operation && (
        <p className="px-5 pb-3 text-xs text-muted">
          {tr("容器配置操作：")}
          {tr(research.operation.status || "处理中")}
          {research.operation.error || research.operation.detail
            ? ` / ${typeof (research.operation.error || research.operation.detail) === "string" ? research.operation.error || research.operation.detail : JSON.stringify(research.operation.error || research.operation.detail)}`
            : ""}
        </p>
      )}
      <form
        className="px-5 pb-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            const submitted = await research.submit({
              market: active,
              ticker: normalTicker(ticker, active),
              depth,
              school: null,
              language,
            });
            if (submitted) onSubmitted?.();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        <label className="mb-4 flex max-w-xs items-center gap-3 whitespace-nowrap text-sm text-body">
          {tr("交易市场")}
          <select
            className={inputClass}
            value={active}
            disabled={research.busy}
            onChange={(e) => {
              setMarket(e.target.value as Market);
              setTicker("");
              setError("");
            }}
          >
            {Object.keys(caps).map((m) => (
              <option value={m} key={m}>
                {tr(m === "US" ? "美股" : "A 股")}
              </option>
            ))}
          </select>
        </label>
        <fieldset
          disabled={research.busy || research.loading || !!research.syncError}
          className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <label className="text-sm text-body">
            {tr("股票代码")}
            <input
              className={`${inputClass} mt-2`}
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder={tr(us ? "例如 AAPL、MSFT、BRK.B" : "例如 600519")}
              required
              autoComplete="off"
              maxLength={us ? 9 : 9}
              pattern={
                us
                  ? "[a-zA-Z]{1,6}([.\\-][a-zA-Z]{1,2})?"
                  : "[0-9]{6}(\\.(SH|SZ|BJ|sh|sz|bj))?"
              }
            />
            <small className="mt-2 block text-muted">
              {tr(
                us
                  ? "NYSE / Nasdaq 美国普通股票，美元计价"
                  : "输入 6 位数字，自动识别交易所；也支持完整代码",
              )}
            </small>
          </label>
          <label className="text-sm text-body">
            {tr("研究深度")}
            <select
              className={`${inputClass} mt-2`}
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
            >
              {["quick", "standard"]
                .filter((d) => !us || d === "quick")
                .map((d) => (
                  <option
                    key={d}
                    value={d}
                    disabled={!cap.supported_depths?.includes(d)}
                  >
                    {tr(d === "quick" ? "快速了解" : "标准研究")}
                  </option>
                ))}
            </select>
            <small className="mt-2 block text-muted">
              {tr(us ? "美股目前仅支持快速研究" : "深度研究暂未开放")}
            </small>
          </label>
          <button
            type="submit"
            className={`${primaryClass} self-start lg:mt-7`}
            disabled={!cap.can_submit}
          >
            {tr("开始研究")}
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 text-sm text-fusion">
            {tr(error)}
          </p>
        )}
      </form>
    </Section>
  );
}
