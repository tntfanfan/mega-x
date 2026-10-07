import { english } from './english.ts';
import type { Persona, ResearchLanguage } from './types.ts';
export const researchLanguage = (locale: string): ResearchLanguage => locale.startsWith('zh') ? 'zh' : 'en';
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(Object.keys(english).sort((a,b) => b.length-a.length).map(escape).join('|'), 'g');
export function createCopy(language: ResearchLanguage) {
  const literal = (text: string) => language === 'en' ? text.replace(pattern, key => english[key]) : text;
  return (value: string | TemplateStringsArray, ...values: unknown[]): string => typeof value === 'string'
    ? literal(value) : value.reduce((out, part, i) => out + literal(part) + (i < values.length ? String(values[i] ?? '') : ''), '');
}
export function companyLabel(name: string, language: ResearchLanguage) {
  const aliases = new Map([['美股','US Stocks'],['本地投研工作室','Local Research Studio']]);
  return language === 'en' ? aliases.get(name) ?? name : name;
}
const profiles = {
  buffett: ['Warren Buffett','Business quality, economic moats, and long-term value'],
  munger: ['Charlie Munger','Mental models, incentives, and avoiding mistakes'],
  graham: ['Benjamin Graham','Intrinsic value, financial resilience, and margin of safety'],
  lynch: ['Peter Lynch','Understand the business, classify growth, and verify the story'],
};
export function personaLabel(persona: Persona, language: ResearchLanguage): Persona {
  if (!persona) return persona;
  const copy = persona.name_en && persona.summary_en ? [persona.name_en,persona.summary_en] : profiles[persona.id];
  return language === 'en' && copy ? {...persona,name:copy[0],summary:copy[1]} : persona;
}
export const dateLabel = (value: string | undefined, language: ResearchLanguage) => value ? new Date(value).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {hour12:false}) : '—';
