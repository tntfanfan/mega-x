import test from "node:test";
import assert from "node:assert/strict";
import {
  schools,
  catalogForLanguage,
  schoolOf,
  availablePersonas,
} from "../src/lib/research/catalog.ts";
test("complete catalog is kept; English hides CN schools without changing original data", () => {
  const before = JSON.stringify(schools),
    zh = catalogForLanguage("zh"),
    en = catalogForLanguage("en");
  assert(zh.length > en.length);
  assert(zh.reduce((n, s) => n + s.members.length, 0) > 40);
  assert(en.every((g) => !["E", "F"].includes(g.id)));
  assert.equal(JSON.stringify(schools), before);
  assert.equal(schoolOf({ id: "buffett" }), "A");
  assert.equal(
    availablePersonas(
      [
        { id: "buffett" },
        { id: schools.find((g) => g.id === "E").members[0].id },
      ],
      "en",
    ).length,
    1,
  );
});
