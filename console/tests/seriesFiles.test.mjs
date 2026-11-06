import assert from "node:assert/strict";
import test from "node:test";

import {
  aboutPath, ancestors, buildTree, fileType, findNode, projectPath, rowOf, sizeLabel, splitName, visibleRows,
} from "../src/apps/series/files.ts";

const entries = [
  { path: ".project", dir: true },
  { path: ".project/status.json", size: 10 },
  { path: "story", dir: true },
  { path: "story/ep-010", dir: true },
  { path: "story/ep-002", dir: true },
  { path: "story/ep-002/script-ep-002.v001.md", size: 2048, owner: { ref: "story/ep-002/script-ep-002.v001.md@v1", logical: "story/ep-002/script-ep-002", kind: "script", status: "draft", role: "text" } },
  { path: "story/ep-010/script-ep-010.v001.md", size: 5 },
  { path: "PROJECT.md", size: 1 },
  { path: "assets/hero.png", size: 3 },
];

test("the tree puts folders first, the ledger last, and episodes in number order", () => {
  const root = buildTree(entries);
  assert.deepEqual(root.children.map(c => c.name), ["assets", "story", ".project", "PROJECT.md"]);
  assert.deepEqual(findNode(root, "story").children.map(c => c.name), ["ep-002", "ep-010"]);
  assert.equal(root.files, 5);
  assert.equal(findNode(root, "story").files, 2);
  assert.equal(findNode(root, "assets").dir, true, "a folder the listing skipped is still made");
  assert.equal(findNode(root, "nope/x"), null);
});

test("rows follow what is expanded, and a filter opens the way to every hit", () => {
  const root = buildTree(entries);
  const names = rows => rows.map(r => `${"  ".repeat(r.depth)}${r.node.name}`);
  assert.deepEqual(names(visibleRows(root, new Set())), ["assets", "story", ".project", "PROJECT.md"]);
  assert.deepEqual(names(visibleRows(root, new Set(["story", "story/ep-002"]))),
    ["assets", "story", "  ep-002", "    script-ep-002.v001.md", "  ep-010", ".project", "PROJECT.md"]);
  assert.deepEqual(names(visibleRows(root, new Set(), "EP-010")), ["story", "  ep-010", "    script-ep-010.v001.md"]);
  assert.deepEqual(visibleRows(root, new Set(), "zzz"), []);
});

test("a chain of single folders shares one row, and rowOf finds it", () => {
  const root = buildTree([
    { path: "assets/characters/keeper/a/hero.png", size: 1 },
    { path: "assets/characters/keeper/a/side.png", size: 1 },
    { path: "PROJECT.md", size: 1 },
  ]);
  const shut = visibleRows(root, new Set());
  assert.deepEqual(shut.map(r => [r.label, r.node.path]), [["assets/characters/keeper/a", "assets/characters/keeper/a"], ["PROJECT.md", "PROJECT.md"]]);
  const open = visibleRows(root, new Set(["assets/characters/keeper/a"]));
  assert.deepEqual(open.map(r => `${r.depth}:${r.label}`), ["0:assets/characters/keeper/a", "1:hero.png", "1:side.png", "0:PROJECT.md"]);
  assert.equal(rowOf(shut, "assets/characters").node.path, "assets/characters/keeper/a", "a folder inside a chain lands on the chain");
  assert.equal(rowOf(shut, "assets/characters/keeper/a/hero.png").node.path, "assets/characters/keeper/a", "a hidden file lands on its folder");
  assert.equal(rowOf(open, "assets/characters/keeper/a/side.png").node.path, "assets/characters/keeper/a/side.png");
  assert.equal(rowOf(open, "nope"), undefined);
});

test("names, paths and sizes", () => {
  assert.deepEqual(ancestors("a/b/c.md"), ["a", "a/b"]);
  assert.deepEqual(splitName("script-ep-001.v002.md"), ["script-ep-001", ".v002.md"]);
  assert.deepEqual(splitName("PROJECT.md"), ["PROJECT", ".md"]);
  assert.deepEqual(splitName(".project"), [".project", ""]);
  assert.equal(projectPath("story/outline.v002.md@v2", "demo"), "story/outline.v002.md");
  assert.equal(projectPath("/srv/o/board/dept-series/series/demo/assets/a.png", "demo"), "assets/a.png");
  assert.equal(fileType("a/b.v001.md"), "markdown");
  assert.equal(fileType("hero.PNG"), "image");
  assert.equal(fileType(".project/objects/abc", { role: "object" }), "markdown");
  assert.equal(fileType(".project/lock"), "other");
  assert.equal(sizeLabel(900), "900 B");
  assert.equal(sizeLabel(2048), "2 KB");
  assert.equal(sizeLabel(1536 * 1024), "1.5 MB");
  assert.match(aboutPath(".project/objects/abc"), /原样副本/);
  assert.equal(aboutPath("story/ep-002/script-ep-002.v001.md"), "");
});
