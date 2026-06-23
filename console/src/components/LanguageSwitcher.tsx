import { useTranslation } from "react-i18next";
import { setLocale, getLocale, ENABLED_LOCALES, type Locale } from "../i18n";

/**
 * Locale switcher for the Console shell.
 *
 * EN + ZH active; AR shown as disabled "coming soon" entry until ar.json is
 * filled in and ENABLED_LOCALES includes "ar".
 */
export default function LanguageSwitcher() {
  const { t } = useTranslation();
  const current = getLocale();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as Locale;
    setLocale(next);
  };

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">{t("shell.lang.label")}</span>
      <select
        aria-label={t("shell.lang.label")}
        value={current}
        onChange={handleChange}
        className="bg-surface border border-border-solid rounded px-2 py-1 text-body hover:border-primary cursor-pointer"
      >
        <option value="en">{t("shell.lang.en")}</option>
        <option value="zh">{t("shell.lang.zh")}</option>
        <option
          value="ar"
          disabled={!(ENABLED_LOCALES as readonly string[]).includes("ar")}
          title={t("shell.lang.ar-disabled-tooltip")}
        >
          {t("shell.lang.ar")}
        </option>
      </select>
    </label>
  );
}
