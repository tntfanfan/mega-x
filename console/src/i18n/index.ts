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

export const SUPPORTED_LOCALES = ["en", "zh", "ar"] as const;
export const ENABLED_LOCALES = ["en", "zh"] as const;        // Arabic disabled until ar.json is filled
export const DEFAULT_LOCALE = "en" as const;
export const STORAGE_KEY = "phyntom.locale";

export type Locale = (typeof SUPPORTED_LOCALES)[number];

function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  // 1) ?lang= URL param
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("lang");
  if (fromUrl && (ENABLED_LOCALES as readonly string[]).includes(fromUrl)) {
    window.localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl as Locale;
  }
  // 2) localStorage
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (ENABLED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  // 3) navigator.language prefix match (e.g. "zh-CN" → "zh")
  const nav = window.navigator.language?.slice(0, 2).toLowerCase();
  if (nav && (ENABLED_LOCALES as readonly string[]).includes(nav)) {
    return nav as Locale;
  }
  // 4) default
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
  // Update <html lang> so CSS can target [lang=...] for fonts (and later RTL).
  document.documentElement.setAttribute("lang", locale);
}

/** Current active locale (synchronous). */
export function getLocale(): Locale {
  return (i18n.language as Locale) ?? DEFAULT_LOCALE;
}

// Apply lang attribute on boot.
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("lang", initial);
}

export default i18n;
