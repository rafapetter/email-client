'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
  Inbox, Send, FileEdit, Star, Archive, Trash2, Settings, LogOut, PenSquare, Mail,
  PanelLeftClose, PanelLeft, Sun, Moon, Search, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CLASSIFICATION_COLORS } from '@/lib/constants';
import { useEmailStore } from '@/stores/email-store';
import { useUiStore } from '@/stores/ui-store';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';

const navItems = [
  { label: 'Inbox', href: '/inbox', icon: Inbox, countKey: 'INBOX' },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Sent', href: '/sent', icon: Send },
  { label: 'Drafts', href: '/drafts', icon: FileEdit },
  { label: 'Starred', href: '/starred', icon: Star },
  { label: 'Archive', href: '/archive', icon: Archive },
  { label: 'Trash', href: '/trash', icon: Trash2 },
];

// Map bg- colors to dot-style colors for sidebar labels
const CATEGORY_DOT_COLORS: Record<string, string> = {
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
  promotions: 'bg-orange-400',
  updates: 'bg-sky-500',
  billing: 'bg-emerald-600',
  sales: 'bg-violet-500',
  other: 'bg-gray-400',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { folderCounts, enrichments, emails, activeCategoryFilter, setActiveCategoryFilter } = useEmailStore();
  const { openCompose, toggleSidebar } = useUiStore();
  const { theme, setTheme } = useTheme();

  // Collect AI categories with counts from enrichments
  const categoryLabels = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const email of emails) {
      const enrichment = enrichments[email.id];
      if (enrichment?.classification?.category) {
        const cat = enrichment.classification.category.toLowerCase();
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));
  }, [emails, enrichments]);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20">
          <Mail className="size-4 text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-foreground">emai</span>
        <button
          onClick={toggleSidebar}
          className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      {/* Compose button */}
      <div className="px-3 py-3">
        <button
          onClick={() => openCompose('new')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:from-blue-600 hover:to-indigo-700 hover:shadow-blue-500/40 active:scale-[0.98]"
        >
          <PenSquare className="size-4" />
          Compose
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-0.5 px-2 pt-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const count = item.countKey ? folderCounts[item.countKey] : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-150',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-500" />
              )}
              <item.icon className={cn('size-[18px] flex-shrink-0', isActive && 'text-blue-500')} />
              <span className="flex-1 truncate">{item.label}</span>
              {count !== undefined && count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-blue-500">
                  {count}
                </span>
              )}
            </Link>
          );
        })}

        {/* AI Category Labels */}
        {categoryLabels.length > 0 && (
          <>
            <div className="pt-4 pb-1">
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Labels
              </span>
            </div>
            {categoryLabels.map(({ category, count }) => {
              const isActive = activeCategoryFilter === category;
              return (
                <button
                  key={category}
                  onClick={() => {
                    setActiveCategoryFilter(isActive ? null : category);
                    if (!pathname.startsWith('/inbox')) {
                      router.push('/inbox');
                    }
                  }}
                  className={cn(
                    'group relative flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-150',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  )}
                >
                  <span className="flex size-[18px] items-center justify-center shrink-0">
                    <span className={cn(
                      'size-2.5 rounded-full',
                      CATEGORY_DOT_COLORS[category] ?? 'bg-gray-400',
                    )} />
                  </span>
                  <span className="flex-1 truncate capitalize text-left">{category}</span>
                  <span className="text-[11px] tabular-nums text-sidebar-foreground/40">
                    {count}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border/50 p-2 space-y-0.5">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition-all duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          {theme === 'dark' ? (
            <Sun className="size-[18px]" />
          ) : (
            <Moon className="size-[18px]" />
          )}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <Link
          href="/settings"
          className={cn(
            'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-150',
            pathname.startsWith('/settings')
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
              : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          )}
        >
          {pathname.startsWith('/settings') && (
            <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-500" />
          )}
          <Settings className={cn('size-[18px]', pathname.startsWith('/settings') && 'text-blue-500')} />
          <span>Settings</span>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition-all duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <LogOut className="size-[18px]" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

/** Collapsed sidebar — icon-only vertical strip */
export function CollapsedSidebar() {
  const pathname = usePathname();
  const { folderCounts } = useEmailStore();
  const { openCompose, toggleSidebar } = useUiStore();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-full w-14 flex-col items-center bg-sidebar border-r border-border/50 py-3 gap-1">
      {/* Expand button */}
      <button
        onClick={toggleSidebar}
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground mb-1"
        title="Expand sidebar"
      >
        <PanelLeft className="size-4" />
      </button>

      {/* Compose */}
      <button
        onClick={() => openCompose('new')}
        className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm transition-all hover:shadow-md mb-2"
        title="Compose"
      >
        <PenSquare className="size-4" />
      </button>

      {/* Nav icons */}
      <nav className="flex flex-1 flex-col items-center gap-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const count = item.countKey ? folderCounts[item.countKey] : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex size-9 items-center justify-center rounded-lg transition-all duration-150',
                isActive
                  ? 'bg-sidebar-accent text-blue-500'
                  : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
              title={item.label}
            >
              <item.icon className="size-[18px]" />
              {count !== undefined && count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-0.5 border-t border-sidebar-border/50 pt-2">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>
        <Link
          href="/settings"
          className={cn(
            'flex size-9 items-center justify-center rounded-lg transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-sidebar-accent text-blue-500'
              : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          )}
          title="Settings"
        >
          <Settings className="size-[18px]" />
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          title="Sign out"
        >
          <LogOut className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}
