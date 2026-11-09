import { create } from "zustand";

import { storage } from "./storage";

/**
 * App language. A person picks it once (sign-in or Account) and every screen follows:
 * text, buttons, labels, tabs and sheets look their English words up in
 * src/i18n/<code>.json (written by `python manage.py translate_app`).
 * Words that aren't in the file (names, trip titles, new text) stay as they are.
 */
export type LangCode = "en" | "hi" | "te" | "ta" | "kn" | "ml" | "mr" | "bn" | "gu";

export const LANGUAGES: { code: LangCode; native: string; english: string }[] = [
  { code: "en", native: "English", english: "English" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
];

const CATALOGS: Partial<Record<LangCode, Record<string, string>>> = {
  hi: require("./i18n/hi.json"),
  te: require("./i18n/te.json"),
  ta: require("./i18n/ta.json"),
  kn: require("./i18n/kn.json"),
  ml: require("./i18n/ml.json"),
  mr: require("./i18n/mr.json"),
  bn: require("./i18n/bn.json"),
  gu: require("./i18n/gu.json"),
};

const KEY = "goloc.lang";

type LangState = { lang: LangCode; chosen: boolean; loaded: boolean; set: (l: LangCode) => void };

export const useLang = create<LangState>((set) => ({
  lang: "en",
  chosen: false,
  loaded: false,
  set: (lang) => {
    set({ lang, chosen: true });
    storage.set(KEY, lang).catch(() => {});
  },
}));

/** Read the saved language once at start-up. */
export async function loadLanguage() {
  const saved = (await storage.get(KEY).catch(() => null)) as LangCode | null;
  useLang.setState({ lang: saved && CATALOGS[saved] ? saved : "en", chosen: !!saved, loaded: true });
}

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;

/** Translate outside React (toasts, alerts). */
export function tr(s: string, vars?: Record<string, string | number>): string {
  const d = CATALOGS[useLang.getState().lang];
  return fill(d?.[s] ?? s, vars);
}

/** Translate inside components: `const t = useT(); t("Save")`, `t("{n} trips", { n })`. */
export function useT() {
  const lang = useLang((s) => s.lang);
  const d = CATALOGS[lang];
  return (s: string, vars?: Record<string, string | number>) => fill(d?.[s] ?? s, vars);
}

/** Same as useT but leaves non-strings (elements, numbers) alone: for `children` and optional props. */
export function useTx() {
  const t = useT();
  return <V,>(v: V): V => (typeof v === "string" ? (t(v) as unknown as V) : v);
}
