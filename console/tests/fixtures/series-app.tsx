import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import SeriesApp from "../../src/apps/series";
import type { DeptAppProps } from "../../src/apps/registry";
import "../../src/styles/globals.css";

const props = {
  appBase: "/series-test-api",
  dept: { id: "dept-series", name: "网剧主创" },
} as DeptAppProps;

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/chat?app_session=s-empty"]}>
    <div className="flex h-dvh flex-col bg-bg text-body" style={{ height: "100dvh" }}>
      <SeriesApp {...props} />
    </div>
  </MemoryRouter>,
);
