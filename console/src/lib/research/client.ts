import type { Department, ResearchTask, ResearchFile, Operation, ResearchRequest, Persona, DialogueCapabilities, Conversation, ConversationRequest, DialogueTurn, ResearchLanguage } from './types.ts';
export type ResearchTransport = {
  get<T = unknown>(path: string, init?: Omit<RequestInit, 'method' | 'body'>): Promise<T>;
  post<T = unknown>(path: string, body?: any, init?: Omit<RequestInit, 'method' | 'body'>): Promise<T>;
};
export function createResearchClient(transport: ResearchTransport, apiBase: string, pageOrigin: string) {
  const host = new URL(apiBase || pageOrigin, pageOrigin);
  const base = (company: string) => `/v1/companies/${encodeURIComponent(company)}`;
  const dialogue = (company: string) => `${base(company)}/research/dialogue`;
  function options(signal?: AbortSignal, key?: string) {
    const timeout = AbortSignal.timeout(20000);
    return {signal: signal ? AbortSignal.any([signal, timeout]) : timeout, ...(key ? {headers:{'Idempotency-Key':key}} : {})};
  }
  const get = <T>(path: string, signal?: AbortSignal) => transport.get<T>(path, options(signal));
  const post = <T>(path: string, body: unknown = {}, key?: string) => transport.post<T>(path, body, options(undefined,key));
  return {
    department: (c: string, signal?: AbortSignal) => get<Department>(`${base(c)}/research/department`,signal),
    tasks: (c: string, signal?: AbortSignal) => get<{items:ResearchTask[]}>(`${base(c)}/tasks`,signal),
    task: (c: string, t: string, signal?: AbortSignal) => get<ResearchTask>(`${base(c)}/tasks/${encodeURIComponent(t)}`,signal),
    outputs: (c: string, limit = 200, task?: string, signal?: AbortSignal) => get<{items:ResearchFile[]}>(`${base(c)}/outputs/list?${new URLSearchParams({kind:'html',limit:String(limit),...(task?{task_id:task}:{})})}`,signal),
    async operation(id?: string, signal?: AbortSignal): Promise<Operation | null> {
      if(!id)return null;
      try{return await get<Operation>(`/v1/operations/${encodeURIComponent(id)}`,signal);}
      catch(error){if(signal?.aborted)throw error;return {status:'unavailable',detail:String(error instanceof Error?error.message:error)};}
    },
    install: (c: string) => post(`${base(c)}/research/install`),
    restart: (c: string) => post(`${base(c)}/restart`),
    submit: (c: string, body: ResearchRequest, key: string) => post<{task_id:string}>(`${base(c)}/research/tasks`,body,key),
    retry: (c: string, t: string, key: string) => post(`${base(c)}/research/tasks/${encodeURIComponent(t)}/retry`,{},key),
    resume: (c: string, t: string, r: string) => post(`${base(c)}/research/tasks/${encodeURIComponent(t)}/runs/${encodeURIComponent(r)}/resume`),
    cancel: (c: string, t: string, r: string) => post(`${base(c)}/tasks/${encodeURIComponent(t)}/runs/${encodeURIComponent(r)}/cancel`),
    personas: (c: string, signal?: AbortSignal) => get<Persona[]>(`${dialogue(c)}/personas`,signal),
    dialogueCapabilities: (c: string, signal?: AbortSignal) => get<DialogueCapabilities>(`${dialogue(c)}/capabilities`,signal),
    conversations: (c: string, offset = 0, signal?: AbortSignal) => get<Conversation[]>(`${dialogue(c)}/conversations?offset=${offset}`,signal),
    conversation: (c: string, id: string, signal?: AbortSignal) => get<Conversation>(`${dialogue(c)}/conversations/${encodeURIComponent(id)}`,signal),
    turns: (c: string, id: string, offset = 0, signal?: AbortSignal) => get<DialogueTurn[]>(`${dialogue(c)}/conversations/${encodeURIComponent(id)}/turns?offset=${offset}`,signal),
    createConversation: (c: string, request: ConversationRequest) => post<Conversation>(`${dialogue(c)}/conversations`,{
      ...(request.persona_ids?{persona_ids:request.persona_ids}:{persona_id:request.persona_id}),
      report:request.report?{task_id:request.report.task_id,run_id:request.report.run_id}:null,
    }),
    sendTurn: (c: string, id: string, request: {message:string;language:ResearchLanguage}, key: string) => post<DialogueTurn>(`${dialogue(c)}/conversations/${encodeURIComponent(id)}/turns`,request,key),
    async preview(c: string, path: string) {
      const result=await post<{url:string}>(`${base(c)}/outputs/preview-url`,{path});
      const url=new URL(result.url,host);
      if(!['http:','https:'].includes(url.protocol)||url.origin!==host.origin||url.username||url.password||!url.pathname.startsWith('/v1/outputs/s/'))throw new Error('报告链接无效');
      return url.href;
    },
    downloadUrl: (c: string, path: string) => new URL(`${base(c)}/outputs/raw?${new URLSearchParams({path,download:'1'})}`,host).href,
  };
}
export type ResearchClient = ReturnType<typeof createResearchClient>;
