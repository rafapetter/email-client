export const KEYBOARD_SHORTCUTS = {
  nextEmail: 'j',
  prevEmail: 'k',
  openEmail: 'Enter',
  archive: 'e',
  delete: '#',
  reply: 'r',
  replyAll: 'R',
  forward: 'f',
  star: 's',
  markUnread: 'u',
  search: '/',
  compose: 'c',
  escape: 'Escape',
  help: '?',
} as const;

export const GO_TO_SHORTCUTS: Record<string, string> = {
  i: '/inbox',
  s: '/sent',
  d: '/drafts',
  a: '/archive',
  t: '/trash',
};

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
  none: 'bg-transparent',
};

export function getPriorityLevel(score: number): keyof typeof PRIORITY_COLORS {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'none';
}

export const CLASSIFICATION_COLORS: Record<string, string> = {
  work: 'bg-blue-500',
  personal: 'bg-green-500',
  finance: 'bg-emerald-500',
  shopping: 'bg-purple-500',
  social: 'bg-pink-500',
  newsletter: 'bg-cyan-500',
  marketing: 'bg-orange-500',
  spam: 'bg-red-500',
  support: 'bg-yellow-500',
  travel: 'bg-indigo-500',
  education: 'bg-teal-500',
  health: 'bg-rose-500',
  legal: 'bg-amber-500',
  notification: 'bg-slate-500',
  other: 'bg-gray-500',
};

export const DEFAULT_SIDEBAR_WIDTH = 220;
export const DEFAULT_LIST_WIDTH = 400;
export const MIN_PANE_WIDTH = 180;
