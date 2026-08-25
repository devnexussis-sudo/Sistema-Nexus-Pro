/**
 * Utilitários Enterprise para tratamento e exibição de Datas e Horas no Nexus Pro
 * 
 * Previne o bug comum em fuso horário UTC-3 (Horário de Brasília) onde datas
 * do tipo YYYY-MM-DD (ex: 2026-08-19) são interpretadas como UTC Meia-Noite
 * e exibidas como dia anterior (18/08/2026).
 */

const BR_TZ = 'America/Sao_Paulo';

/** Detecta se a string de data não possui horário relevante (apenas YYYY-MM-DD ou T00:00:00) */
export const isDateOnlyString = (d: string): boolean => {
  if (!d) return false;
  const trimmed = d.trim();
  if (!/[T\s]/.test(trimmed)) return true;
  return /[T\s]00:00:00/.test(trimmed);
};

/**
 * Retorna a data de HOJE no formato YYYY-MM-DD considerando o fuso local exato do usuário.
 */
export const getTodayLocalDate = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formata qualquer data (string ou Date) para exibição segura em português (DD/MM/YYYY).
 * Garante que datas puras (YYYY-MM-DD) não sofram regressão de 1 dia em UTC-3.
 */
export const safeFormatDate = (d?: string | Date | null): string => {
  if (!d) return '—';
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (isDateOnlyString(trimmed)) {
      const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
  }
  const obj = typeof d === 'string' ? new Date(d) : d;
  if (!isNaN(obj.getTime())) {
    return obj.toLocaleDateString('pt-BR', { timeZone: BR_TZ });
  }
  return String(d);
};

/**
 * Formata Data + Hora (DD/MM/YYYY HH:mm ou DD/MM/YYYY às HH:mm).
 * Timestamps UTC (ex: 2026-08-19T18:16:00Z) são ajustados com precisão para o fuso brasileiro.
 */
export const safeFormatDateTime = (d?: string | Date | null, withSeparator = false): string => {
  if (!d) return '—';
  if (typeof d === 'string' && isDateOnlyString(d.trim())) {
    return safeFormatDate(d);
  }
  const obj = typeof d === 'string' ? new Date(d) : d;
  if (!isNaN(obj.getTime())) {
    const dateStr = obj.toLocaleDateString('pt-BR', { timeZone: BR_TZ });
    const timeStr = obj.toLocaleTimeString('pt-BR', { timeZone: BR_TZ, hour: '2-digit', minute: '2-digit' });
    return withSeparator ? `${dateStr} às ${timeStr}` : `${dateStr} ${timeStr}`;
  }
  return String(d);
};

/**
 * Formata apenas o horário (HH:mm) considerando o fuso horário brasileiro.
 */
export const safeFormatTime = (d?: string | Date | null): string => {
  if (!d) return '—';
  const obj = typeof d === 'string' ? new Date(d) : d;
  if (!isNaN(obj.getTime())) {
    return obj.toLocaleTimeString('pt-BR', { timeZone: BR_TZ, hour: '2-digit', minute: '2-digit' });
  }
  return '—';
};
