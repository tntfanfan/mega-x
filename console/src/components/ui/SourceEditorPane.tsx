import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

const SourceMonaco = lazy(() => import("./SourceMonaco"));

export type SourceEditorProps = {
  value: string;
  path: string;
};

/** Load the editor only when a source view is opened. */
export function SourceEditorPane(props: SourceEditorProps) {
  const { t } = useTranslation();
  return (
    <div className="h-full min-h-0 min-w-0 w-full" dir="ltr">
      <Suspense fallback={<p role="status" className="p-4 text-xs text-muted">{t("common.loading")}…</p>}>
        <SourceMonaco key={props.path} {...props} />
      </Suspense>
    </div>
  );
}
