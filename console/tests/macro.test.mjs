import test from 'node:test';
import assert from 'node:assert/strict';
import {createMacroClient,macroNumber} from '../src/lib/research/macro.ts';
import {researchPageFromPath} from '../src/lib/research/navigation.ts';
test('macro route and scoped query preserve filters and abort signal',async()=>{
  const calls=[];const transport={get:async(path,options)=>{calls.push([path,options]);return {items:[]}},post:async(path,body)=>{calls.push([path,body]);return {id:'job'}}};
  const client=createMacroClient(transport,'c a');
  const ctl=new AbortController();
  await client.shareholders({stock_code:'000001',mode:'history',start_date:'2026-01-01',page:2},ctl.signal);
  const url=new URL(calls[0][0],'https://test');
  assert.equal(url.pathname,'/v1/companies/c%20a/research/macro/shareholders');
  assert.equal(url.searchParams.get('mode'),'history');assert.equal(url.searchParams.get('page'),'2');
  ctl.abort();assert.equal(calls[0][1].signal.aborted,true);
  await client.compare(['申万50','申万300'],'市净率',104);
  assert.equal(new URL(calls[1][0],'https://test').searchParams.get('names'),'申万50,申万300');
  await client.collect({kind:'sw',mode:'recent',weeks:52});
  assert.deepEqual(calls[2][1],{kind:'sw',mode:'recent',weeks:52});
  assert.equal(researchPageFromPath('macro'),'macro');
});
test('missing values differ from zero and request errors propagate',async()=>{
  assert.equal(macroNumber(null),'—');assert.equal(macroNumber(0),'0');
  const client=createMacroClient({post:async()=>{throw Error('denied')}} ,'ca');
  await assert.rejects(client.stop('job'),/denied/);
});
