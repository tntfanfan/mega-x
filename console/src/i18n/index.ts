/**
 * Console SPA i18n bootstrap.
 *
 * Sets up react-i18next with English (default) + Chinese, Arabic is a
 * "coming soon" placeholder in the language switcher and not loaded.
 *
 * Locale resolution order on app boot:
 *   1. `?lang=` URL query param (shareable bookmark)
 *   2. `localStorage["phyntom.locale"]` (user's previous choice)
 *   3. `navigator.language` if it starts with a supported locale prefix
 *   4. Default to English
 *
 * To add Arabic later:
 *   1. Fill console/src/i18n/ar.json with translations mirroring en.json keys
 *   2. Add `ar: arTranslations` below
 *   3. Set `ENABLED_LOCALES` to ["en","zh","ar"]
 *   4. Add `dir="rtl"` switching in main.tsx (set on <html> when locale==="ar")
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import zh from "./zh.json";
import ar from "./ar.json";

export const SUPPORTED_LOCALES = ["en", "zh", "ar"] as const;
export const ENABLED_LOCALES = ["en", "zh", "ar"] as const;
export const DEFAULT_LOCALE = "en" as const;
export const STORAGE_KEY = "phyntom.locale";
/** Locales that render right-to-left; drives <html dir="rtl">. */
export const RTL_LOCALES = ["ar"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

function isRtl(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

/** Set <html lang> + <html dir> for the given locale. */
function applyDocumentLocale(locale: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("lang", locale);
  document.documentElement.setAttribute("dir", isRtl(locale) ? "rtl" : "ltr");
}

function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  // 1) ?lang= URL param — explicit, shareable; persists for subsequent visits
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("lang");
  if (fromUrl && (ENABLED_LOCALES as readonly string[]).includes(fromUrl)) {
    window.localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl as Locale;
  }
  // 2) localStorage — set ONLY when user explicitly picked a locale (URL param
  //    or LanguageSwitcher click). We do NOT auto-detect from navigator.language
  //    because the product requirement is "default = English regardless of
  //    browser locale"; Chinese requires explicit opt-in.
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (ENABLED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  // 3) default = English (no browser-language auto-detect)
  return DEFAULT_LOCALE;
}

const initial = resolveInitialLocale();

// eslint-disable-next-line @typescript-eslint/no-floating-promises
i18n.use(initReactI18next).init({
  lng: initial,
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ar: { translation: ar },
  },
  interpolation: {
    escapeValue: false, // React already escapes
  },
  // Keep dot-namespaced keys flat (e.g. "shell.nav.business") — don't try to
  // resolve as nested objects.
  keySeparator: false,
  nsSeparator: false,
});

/** Switch locale at runtime + persist to localStorage. */
export function setLocale(locale: Locale): void {
  if (!(ENABLED_LOCALES as readonly string[]).includes(locale)) return;
  window.localStorage.setItem(STORAGE_KEY, locale);
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  i18n.changeLanguage(locale);
  // Update <html lang> + <html dir> (RTL for Arabic) so CSS can target
  // [lang=...]/[dir=rtl] for fonts and bidi layout.
  applyDocumentLocale(locale);
}

/** Current active locale (synchronous). */
export function getLocale(): Locale {
  return (i18n.language as Locale) ?? DEFAULT_LOCALE;
}

// Apply lang + dir attributes on boot.
applyDocumentLocale(initial);

export default i18n;
