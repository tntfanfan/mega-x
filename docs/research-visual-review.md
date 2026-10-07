# Research workspace visual review

Reviewed 2026-10-07 as an ordinary extension of the existing Mega X Console. Visual authority remains the incumbent Console implementation, `tailwind.config.ts` and `styles/variables.css`. This report describes the implemented surface; it does not establish a replacement design system.

## Scope and evidence

The surface is `console/src/pages/business/company/ResearchView.tsx` and `console/src/components/research/`. The approved specification is [research frontend migration design](superpowers/specs/2026-10-07-research-frontend-migration-design.md); its visual direction is recorded in [.impeccable surface contract](../.impeccable/surfaces/c-pages-business-company-researchview-tsx-0a10e618.md).

Code samples checked against the extension: `CompanyShell.tsx`, `components/tasks/WorkspaceTasks.tsx`, `components/ui/Segmented.tsx`, `components/ui/SearchInput.tsx`, `console/index.html` and `console/src/styles/globals.css`. The implementation reuses the company shell rather than introducing a separate browser workbench identity.

Full-page rendered evidence:

- [Desktop screenshot](../.impeccable/review/desktop.png): 1440 × 4033 pixels.
- [Mobile screenshot](../.impeccable/review/mobile.png): 390 × 6847 pixels.
- [Mechanical detector result](../.superpowers/sdd/2026-10-07-research-frontend-migration/design-detector.json): `[]`.

The screenshots use controlled fixtures. The literal script-like reply text is intentional security-test content rendered as text, not production research copy. These captures show the completed task and roundtable fixture; they do not demonstrate every live backend state, all languages, or every intermediate viewport. No new shipping raster assets were introduced. Review screenshots are verification artifacts, not product imagery.

## Implemented conventions

| Area | Observed implementation and incumbent relationship |
| --- | --- |
| Palette | Console background `#07090F`, panels `#0D1119`, inset fields/selected rows `#151B28`, headings `#E8DCC8`, body `#B8AFA0`, metadata `#8A95A8`. These are the existing Tailwind tokens, not new local colors. |
| Actions and selection | Gold `#D4A84E` primary buttons with background-colored text; hover uses `#E8C05A`. Quiet actions use solid borders, body text and gold hover. Selected profiles use the existing `primary-muted` fill and gold borders. The same gold action treatment is present in `WorkspaceTasks`; the quiet border treatment is present in `CompanyShell`. |
| State | Mint marks completion/readiness, blue marks active/queued execution, fusion orange marks failure, and flare marks dialogue availability warnings. Labels accompany the colors. The state palette matches the company shell. |
| Typography | `Instrument Serif` headings, `Barlow` body, `Share Tech Mono` identifiers and counts are inherited from the Console. Research uses a 30px page title, 20px section headings, 18px detail/catalog headings, 16px minor headings, 14px body/controls and 12px metadata. These are Tailwind sizes; the marketing CSS fluid type ramp is not applied to this surface. Actual glyph rendering depends on available font coverage and fallback. |
| Shape and depth | Research sections, fields and buttons use the existing 6px `rounded-md` corners and `border-solid` token (`#2A2438`). Resting panels use borders and tonal fills without new shadows or glass effects. The incumbent also has 2px compact corners and 20px glass corners; research does not redefine those roles. |
| Spacing | Workspace padding is 16px, increasing to 24px at the large breakpoint. Section headers use 20px horizontal and 16px vertical padding; content commonly uses 20px. The main section gap is 20px, form gap 16px and compact control gaps 8px. These are existing Tailwind spacing steps applied locally. |
| Responsive layout | Task list and execution detail are side by side at `xl` (1280px), stacked below it. Submission fields/action share a row at `lg` (1024px). Profile selection uses one column, two at `sm` (640px), and three at `lg`; dialogue history moves beside messages at `lg`. Company navigation becomes a wrapping horizontal strip below 768px. Desktop and mobile captures show these intended endpoint layouts. |
| Long content | Task/profile/message areas have bounded scroll regions; messages wrap long content. Report paths break across lines. Catalog profiles wrap, while descriptive groups stack on narrow screens. The screenshots retain access to the lower catalogue and dialogue sections. |
| Interaction styling | Fields use a gold focus border; buttons inherit the Console's gold `:focus-visible` outline. Disabled controls reduce opacity. Reduced-motion handling is inherited, and report-to-dialogue scrolling checks the user's reduced-motion setting. These treatments are source evidence; screenshots alone do not verify keyboard behavior. |

## Finish disposition

The visual finish reviewer returned **SHIP**, with each of the required sections passing:

| Review section | Disposition |
| --- | --- |
| Persistence | Pass |
| Fidelity | Pass |
| Ceiling | Pass |
| Material fixes | Pass; none required |
| Keep | Pass |

The rendered extension keeps the incumbent dark/gold hierarchy, company navigation, serif headings and compact controls. The primary research action remains visible beside fields on desktop and beneath them on mobile. Task and report inspection precede the profile catalogue and discussion flow. No visual repair was requested by the finish review. This disposition covers the visual surface; functional verification is recorded separately by the migration work.

## Incumbent drift and documentation boundary

The two incumbent token sources are not identical: marketing CSS defines its glass shadow with black at 0.3 opacity, while Console Tailwind defines `shadow-glass` at 0.45. Marketing CSS also raises body/muted/dim text colors below 900px, while Console Tailwind retains its fixed text palette. Research uses Console tokens and introduces no glass surface. These differences are recorded as existing divergence, not resolved or promoted into new rules.

The older `SearchInput` component uses a magnifying-glass glyph and a text cross as icons; newer task controls use Lucide SVG icons. That inherited inconsistency is not canonized as guidance for new surfaces or repaired within this migration.

No root `DESIGN.md` or `.impeccable/design.json` existed at review time. The documenter role explicitly directs ordinary extensions to preserve the incumbent system and not write a system merely to demonstrate that a pass ran. Consequently this surface report is the documentation artifact; it leaves those global artifacts uncreated. There is no new visual world or approved system change to encode. Existing token sources and components remain authoritative.
