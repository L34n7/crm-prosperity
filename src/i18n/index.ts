import { en } from "./en";
import { pt } from "./pt";

export const DEFAULT_LOCALE = "en";

const translations = {
  en,
  pt,
};

export type Locale = keyof typeof translations;

export const t = translations[DEFAULT_LOCALE];