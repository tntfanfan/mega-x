import assert from "node:assert/strict";
import test from "node:test";

import {
  bullets, isBlank, logActor, noteOf, parseFields, parseLog, parseSections, parseTable, sectionBody, splitFrontmatter, stripComments,
} from "../src/apps/series/notes.ts";

// What series_mcp.project writes for a new project (project_template), after a few updates.
const PROJECT = `# 海边的少年
<!-- 带 auto 标记的章节由 project 服务生成，手改会被覆盖；其余章节可以直接改 -->

## Snapshot
第 1 集剧本已定稿，正在出主角概念图。

## Canonical <!-- auto -->
- bible → setting/bible.v002.md@v2 — 海边小镇的成长故事

## Defaults
- 竖屏 9:16
- 每集结尾留一个钩子

## In progress <!-- auto 部分 + 手写部分 -->
<!-- auto:begin -->
- 第 2 集剧本 v1 草稿
<!-- auto:end -->
- 等用户挑主角的脸

## Stale <!-- auto -->
- （空）

## Topic files
- story/threads.md — 伏笔台账，写任何一集前读
`;

test("sections: title, headings without their auto comments, trimmed bodies", () => {
  const doc = parseSections(PROJECT);
  assert.equal(doc.title, "海边的少年");
  assert.equal(doc.intro, "");
  assert.deepEqual(doc.sections.map(s => s.heading), ["Snapshot", "Canonical", "Defaults", "In progress", "Stale", "Topic files"]);
  assert.equal(sectionBody(doc, "Snapshot"), "第 1 集剧本已定稿，正在出主角概念图。");
  assert.deepEqual(bullets(sectionBody(doc, "Defaults")), ["竖屏 9:16", "每集结尾留一个钩子"]);
  assert.equal(sectionBody(doc, "Nope"), "");
});

test("the auto block can be dropped before parsing, leaving the hand-written lines", () => {
  const doc = parseSections(PROJECT.replace(/<!--\s*auto:begin\s*-->[\s\S]*?<!--\s*auto:end\s*-->/g, ""));
  assert.deepEqual(bullets(sectionBody(doc, "In progress")), ["等用户挑主角的脸"]);
});

test("template placeholders count as nothing", () => {
  assert.equal(isBlank("（还没写：一两句话说这部剧现在到哪了）"), true);
  assert.equal(isBlank("- （空）"), true);
  assert.equal(isBlank("  "), true);
  assert.equal(isBlank("有内容"), false);
  assert.deepEqual(bullets("- （空）"), []);
});

test("bullets join continuation lines and take numbered items", () => {
  assert.deepEqual(bullets("- 第一条\n  接着写\n\n1. 第二条\n2) 第三条\n\n散文一段"), ["第一条 接着写", "第二条", "第三条", "散文一段"]);
});

test("headings inside code fences are not sections", () => {
  const doc = parseSections("# T\n## A\n```\n## not a heading\n```\n## B\nb");
  assert.deepEqual(doc.sections.map(s => s.heading), ["A", "B"]);
  assert.match(sectionBody(doc, "A"), /## not a heading/);
});

test("comments are stripped, single and multi-line", () => {
  assert.equal(stripComments("a<!-- x -->b<!--\ny\n-->c"), "abc");
});

test("log lines: time, session, text; the page's sessions are the user", () => {
  const log = parseLog(`# 决定流水
- 2026-10-19T10:33:54+08:00 [s-abc] bible → setting/bible.v002.md@v2 定稿
- 2026-10-19T11:00:00+08:00 [ui-7f] 用户把第 1 集剧本改成 v3 定稿
- 2026-10-19T12:00:00+08:00 没有会话的一行
- 手写的一条
`);
  assert.equal(log.length, 4);
  assert.deepEqual(log[0], { at: "2026-10-19T10:33:54+08:00", session: "s-abc", text: "bible → setting/bible.v002.md@v2 定稿" });
  assert.equal(logActor(log[0]), "agent");
  assert.equal(logActor(log[1]), "user");
  assert.equal(log[2].session, "");
  assert.deepEqual(log[3], { at: "", session: "", text: "手写的一条" });
});

test("the threads ledger table", () => {
  const body = "| id | 内容 | 埋于 | 计划收于 | 状态 |\n|---|---|---|---|---|\n| T1 | 哥哥的旧照片 | ep-001 | ep-010 | 未收 |\n| T2 | 灯塔 | ep-002 |\n";
  const table = parseTable(body);
  assert.deepEqual(table.header, ["id", "内容", "埋于", "计划收于", "状态"]);
  assert.deepEqual(table.rows[0], ["T1", "哥哥的旧照片", "ep-001", "ep-010", "未收"]);
  assert.deepEqual(table.rows[1], ["T2", "灯塔", "ep-002", "", ""], "short rows are padded to the header");
  assert.equal(parseTable("| id | x |\n|---|---|\n").rows.length, 0);
  assert.equal(parseTable("no table here"), null);
});

test("frontmatter fields: scalars, flow lists, block lists, quotes, null", () => {
  const [yaml, body] = splitFrontmatter(`---
kind: script
version: 2
status: canonical
depends_on: [setting/bible.v002.md@v2, "story/outline.v001.md@v1"]
title: "第 1 集：涨潮"
characters:
  - 阿海
  - 小雨
revision_of: ~
logline: >
  first
  second
---
# 正文
`);
  assert.equal(body, "# 正文\n");
  const fields = Object.fromEntries(parseFields(yaml).map(f => [f.key, f.value]));
  assert.equal(fields.kind, "script");
  assert.equal(fields.version, "2");
  assert.deepEqual(fields.depends_on, ["setting/bible.v002.md@v2", "story/outline.v001.md@v1"]);
  assert.equal(fields.title, "第 1 集：涨潮");
  assert.deepEqual(fields.characters, ["阿海", "小雨"]);
  assert.equal(fields.revision_of, "");
  assert.equal(fields.logline, "first\nsecond");
});

test("no frontmatter → empty fields, text untouched", () => {
  assert.deepEqual(splitFrontmatter("# hi\n"), ["", "# hi\n"]);
});

test("note files by path", () => {
  assert.equal(noteOf("PROJECT.md"), "project");
  assert.equal(noteOf("preferences.md"), "preferences");
  assert.equal(noteOf("log.md"), "log");
  assert.equal(noteOf("story/threads.md"), "threads");
  assert.equal(noteOf("story/ep-001/PROJECT.md"), null);
});
