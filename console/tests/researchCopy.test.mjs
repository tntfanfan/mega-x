import test from 'node:test';import assert from 'node:assert/strict';
import { createCopy, researchLanguage, personaLabel, companyLabel } from '../src/lib/research/copy.ts';
test('authored literals translate while user text and company names remain intact',()=>{
 const tr=createCopy('en');assert.equal(tr('投资圆桌'),'Investment roundtable');
 assert.equal(tr`报告对话 · ${'原报告'} · 固定版本 ${'r-1'}`,'Report discussion · 原报告 · Fixed version r-1');
 assert.equal(personaLabel({id:'buffett',name:'巴菲特'},'en').name,'Warren Buffett');
 assert.equal(companyLabel('美股','en'),'US Stocks');assert.equal(companyLabel('Acme 美股策略','en'),'Acme 美股策略');
 assert.equal(researchLanguage('ar'),'en');assert.equal(researchLanguage('zh-CN'),'zh');
});
