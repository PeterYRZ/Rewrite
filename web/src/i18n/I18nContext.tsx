import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import zhCN from '../locales/zh-CN.json';
import en from '../locales/en.json';

type Lang = 'zh-CN' | 'en';
type Translations = Record<string, unknown>;

const translations: Record<Lang, Translations> = { 'zh-CN': zhCN, en };

const STORAGE_KEY = 'rw-lang';

interface I18nContextValue {
  t: (key: string, params?: Record<string, string | number>) => string;
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? `{{${key}}}`));
}

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' ? 'en' : 'zh-CN';
  });

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const template = getNested(translations[lang] as Record<string, unknown>, key);
      if (!template) {
        // Fallback to the other language, then to the key itself
        const otherLang = lang === 'zh-CN' ? 'en' : 'zh-CN';
        const fallback = getNested(translations[otherLang] as Record<string, unknown>, key);
        return interpolate(fallback ?? key, params);
      }
      return interpolate(template, params);
    },
    [lang],
  );

  const value = useMemo(() => ({ t, lang, setLang }), [t, lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within TranslationProvider');
  return ctx;
}
