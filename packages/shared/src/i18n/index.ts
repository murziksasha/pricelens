import en from './en.json';
import ru from './ru.json';
import uk from './uk.json';

export const LOCALES = ['en', 'ru', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];

const TABLES: Record<Locale, Record<string, string>> = { en, ru, uk };

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const table = TABLES[locale] ?? TABLES.en;
  let text = table[key] ?? TABLES.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function i18nKeys(): string[] {
  return Object.keys(en);
}

export { en, ru, uk };
