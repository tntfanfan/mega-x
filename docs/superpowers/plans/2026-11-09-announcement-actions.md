# Company announcement actions

**Goal:** Make collection and analysis discoverable in the company announcement workspace and refine its existing dark/gold visual language.

**Architecture:** Company-scoped POST routes enqueue existing shared jobs using only the authenticated company's followed stocks. Manual analysis uses the requesting user's personal model account. The frontend presents action feedback without treating queue submission as completed work.

**Constraints:** Preserve company ownership checks, existing admin routes, model billing boundaries, shared reports, and the current console theme. Never trigger real model calls during verification.

- [x] Add failing permission and scope tests for company collection and analysis; implement the routes and verify.
- [x] Extend the frontend client and tests; add visible actions, clear disabled states, and feedback.
- [x] Refine the watchlist, toolbar, announcement rows and empty states; retain shared report interactions and translations.
- [x] Build and run targeted tests; inspect desktop/mobile with fixtures, then deploy the frontend and API changes to the local kind environment.

Validation: 53 announcement backend tests, 4 client tests, TypeScript, Vite build and fixture browser flows pass. Browser checks cover manual actions, disabled-account feedback, shared report, zero score, bookmarking, unfollowing and mobile overflow. New Console index matches the local K8s response. Real model calls were not made.

Review rulings: manual collection has an independent request key so a completed scheduled job cannot swallow a click. Deduplicated terminal analysis failures are reported explicitly and retain the existing administrator retry flow. The prior browser fixture used a removed route; it now targets the department chat workspace.

Follow-up delivery: watchlist cards and filters show cached A-share names alongside codes, including pre-existing subscriptions. Manual collection now backfills seven Shanghai calendar dates including today; automatic collection keeps its original subscription window. Existing complete announcements are reused before PDF download, and both collection modes share stock leases.

Final validation: 61 backend announcement tests and 4 frontend client tests pass; TypeScript, Vite and desktop/mobile browser checks pass. Local K8s backfilled 3 CATL announcements; a second run added 0 and retained the same IDs. No model calls were made.
