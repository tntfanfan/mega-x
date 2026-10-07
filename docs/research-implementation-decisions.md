# Research migration implementation decisions

These choices were made while implementing the approved migration. All work is
local. The migration is on `feat/research-frontend-migration`; main has not been
merged and no remote push, PR or deployment was performed.

## Rulings and their limits

- Ruling: Native inline selected after user continued the recommended approach — no repeated execution-method question — cost if wrong: user might prefer per-task agents.
- Ruling: Use sibling .worktrees/mega-x-research with a feature branch — reversible isolation outside target repo — cost if wrong: extra local directory until integration.
- Task 1: Ruling: Node 24 native TypeScript tests instead of VM transpilation — direct module tests preserve real dependency behavior — cost: new test command requires Node 24, production remains Node 18.18+.
- Task 1: Ruling: expose createCopy(language) tagged translator rather than global translate — avoids cross-page locale subscriptions — cost: a small adapter signature change, no behavioral loss.
- Task 3: Ruling: baseline existing tests/typecheck failures are recorded and implementation proceeds — unrelated source defects do not block migration — cost if wrong: final all-suite verification needs baseline corrections or explicit limitations.
- Task 3: Ruling: test pure TypeScript directly on Node 24; README will document test floor, preserving Node 18.18+ production requirements — avoids hidden VM mocks.
- Task 5: Ruling: correct baseline validation defects in separate local commit — missing Node types, generic component inference, missing known activity states and a timer-less test VM caused existing failures — cost if wrong: four small pre-existing areas change in addition to research code.
- Task 5: Ruling: use port 5190 because 5173/5174 are occupied — preserve existing services — cost: preview URL differs from README default.
- Task 6: Ruling: preserve two exact source company-display aliases through CompanySwitcher — completes source localization behavior without mutating stored or custom company names — cost if wrong: those two legacy names are aliased elsewhere in the console too.
- Final: Ruling: regrade active-persona clearing from Minor to Important — selecting the currently active identity unexpectedly forks the next question into a new thread, contrary to source behavior and a selector's normal contract — cost if wrong: one no-op guard retains the source behavior instead of treating repeat click as New Conversation.
- Final: Ruling: preserve shared CompanyShell hidden polling — it is pre-existing company-shell behavior outside this migration; all research-specific and dialogue polling stops while hidden — cost if wrong: shared company status reads still run in background tabs.
- Final: Ruling: live container/model execution remains untriggered — read-only verification plus controlled write protocol tests meet the no-real-mutations validation constraint — cost: actual backend generation is not proven by these frontend tests.

## Independent reviews

The whole-branch reviewer found no Critical issue, three Important issues and one
Minor source-behavior regression. The fix pass addresses all four: concurrent
history reads cannot erase newly accepted questions, loading cannot discard typed
drafts, request IDs fall back to crypto.getRandomValues on HTTP origins, and
selecting the unchanged persona retains the current thread. The persona issue
was regraded Important because it changes where the next question is saved.

Each issue was reproduced by a failing test before the implementation changed.
The core suite then passed 48/48. Focused browser races and full browser regression
with crypto.randomUUID unavailable passed. An actual AbortSignal timeout followed
by a same-key retry passed. Existing large build-chunk warnings remain.

The independent visual finish review returned SHIP with no material fixes.
[Visual evidence and documentation](research-visual-review.md) record the scope.
No final Minor finding remains deferred; existing system drift is documented
without changing the incumbent design. Functional fixes did not change the visual
structure or style reviewed.

Real container/model generation was not triggered. Verification uses live reads
and intercepted write requests; real execution depends on backend configuration.
