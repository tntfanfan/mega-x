# Announcement reader layout

User-selected direction: desktop list/detail split, retaining the console's dark/gold identity. Mobile opens a single reading view with back navigation.

- Keep the compact announcement index on the left and the reader on the right when the content container is at least 960px wide. Preserve the selected row and list context.
- Default pending announcements to their original text; use separate original/report tabs. Preserve report history, downloads, original-source links and bookmarking.
- Provide previous/next navigation within the current result page, explicit detail loading/error/retry states, and keyboard focus recovery.
- Guard stale detail responses and cancel downloads when changing announcements. Restore list focus/scroll when closing; re-anchor the reading surface when crossing the responsive breakpoint.
- Validate with TypeScript, Vite, existing announcement interactions, and focused desktop/mobile browser scenarios using fixtures only.

Earlier requested changes were committed separately as platform 130d6d8 and mega-x dabe4a3 before this layout revision.

Validation completed: TypeScript and Vite passed; the existing announcement browser flow and the new split-reader flow passed. The latter covers original/report tabs, within-page navigation, mobile back/focus, retry focus, stale response suppression and closing during load. Desktop/mobile screenshots were inspected, and local K8s serves the new build.
