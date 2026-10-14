export function formatBytes(bytes: number, lang: string) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(n)} ${units[i]}`;
}

export function formatNumber(n: number, lang: string) {
  return new Intl.NumberFormat(lang, { notation: n >= 10000 ? 'compact' : 'standard' }).format(n);
}

export function formatDate(iso: string | null | undefined, lang: string) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function formatTime(date: Date, lang: string) {
  return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
