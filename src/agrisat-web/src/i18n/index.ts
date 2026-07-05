/**
 * i18n configuration using i18next + react-i18next.
 *
 * Replaces the previous custom Zustand-based implementation.
 * The active locale is stored in localStorage and can be switched at runtime.
 *
 * Usage:
 *   import { useTranslation } from "react-i18next";
 *   const { t, i18n } = useTranslation();
 *   <span>{t("common.loading")}</span>
 *
 *   // Switch language:
 *   i18n.changeLanguage("en");
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import id from "./locales/id.json";

export type Locale = "en" | "id";

export const AVAILABLE_LOCALES: { code: Locale; label: string }[] = [
  { code: "id", label: "Bahasa Indonesia" },
  { code: "en", label: "English" },
];

const savedLocale = (localStorage.getItem("agrisat-locale") ?? "id") as Locale;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    id: { translation: id },
  },
  lng: savedLocale,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

// Persist language changes to localStorage
i18n.on("languageChanged", (lng) => {
  localStorage.setItem("agrisat-locale", lng);
});

export default i18n;
