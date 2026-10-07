import type { Market, ResearchCapabilities, ResearchLanguage, ResearchRun, StorageLike, Conversation, DialogueContext, ResearchTask } from './types.ts';
export function normalTicker(value: string, market: Market = 'A') {
  const ticker = value.trim().toUpperCase();
  if (market === 'US') {
    if (!/^[A-Z]{1,6}(?:[.\-][A-Z]{1,2})?$/.test(ticker)) throw new Error('请输入美股代码，例如 AAPL 或 BRK.B。');
    return ticker.replace('.', '-');
  }
  if (/^\d{6}$/.test(ticker)) {
    const exchange = /^6/.test(ticker) ? 'SH' : /^[03]/.test(ticker) ? 'SZ' : /^(?:[48]|920)/.test(ticker) ? 'BJ' : null;
    if (exchange) return `${ticker}.${exchange}`;
    throw new Error('无法识别交易所，请检查股票代码，或输入带 .SH、.SZ、.BJ 的完整代码。');
  }
  if (!/^\d{6}\.(SH|SZ|BJ)$/.test(ticker)) throw new Error('请输入 6 位 A 股代码，例如 600519，也支持 600519.SH。');
  return ticker;
}
const keyName = (company: string, action: string, body: unknown) => `native-pending:${company}:${action}:${JSON.stringify(body)}`;
export function requestKey(store: StorageLike, company: string, action: string, body: unknown) {
  const name=keyName(company,action,body);let key=store.getItem(name);
  if (!key) { key=crypto.randomUUID();store.setItem(name,key); }return key;
}
export function forgetKey(store: StorageLike, company: string, action: string, body: unknown) {store.removeItem(keyName(company,action,body));}
export function stageStates(run: ResearchRun) {
  const last=Number(run?.last_seq)||0,seq=run?.stage_state==='failed'&&last%2===0?last-1:last;
  return [0,1,2].map(i=>seq>=i*2+2?'complete':seq===i*2+1?'current':'pending') as ('pending'|'current'|'complete')[];
}
export function marketCapabilities(caps: ResearchCapabilities = {}, language: ResearchLanguage = 'zh') {
  const result: Partial<Record<Market, NonNullable<ResearchCapabilities['markets']>[Market]>> = {A:caps.markets?.A||{can_submit:!!caps.can_submit,supported_depths:caps.supported_depths||[],reason:caps.reason}};
  const us=caps.markets?.US;
  if(us&&!['disabled','not_enabled_for_company'].includes(us.reason))result.US={...us,supported_depths:(us.supported_depths||[]).filter(d=>d==='quick')};
  if(!(caps.supported_languages||['zh']).includes(language))for(const market of Object.values(result)){market.reason=market.can_submit?'language_not_supported':market.reason;market.can_submit=false;}
  return result;
}
export const taskMarket = (task: ResearchTask): Market => task.research?.request?.market || 'A';
export function citationTarget(c: Conversation, id: string) {
  const r=c?.report;if(!r||!c.sections?.some(s=>s.id===id)||!/^t-[a-f0-9]{8}$/.test(r.task_id)||!/^r-\d{8}-[a-f0-9]{16}$/.test(r.run_id))return null;
  return `tasks/${r.task_id}/runs/${r.run_id}/final/report.html`;
}
export function canSend(s: {company:string;can_send?:boolean;busy?:boolean;generating?:boolean;message:string}) {
  return !!s.company&&!!s.can_send&&!s.busy&&!s.generating&&s.message.trim().length>0&&s.message.length<=4000;
}
export function acceptsContext(a: DialogueContext, b: DialogueContext) {return ['company','cid','persona','generation'].every(k=>a[k]===b[k]);}
export const stateLabels = {running:'执行中',queued:'排队中',pending:'准备中',provisioning:'启动中',active:'已就绪',done:'已完成',completed:'已完成',failed:'失败',error:'启动失败',interrupted:'已中断',paused:'已暂停',canceled:'已取消',cancelled:'已取消',not_installed:'未安装',ready:'已就绪',deleted:'已删除',accepted:'等待生成',partial_failed:'部分失败'};
export const reasons = {language_not_supported:'当前执行服务不支持此语言，请更新执行服务后重试。',disabled:'投研功能尚未开启，请先完成本地运行配置。',not_enabled_for_company:'此公司尚未加入投研开放范围。',not_installed:'安装股票投研部后，可以在这里提交研究。',execution_not_ready:'投研执行服务尚未就绪。请完成镜像构建及独立执行服务配置。',ready:'部门和执行服务已就绪，可以开始研究。'};
export const researchErrors = {run_timeout:'本次研究执行超时，未能完成报告。请检查数据源连接后重试。（run_timeout）',unsupported_security:'目前仅支持 NYSE / Nasdaq 美国普通股票，不支持 ETF、ADR 或 OTC。',symbol_not_found:'未找到该股票代码，请核对后重试。',security_identity_unverified:'数据源未能确认标的身份，暂时不能生成可靠报告。',provider_rate_limited:'免费数据源限流，请稍后重试。',provider_timeout:'数据源连接超时，请检查网络后重试。',insufficient_facts:'关键行情或财报不足，未生成报告。',market_currency_mismatch:'数据源的市场或币种不一致，已停止研究。',research_execution_failed:'研究执行失败，请检查执行服务日志后重试。'};
