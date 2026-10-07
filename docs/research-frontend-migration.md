# Research frontend migration

## Source and destination

Source: `platform/ai_native@5ca0c93ed772c4a6ad0a9ce5d9e3ca17cb1142f8`.
Destination: Mega X's authenticated company Console, route
`/console/#/business/c/<company-id>/research`.

All committed browser application features are migrated. Backend department
skills, hooks, OpenClaw plugins, MCP servers and generated-report templates remain
backend responsibilities. The original backend workbench is preserved.

| Source workbench file | Destination and responsibility |
| --- | --- |
| `index.html` | `ResearchView.tsx`, company navigation and the research components: React-owned page structure and existing company creation/switching flows |
| `style.css` | Existing Console/Tailwind tokens, `components/research/shared.tsx`, scoped research rules in `globals.css` and responsive company shell |
| `app.js` | `hooks/useResearch.ts`, `lib/research/client.ts`, `ResearchForm`, `ResearchTasks`, `ResearchOutputs`, `ResearchView` |
| `core.mjs` | `lib/research/core.ts`: ticker normalization, capability checks, stages, idempotency and research errors |
| `dialogue.mjs` | `hooks/useResearchDialogue.ts`, `ResearchDialogue`: capabilities, personas, history, drafts, fixed-report discussions, roundtables and polling |
| `dialogue-core.mjs` | `lib/research/core.ts` and `dialogue.ts`: context guards, request keys, length limits, citations and recovery messages |
| `dialogue-messages.mjs` | `DialogueTurns.tsx`: safe text, per-person state, citation/coverage/truncation warnings and report references |
| `investor-catalog.mjs` | `InvestorCatalog.tsx` and `lib/research/catalog.ts`: filtering, counts and profile entry actions |
| `investor-data.mjs` | `lib/research/catalog.ts`: unchanged 9 schools and 66 profiles |
| `locale.mjs` | `lib/research/copy.ts`, Console i18next and `CompanySwitcher`: authored-literal translation, dates, persona labels and exact company aliases |
| `locale-catalog.mjs` | `lib/research/english.ts`: all 204 original translation entries |

The canonical JSON of the source catalog and translation dictionary was compared
with the migrated exports; both matched exactly:

- Catalog SHA-256: `798d9daab8cc807b9e362e7b9d0602e62d9fd4e2e18248ff6578b715f46191b8`.
- Translations SHA-256: `520d7bd9086f12e3571ae23b2149cc304cebc45c26f884718c73b684f03afa26`.

## Preserved behavior

Company-isolated research and archived outputs; department install/reinstall,
startup retry and nonblocking unavailable operation details; A/US market and
language capabilities; quick/standard restrictions; request-key reuse; task
filters and event-based execution phases; retry/resume/cancel; signed previews,
downloads and 200-item output pagination; all investment profiles with original
English-region filtering; profile conversations and immutable 2–4-person
roundtables; report-version binding; context-isolated drafts/history; 4000-character
questions; per-speech results, evidence and warning messages; two-second generation
polling, 30-second dialogue-capability polling and five-second research polling.

The existing company/authentication shell owns creation, switching and access
control. Page and component cleanup cancels reads and polling. Expired write
responses cannot change the active workspace. No global DOM mount script or
backend `/workbench/` static dependency is included in the new build.

## Integration decisions

- Reuse the existing API transport and its request-init headers/signals. API origins
  remain configurable; signed reports must resolve to that origin and the expected
  `/v1/outputs/s/` namespace.
- Keep the source request-key namespace, so retries remain consistent with the
  original workbench within a browser origin. The new Console uses its existing
  language preference; research in Arabic falls back to English without changing
  generated/user-authored content or stored company names.
- Keep write errors separate from read-sync errors. Automatic refresh no longer
  removes a failed submission's recovery message.
- Console/company navigation wraps on small screens. Existing palette, typefaces,
  focus rings, spacing, status colors and reduced-motion rules are inherited.
- Restore four pre-existing validation defects: Node type declarations for Vite,
  explicit Segmented generics, missing known activity-event display metadata and
  timers in a WebSocket-test VM. These fixes are a separate local commit.
- Native TypeScript pure-module tests require Node 24+. The frontend production
  build still uses the repository's existing Node 18.18+ floor.

## Validation

- `node --test console/tests/*.test.mjs`: 47 passing tests, including 18 new research
  tests. The prior baseline was 36/37 passing after adding the first research tests;
  the failed existing WebSocket test had an incomplete VM timer environment.
- `pnpm exec tsc --noEmit`: passes after restoring the existing baseline type checks.
- `pnpm build`: Vite produces the marketing pages and Console. Existing large-chunk
  warnings remain; this migration does not change the site's bundling architecture.
- `console/tests/research-browser.mjs`: controlled browser regression exercises
  research requests and key reuse, report binding, safe replies, drafts, roundtable
  order/fixed membership, language changes, install states, task controls,
  output/history pagination, company-response races, hidden-page polling,
  route-unmount cleanup, keyboard focus and 390px/1440px layouts. All `/v1` requests
  are intercepted, including every business write.
- Live read-only smoke: API health, identity, company list, department, tasks,
  outputs, dialogue capabilities and personas return HTTP 200. The live research
  page renders six sections without page errors; business writes were blocked and
  none were attempted.
- The UI detector found no mechanical issues in the new research components.

Real company installation, research generation and model-backed dialogue were not
triggered during verification. Their backend execution still depends on the
operator's configured services and capability flags.

## Running and Git ownership

See README for setup and browser-regression commands. The local migration preview
uses port 5190 to avoid existing services on 5173/5174, with `/v1` proxied to 8002.
No remote push, PR, website publish or deployment is performed. User owns pushing.
