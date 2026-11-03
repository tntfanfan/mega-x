import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnouncementsClient, scoreLabel, safeSourceUrl } from '../src/lib/research/announcements.ts';

test('company scope and filters stay in server requests',async()=>{
  const requests=[];
  const transport={get:async(path,options)=>{requests.push([path,options]);return {items:[],total:7}},
    post:async(path,body)=>{requests.push([path,body]);return body},
    patch:async()=>{},delete:async(path)=>{requests.push([path])}};
  const client=createAnnouncementsClient(transport);
  const page=await client.list('c-a',{page:2,code:'000001',q:'业绩'});
  assert.equal(page.total,7);
  assert.match(requests[0][0],/^\/v1\/companies\/c-a\/research\/announcements\?/);
  assert.match(requests[0][0],/page=2/);
  await client.follow('c-b','600000');
  assert.equal(requests[1][0],'/v1/companies/c-b/research/announcements/watchlist');
  assert.deepEqual(requests[1][1],{stock_code:'600000'});
});

test('failed writes reject, preserving caller state',async()=>{
  const client=createAnnouncementsClient({post:async()=>{throw Error('denied')}});
  await assert.rejects(client.follow('c-a','000001'),/denied/);
});

test('zero scores and missing scores have different display',()=>{
  assert.equal(scoreLabel(0),'0');assert.equal(scoreLabel(null),'—');assert.equal(scoreLabel(-2),'-2');
  assert.equal(safeSourceUrl('javascript:alert(1)'),undefined);
  assert.equal(safeSourceUrl('https://www.cninfo.com.cn/notice'),'https://www.cninfo.com.cn/notice');
});
