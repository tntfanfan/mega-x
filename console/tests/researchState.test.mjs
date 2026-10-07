import test from 'node:test';import assert from 'node:assert/strict';
import { runActions, createRequestGate, shouldPoll, marketCapabilities } from '../src/lib/research/core.ts';
test('research actions follow run state and never enable legacy task mutations',()=>{
 for(const [state,expected] of [['queued',['cancel']],['running',['cancel']],['paused',['resume','cancel']],['failed',['retry']],['interrupted',['retry']],['done',['discuss']]])assert.deepEqual(runActions({executor:'research',state,run:{id:'r-20261003-1234567890abcdef',state,result:{quality:'complete'}}}),expected);
 assert.deepEqual(runActions({executor:'legacy',state:'failed'}),[]);
 assert.deepEqual(runActions({executor:'research',state:'done',run:{id:'invalid',result:{}}}),[]);
});
test('generation gates discard old reads and old write completion cannot clear a new busy lock',()=>{
 const gate=createRequestGate();const old=gate.capture();assert(gate.current(old));
 gate.invalidate();const fresh=gate.capture();assert(!gate.current(old));assert(gate.current(fresh));
 const first=gate.beginMutation();assert(first);assert.equal(gate.beginMutation(),null);
 gate.invalidate();const next=gate.beginMutation();assert(!gate.endMutation(first));assert(gate.busy());assert(gate.endMutation(next));assert(!gate.busy());
});
test('polls stop after abort/hidden and language capability checks do not mutate cached capabilities',()=>{
 assert(shouldPoll(false,false));assert(!shouldPoll(true,false));assert(!shouldPoll(false,true));
 const caps={supported_languages:['zh'],markets:{A:{can_submit:true,reason:'ready',supported_depths:['quick']}}};
 assert.equal(marketCapabilities(caps,'en').A.can_submit,false);assert.equal(caps.markets.A.can_submit,true);assert.equal(marketCapabilities(caps,'zh').A.can_submit,true);
});
