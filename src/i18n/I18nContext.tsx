// ============================================================
// src/i18n/I18nContext.tsx
// 🌐 NEXUS I18N — Internationalization Context v1.0
//
// ARQUITETURA:
//  - Lê o idioma e timezone do tenant metadata (persistido no banco)
//  - Fallback para localStorage para UX rápida no reload
//  - Oferece o hook `useI18n()` para consumo em qualquer componente
//  - Suporta pt-BR, en-US, es-ES
//  - Formata datas/moedas/números de acordo com o locale
//  - Timezone-aware: todas as formatações respeitam o fuso configurado
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ptBR, type TranslationKeys } from './translations/pt-BR';
import { enUS } from './translations/en-US';
import { esES } from './translations/es-ES';

// ── Supported Locales ──
export type SupportedLocale = 'pt-BR' | 'en-US' | 'es-ES';

export type SupportedTimezone =
  | 'America/Sao_Paulo'
  | 'America/New_York'
  | 'America/Chicago'
  | 'America/Denver'
  | 'America/Los_Angeles'
  | 'Europe/Madrid'
  | 'Europe/London'
  | 'UTC';

// ── Timezone Options (used by Settings UI) ──
export const TIMEZONE_OPTIONS: { value: SupportedTimezone; label: string; offset: string }[] = [
  { value: 'America/Sao_Paulo', label: 'Brasília', offset: 'UTC-03:00' },
  { value: 'America/New_York', label: 'Eastern (New York)', offset: 'UTC-05:00' },
  { value: 'America/Chicago', label: 'Central (Chicago)', offset: 'UTC-06:00' },
  { value: 'America/Denver', label: 'Mountain (Denver)', offset: 'UTC-07:00' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)', offset: 'UTC-08:00' },
  { value: 'Europe/Madrid', label: 'Madrid', offset: 'UTC+01:00' },
  { value: 'Europe/London', label: 'London', offset: 'UTC+00:00' },
  { value: 'UTC', label: 'UTC', offset: 'UTC+00:00' },
];

// ── Translation Map ──
const TRANSLATIONS: Record<SupportedLocale, TranslationKeys> = {
  'pt-BR': ptBR,
  'en-US': enUS,
  'es-ES': esES,
};

// ── LocalStorage Keys ──
const LS_LOCALE_KEY = 'nexus_i18n_locale';
const LS_TIMEZONE_KEY = 'nexus_i18n_timezone';

// ── Context Interface ──
interface I18nContextType {
  /** Current locale identifier */
  locale: SupportedLocale;
  /** Current timezone */
  timezone: SupportedTimezone;
  /** Full translation object for the current locale */
  t: TranslationKeys;
  /** Change locale (also persists to localStorage) */
  setLocale: (locale: SupportedLocale) => void;
  /** Change timezone (also persists to localStorage) */
  setTimezone: (tz: SupportedTimezone) => void;
  /** Format a Date object or ISO string to localized date string */
  formatDate: (date: Date | string | null | undefined, style?: 'short' | 'long' | 'dateTime') => string;
  /** Format a Date object or ISO string to localized time string */
  formatTime: (date: Date | string | null | undefined) => string;
  /** Format a number as currency */
  formatCurrency: (value: number) => string;
  /** Format a number with locale-specific separators */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Get the Intl locale string (e.g. 'pt-BR') */
  intlLocale: string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// ── Helper: read initial locale from localStorage or fallback ──
function getInitialLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem(LS_LOCALE_KEY);
    if (stored && stored in TRANSLATIONS) return stored as SupportedLocale;
  } catch { /* ignore */ }
  return 'pt-BR';
}

function getInitialTimezone(): SupportedTimezone {
  try {
    const stored = localStorage.getItem(LS_TIMEZONE_KEY);
    if (stored) return stored as SupportedTimezone;
  } catch { /* ignore */ }
  // Auto-detect from browser
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const match = TIMEZONE_OPTIONS.find(opt => opt.value === browserTz);
    if (match) return match.value;
  } catch { /* ignore */ }
  return 'America/Sao_Paulo';
}

// ── Provider ──
export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(getInitialLocale);
  const [timezone, setTimezoneState] = useState<SupportedTimezone>(getInitialTimezone);

  // Translation object for current locale
  const t = useMemo(() => TRANSLATIONS[locale] || ptBR, [locale]);

  // Set locale + persist
  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LS_LOCALE_KEY, newLocale);
    } catch { /* ignore */ }
    // Update HTML lang attribute for SEO/accessibility
    document.documentElement.lang = newLocale;
  }, []);

  // Set timezone + persist
  const setTimezone = useCallback((tz: SupportedTimezone) => {
    setTimezoneState(tz);
    try {
      localStorage.setItem(LS_TIMEZONE_KEY, tz);
    } catch { /* ignore */ }
  }, []);

  // Set initial HTML lang on mount
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // ── Formatting Functions ──

  const formatDate = useCallback((date: Date | string | null | undefined, style: 'short' | 'long' | 'dateTime' = 'short'): string => {
    if (!date) return '—';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(d.getTime())) return '—';

      const options: Intl.DateTimeFormatOptions = { timeZone: timezone };

      switch (style) {
        case 'short':
          options.day = '2-digit';
          options.month = '2-digit';
          options.year = 'numeric';
          break;
        case 'long':
          options.day = 'numeric';
          options.month = 'long';
          options.year = 'numeric';
          break;
        case 'dateTime':
          options.day = '2-digit';
          options.month = '2-digit';
          options.year = 'numeric';
          options.hour = '2-digit';
          options.minute = '2-digit';
          break;
      }

      return new Intl.DateTimeFormat(locale, options).format(d);
    } catch {
      return '—';
    }
  }, [locale, timezone]);

  const formatTime = useCallback((date: Date | string | null | undefined): string => {
    if (!date) return '—';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }).format(d);
    } catch {
      return '—';
    }
  }, [locale, timezone]);

  const formatCurrency = useCallback((value: number): string => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: t.currency.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${t.currency.symbol} ${value.toFixed(2)}`;
    }
  }, [locale, t.currency.code, t.currency.symbol]);

  const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions): string => {
    try {
      return new Intl.NumberFormat(locale, options).format(value);
    } catch {
      return String(value);
    }
  }, [locale]);

  const contextValue = useMemo<I18nContextType>(() => ({
    locale,
    timezone,
    t,
    setLocale,
    setTimezone,
    formatDate,
    formatTime,
    formatCurrency,
    formatNumber,
    intlLocale: locale,
  }), [locale, timezone, t, setLocale, setTimezone, formatDate, formatTime, formatCurrency, formatNumber]);

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
};

// ── Hook ──
export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('[useI18n] Must be used within an I18nProvider');
  }
  return context;
};

// ── Utility: get translations without hook (for services/non-React code) ──
export function getTranslations(locale?: SupportedLocale): TranslationKeys {
  const l = locale || (localStorage.getItem(LS_LOCALE_KEY) as SupportedLocale) || 'pt-BR';
  return TRANSLATIONS[l] || ptBR;
}

// ── Utility: get current timezone from localStorage (for services) ──
export function getCurrentTimezone(): SupportedTimezone {
  return (localStorage.getItem(LS_TIMEZONE_KEY) as SupportedTimezone) || 'America/Sao_Paulo';
}
