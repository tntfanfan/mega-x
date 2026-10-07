import type { ReactNode } from 'react';
import { stateLabels } from '../../lib/research/core';
import type { createCopy } from '../../lib/research/copy';
export type Copy = ReturnType<typeof createCopy>;
export const buttonClass='rounded-md border border-border-solid px-3 py-2 text-sm text-body hover:text-primary hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const primaryClass='rounded-md bg-primary px-4 py-2 text-sm font-semibold text-bg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed';
export const inputClass='w-full rounded-md border border-border-solid bg-surface-2 px-3 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:outline-none';
export function Badge({state,tr}:{state:string;tr:Copy}) {
  const tone=['done','completed','ready','active'].includes(state)?'text-spark-mint': ['failed','error','interrupted'].includes(state)?'text-fusion':['running','queued','provisioning','accepted'].includes(state)?'text-spark-blue':'text-muted';
  return <span className={`shrink-0 text-xs ${tone}`}>{tr(stateLabels[state]||state||'等待更新')}</span>;
}
export function Section({id,title,description,action,children}:{id?:string;title:string;description?:string;action?:ReactNode;children:ReactNode}) {
  return <section id={id} className="min-w-0 rounded-md border border-border-solid bg-surface research-section"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-solid px-5 py-4"><div><h2 className="text-xl text-heading">{title}</h2>{description&&<p className="mt-1 text-sm text-muted max-w-prose">{description}</p>}</div>{action}</header>{children}</section>;
}
