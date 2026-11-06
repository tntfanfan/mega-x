import assert from "node:assert/strict";
import test from "node:test";

import { askIsAnswerable, openAskBubble } from "../src/apps/series/askTarget.ts";

const ask = (id) => ({ id, questions: [{ question: "怎么处理？", options: [{ label: "定稿" }, { label: "重出" }] }] });
const clip = { url: "media?path=clip.mp4", mime: "video/mp4" };
const still = { url: "media?path=shot.png", mime: "image/png" };

function gate(bubble, question, extra = {}) {
  const card = (bubble.asks || []).find(item => item.id) || { id: undefined };
  return askIsAnswerable(bubble, card, { busy: false, connected: true, question, ...extra });
}

test("a video-only bubble after the question leaves that question open", () => {
  const lead = { id: "lead", role: "assistant", text: "镜头视频完成", asks: [ask("a1")] };
  const video = { id: "sub", role: "assistant", text: "", label: "视频批量", media: [clip, { ...clip, url: "media?path=copy.mp4" }] };
  const items = [lead, video];
  assert.equal(openAskBubble(items), lead);
  assert.equal(gate(lead, openAskBubble(items)), true);
  assert.equal(gate(video, openAskBubble(items)), false);
});

test("whitespace on the video bubble is still only the clip", () => {
  const lead = { role: "assistant", text: "完成", asks: [ask("a1")] };
  const video = { role: "assistant", text: " \n", media: [clip] };
  assert.equal(openAskBubble([lead, video]), lead);
});

test("an ask stored on the same bubble as its pictures stays open", () => {
  const lead = { role: "assistant", text: "四张都出来了", asks: [ask("a1")], media: [still, still] };
  assert.equal(openAskBubble([lead]), lead);
  assert.equal(gate(lead, lead), true);
});

test("the question is open when it is already the last bubble", () => {
  const lead = { role: "assistant", text: "补一张吗？", asks: [ask("a1")] };
  assert.equal(openAskBubble([{ role: "user", text: "出图" }, lead]), lead);
});

test("a later reply with text closes the previous question", () => {
  const older = { role: "assistant", text: "怎么处理？", asks: [ask("a1")] };
  const newer = { role: "assistant", text: "已经按定稿收好了" };
  assert.equal(openAskBubble([older, newer]), undefined);
  assert.equal(gate(older, undefined), false);
});

test("a newer question wins, and a clip after it does not hide it", () => {
  const older = { role: "assistant", text: "上一题", asks: [ask("old")] };
  const newer = { role: "assistant", text: "这一题", asks: [ask("new")] };
  const video = { role: "assistant", text: "", media: [clip] };
  const items = [older, newer, video];
  assert.equal(openAskBubble(items), newer);
  assert.equal(gate(older, newer), false);
  assert.equal(gate(newer, newer), true);
});

test("a user message after the question keeps the card closed", () => {
  const lead = { role: "assistant", text: "怎么处理？", asks: [ask("a1")] };
  const typed = { role: "user", text: "先放着" };
  assert.equal(openAskBubble([lead, typed]), undefined);
  assert.equal(openAskBubble([lead, { role: "user", text: "定稿", pending: true }]), undefined);
});

test("an error or cancelled tail closes the question", () => {
  const lead = { role: "assistant", text: "怎么处理？", asks: [ask("a1")] };
  assert.equal(openAskBubble([lead, { role: "assistant", text: "", error: "已取消" }]), undefined);
});

test("an ask without an id does not become clickable and does not reopen an older one", () => {
  const older = { role: "assistant", text: "旧题", asks: [ask("old")] };
  const legacy = { role: "assistant", text: "旧历史里的单题", asks: [{ question: "选一个", options: ["甲", "乙"] }] };
  assert.equal(openAskBubble([older, legacy]), undefined);
  assert.equal(gate(legacy, legacy), false);
});

test("a streaming bubble does not steal a finished question, and a busy turn still blocks the click", () => {
  const lead = { role: "assistant", text: "怎么处理？", asks: [ask("a1")] };
  const live = { role: "assistant", text: "", media: [clip], live: true };
  const question = openAskBubble([lead, live]);
  assert.equal(question, lead);
  assert.equal(gate(lead, question, { busy: true }), false);
  assert.equal(askIsAnswerable(live, ask("live"), { busy: false, connected: true, question }), true);
  assert.equal(gate(lead, question, { connected: false }), false);
});
