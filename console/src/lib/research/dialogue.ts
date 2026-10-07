import { canSend } from './core.ts';
import type { DialogueContext, Persona, ReportBinding, ConversationRequest } from './types.ts';
export type Selection = DialogueContext & {kind:'single'|'roundtable';participants:string[]};
export const turnStates={pending:'等待发言',partial:'部分完成',accepted:'问题已保存',running:'正在思考',completed:'已完成',failed:'生成失败',interrupted:'生成已中断'};
export const dialogueErrors={model_auth_failed:'模型服务凭据无效，请在本机更新模型配置后重试。问题已保存。',disabled:'人物对话尚未开启；已有记录仍可查看。',not_enabled_for_company:'此公司尚未开放人物对话；已有记录仍可查看。',execution_not_ready:'对话服务尚未就绪，请稍后刷新。',not_installed:'请先安装股票投研部。',conversation_busy:'当前对话正在生成，请等待完成。',company_busy:'此公司已有两项对话正在生成，请稍后再试。',conversation_limit:'此对话已达 200 个问题，请新建对话。',generation_timeout:'本次生成超时。问题已保存，可以重新提问。',generation_interrupted:'服务重启或执行中断。问题已保存，未自动重试。',generation_failed:'本次生成失败。问题已保存，请稍后重新提问。',empty_reply:'本次没有收到有效回复，请重新提问。',report_unavailable:'绑定的报告已不可访问或内容发生变化。请重新选择报告，新建对话。',idempotency_conflict:'此请求编号已用于另一个问题，请刷新后重试。'};
export function dialogueError(raw:unknown){const text=String(raw??'');for(const [code,message] of Object.entries(dialogueErrors)){if(text.includes(code))return message;}return text;}
export function selectParticipants(selected:string[],personas:Persona[],id:string,checked:boolean,persisted:boolean){
  if(persisted||checked&&!selected.includes(id)&&selected.length>=4)return selected;
  const picked=new Set(selected);if(checked)picked.add(id);else picked.delete(id);
  return personas.filter(p=>picked.has(p.id)).map(p=>p.id);
}
export function dialogueDraftKey(ctx:Selection,report:ReportBinding|null){return `native-dialogue-draft:${ctx.company}:${ctx.cid||(ctx.kind==='roundtable'?'roundtable:'+ctx.participants.join(','):ctx.persona)+':'+(report?.run_id||'free')}`;}
export function dialogueCanSend(s:Parameters<typeof canSend>[0]&{kind:string;participants:string[]}) {return canSend(s)&&(s.kind!=='roundtable'||s.participants.length>=2&&s.participants.length<=4);}
export function conversationRequest(s:Pick<Selection,'kind'|'persona'|'participants'>,report:ReportBinding|null):ConversationRequest {
  return {...s.kind==='roundtable'?{persona_ids:[...s.participants]}:{persona_id:s.persona},report:report?{task_id:report.task_id,run_id:report.run_id}:null};
}
