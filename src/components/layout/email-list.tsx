'use client';

import { useEmailStore } from '@/stores/email-store';
import { cn } from '@/lib/utils';
import { getPriorityLevel, PRIORITY_COLORS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { Star, Paperclip, RefreshCw, Inbox, Filter, X, Sparkles, Brain, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { listEmails } from '@/server/actions/emails';
import { searchEmails } from '@/server/actions/search';
import { useRouter } from 'next/navigation';

interface AiFilterItem {
  type: 'priority' | 'category' | 'sentiment';
  value: string;
}

interface EmailListProps {
  folder: string;
  onEmailSelect?: (emailId: string | null) => void;
}

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 border-b border-border/50 px-4 py-2.5">
      <div className="mt-1.5 h-2 w-2 rounded-full bg-muted animate-pulse" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
          <div className="h-3 w-12 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          <div className="h-3 w-56 rounded bg-muted/60 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function EmailList({ folder, onEmailSelect }: EmailListProps) {
  const { emails, enrichments, selectedEmailId, setSelectedEmailId, setEmails, setCurrentFolder, updateFolderCount } = useEmailStore();
  const router = useRouter();

  const selectEmail = useCallback(
    (emailId: string) => {
      if (onEmailSelect) {
        onEmailSelect(emailId);
      } else {
        setSelectedEmailId(emailId);
      }
    },
    [onEmailSelect, setSelectedEmailId],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [aiFilters, setAiFilters] = useState<AiFilterItem[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<typeof emails | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const fetchingRef = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilterPanel) return;
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilterPanel]);

  const lastFetchedFolderRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasScrolledToSelected = useRef(false);

  const fetchEmails = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const imapPath = useEmailStore.getState().folderPathMap[folder] ?? folder;
      const result = await listEmails({ folder: imapPath, limit: 50 });
      if (result.success) {
        setEmails(result.data.emails, result.data.total);
        setCurrentFolder(folder);
        lastFetchedFolderRef.current = folder;
        const unread = result.data.emails.filter((e) => !e.isRead).length;
        updateFolderCount(folder, unread);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [folder, setEmails, setCurrentFolder, updateFolderCount]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEmails();
    setRefreshing(false);
  }, [fetchEmails]);

  // Search handler with debounce
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const result = await searchEmails(query.trim());
      if (result.success) {
        setSearchResults(result.data);
      }
      setSearching(false);
    }, 400);
  }, []);

  // Navigate to full search page on Enter (preserves query for dedicated search view)
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      // Clear the global selected email so search page starts clean
      useEmailStore.getState().setSelectedEmailId(null);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
    if (e.key === 'Escape') {
      setSearchQuery('');
      setSearchResults(null);
    }
  }, [searchQuery, router]);

  useEffect(() => {
    const currentEmails = useEmailStore.getState().emails;
    if (folder === lastFetchedFolderRef.current && currentEmails.length > 0) {
      setLoading(false);
      const imapPath = useEmailStore.getState().folderPathMap[folder] ?? folder;
      void listEmails({ folder: imapPath, limit: 50 }).then((result) => {
        if (result.success) {
          setEmails(result.data.emails, result.data.total);
          const unread = result.data.emails.filter((e) => !e.isRead).length;
          updateFolderCount(folder, unread);
        }
      });
      return;
    }
    void fetchEmails();
  }, [fetchEmails, folder, setEmails, updateFolderCount]);

  useEffect(() => {
    if (!loading && selectedEmailId && emails.length > 0 && !hasScrolledToSelected.current) {
      hasScrolledToSelected.current = true;
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-email-id="${CSS.escape(selectedEmailId)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
      });
    }
  }, [loading, selectedEmailId, emails.length]);

  const unreadCount = useMemo(() => emails.filter((e) => !e.isRead).length, [emails]);

  // Collect available AI filter values from enrichments
  const availableFilters = useMemo(() => {
    const priorities = new Set<string>();
    const categories = new Set<string>();
    const sentiments = new Set<string>();
    for (const email of emails) {
      const e = enrichments[email.id];
      if (e?.priority) priorities.add(e.priority.level);
      if (e?.classification) {
        categories.add(e.classification.category);
        if (e.classification.sentiment) sentiments.add(e.classification.sentiment);
      }
    }
    return { priorities: [...priorities], categories: [...categories], sentiments: [...sentiments] };
  }, [emails, enrichments]);

  const hasAnyEnrichments = availableFilters.priorities.length > 0 || availableFilters.categories.length > 0;

  // Toggle a filter (multi-select)
  const toggleFilter = useCallback((filter: AiFilterItem) => {
    setAiFilters((prev) => {
      const exists = prev.some((f) => f.type === filter.type && f.value === filter.value);
      if (exists) return prev.filter((f) => !(f.type === filter.type && f.value === filter.value));
      return [...prev, filter];
    });
  }, []);

  const isFilterActive = useCallback((type: string, value: string) => {
    return aiFilters.some((f) => f.type === type && f.value === value);
  }, [aiFilters]);

  // Sidebar category filter from store
  const { activeCategoryFilter } = useEmailStore();

  // Filter emails based on unread toggle + AI filters + sidebar category filter
  const displayEmails = useMemo(() => {
    const source = searchResults ?? emails;
    let filtered = source;
    if (filterUnread) filtered = filtered.filter((e) => !e.isRead);

    // Sidebar category filter (global, from sidebar label clicks)
    if (activeCategoryFilter) {
      filtered = filtered.filter((e) => {
        const en = enrichments[e.id];
        return en?.classification?.category?.toLowerCase() === activeCategoryFilter;
      });
    }

    if (aiFilters.length > 0) {
      // Group filters by type
      const byType: Record<string, string[]> = {};
      for (const f of aiFilters) {
        if (!byType[f.type]) byType[f.type] = [];
        byType[f.type].push(f.value);
      }
      filtered = filtered.filter((e) => {
        const en = enrichments[e.id];
        if (!en) return false;
        // AND between types: email must match at least one value in each active type
        for (const [type, values] of Object.entries(byType)) {
          if (type === 'priority' && !values.includes(en.priority?.level ?? '')) return false;
          if (type === 'category' && !values.includes(en.classification?.category ?? '')) return false;
          if (type === 'sentiment' && !values.includes(en.classification?.sentiment ?? '')) return false;
        }
        return true;
      });
    }
    return filtered;
  }, [emails, searchResults, enrichments, filterUnread, aiFilters, activeCategoryFilter]);

  const hasActiveFilters = filterUnread || aiFilters.length > 0 || !!activeCategoryFilter;

  const topBar = (
    <div className="border-b border-border/50 space-y-0">
      {/* Search bar — Gmail style */}
      <div className="px-3 pt-3 pb-2">
        <div className={cn(
          'flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-1.5 transition-colors',
          searchQuery ? 'border-blue-500/50 bg-background' : 'border-border/60',
        )}>
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search emails..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults(null); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
          {searching && (
            <div className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-blue-500" />
          )}
          {/* Filter toggle */}
          <div ref={filterPanelRef} className="relative">
            <button
              onClick={() => setShowFilterPanel((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                hasActiveFilters || showFilterPanel
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <SlidersHorizontal className="size-3.5" />
            </button>

            {/* Filter dropdown */}
            {showFilterPanel && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[220px] rounded-xl border border-border bg-popover p-2 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">Filters</span>
                  {hasActiveFilters && (
                    <button
                      onClick={() => { setAiFilters([]); setFilterUnread(false); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Unread toggle */}
                <button
                  onClick={() => setFilterUnread((v) => !v)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                    filterUnread ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium' : 'hover:bg-accent',
                  )}
                >
                  <Filter className="size-3" />
                  Unread only
                  {unreadCount > 0 && (
                    <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{unreadCount}</span>
                  )}
                </button>

                {/* AI filters */}
                {hasAnyEnrichments && (
                  <>
                    <div className="my-1.5 h-px bg-border/50" />
                    <div className="flex items-center gap-1 mb-1.5 px-1">
                      <Sparkles className="size-3 text-purple-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">AI Filters</span>
                    </div>
                  </>
                )}

                {availableFilters.priorities.length > 0 && (
                  <div className="mb-1">
                    <div className="px-2.5 pb-1 text-[10px] font-medium text-muted-foreground/70">Priority</div>
                    <div className="flex flex-wrap gap-1 px-1.5">
                      {availableFilters.priorities.map((p) => (
                        <button
                          key={p}
                          onClick={() => toggleFilter({ type: 'priority', value: p })}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] capitalize transition-colors border',
                            isFilterActive('priority', p)
                              ? 'border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium'
                              : 'border-border/50 hover:bg-accent text-muted-foreground',
                          )}
                        >
                          <span className={cn('size-1.5 rounded-full', PRIORITY_COLORS[p])} />
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {availableFilters.categories.length > 0 && (
                  <div className="mb-1">
                    <div className="px-2.5 pb-1 text-[10px] font-medium text-muted-foreground/70">Category</div>
                    <div className="flex flex-wrap gap-1 px-1.5">
                      {availableFilters.categories.map((c) => (
                        <button
                          key={c}
                          onClick={() => toggleFilter({ type: 'category', value: c })}
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] transition-colors border',
                            isFilterActive('category', c)
                              ? 'border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium'
                              : 'border-border/50 hover:bg-accent text-muted-foreground',
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {availableFilters.sentiments.length > 0 && (
                  <div className="mb-1">
                    <div className="px-2.5 pb-1 text-[10px] font-medium text-muted-foreground/70">Sentiment</div>
                    <div className="flex flex-wrap gap-1 px-1.5">
                      {availableFilters.sentiments.map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleFilter({ type: 'sentiment', value: s })}
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] capitalize transition-colors border',
                            isFilterActive('sentiment', s)
                              ? 'border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium'
                              : 'border-border/50 hover:bg-accent text-muted-foreground',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Folder name + count + refresh + active filter chips */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-foreground">{folder}</h2>
            {!loading && emails.length > 0 && (
              <span className="flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium tabular-nums text-muted-foreground">
                {searchResults ? `${displayEmails.length} found` : emails.length}
              </span>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {activeCategoryFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400 capitalize">
                <Sparkles className="size-2.5" />
                {activeCategoryFilter}
                <button onClick={() => useEmailStore.getState().setActiveCategoryFilter(null)} className="ml-0.5 hover:text-green-800 dark:hover:text-green-200">
                  <X className="size-2.5" />
                </button>
              </span>
            )}
            {filterUnread && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                <Filter className="size-2.5" />
                Unread
                <button onClick={() => setFilterUnread(false)} className="ml-0.5 hover:text-blue-800 dark:hover:text-blue-200">
                  <X className="size-2.5" />
                </button>
              </span>
            )}
            {aiFilters.map((f) => (
              <span
                key={`${f.type}-${f.value}`}
                className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400"
              >
                <Sparkles className="size-2.5" />
                {f.value}
                <button
                  onClick={() => toggleFilter(f)}
                  className="ml-0.5 hover:text-purple-800 dark:hover:text-purple-200"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
            {(aiFilters.length + (filterUnread ? 1 : 0) + (activeCategoryFilter ? 1 : 0)) > 1 && (
              <button
                onClick={() => { setAiFilters([]); setFilterUnread(false); useEmailStore.getState().setActiveCategoryFilter(null); }}
                className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* AI Processing Progress Bar */}
      <AiProgressBar />
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        {topBar}
        <div className="flex-1 overflow-hidden">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        {topBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={fetchEmails}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {topBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="mt-0.5 text-xs text-muted-foreground">No emails in {folder.toLowerCase()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {topBar}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {hasActiveFilters && displayEmails.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No emails matching your filters</p>
            <button
              onClick={() => { setFilterUnread(false); setAiFilters([]); }}
              className="mt-2 text-xs text-blue-500 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
        {displayEmails.map((email) => {
          const isSelected = selectedEmailId === email.id;
          const isUnread = !email.isRead;
          const enrichment = enrichments[email.id];
          const priorityLevel = enrichment?.priority
            ? getPriorityLevel(enrichment.priority.score)
            : null;

          return (
            <button
              key={email.id}
              data-email-id={email.id}
              onClick={() => selectEmail(email.id)}
              className={cn(
                'group relative w-full border-b border-border/30 px-4 py-2.5 text-left transition-all duration-150',
                isSelected
                  ? 'bg-accent border-l-2 border-l-blue-500'
                  : 'hover:bg-accent/50 border-l-2 border-l-transparent',
                isUnread && !isSelected && 'border-l-2 border-l-blue-500/70',
              )}
            >
              {/* Row 1: Sender, Star, Date */}
              <div className="flex items-center gap-2">
                <div className="flex w-2 flex-shrink-0 justify-center">
                  {isUnread && (
                    <div className="size-2 rounded-full bg-blue-500" />
                  )}
                </div>

                {priorityLevel && priorityLevel !== 'none' && (
                  <div
                    className={cn(
                      'size-1.5 rounded-full flex-shrink-0',
                      PRIORITY_COLORS[priorityLevel],
                    )}
                    title={`Priority: ${priorityLevel}`}
                  />
                )}

                <span className={cn(
                  'flex-1 truncate text-sm',
                  isUnread ? 'font-semibold text-foreground' : 'text-foreground/80',
                )}>
                  {email.from?.name || email.from?.address || 'Unknown'}
                </span>

                <Star
                  className={cn(
                    'size-3.5 flex-shrink-0 transition-all duration-150',
                    email.isStarred
                      ? 'fill-yellow-500 text-yellow-500 opacity-100'
                      : 'text-muted-foreground opacity-0 group-hover:opacity-60',
                  )}
                />

                {email.attachments && email.attachments.length > 0 && (
                  <Paperclip className="size-3 flex-shrink-0 text-muted-foreground" />
                )}

                <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {email.date ? formatDistanceToNow(new Date(email.date), { addSuffix: false }) : ''}
                </span>

                {enrichment?.classification && (
                  <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                    {enrichment.classification.category}
                  </span>
                )}
              </div>

              {/* Row 2: Subject — Snippet */}
              <div className="mt-0.5 flex items-center gap-0 pl-4">
                <span className={cn(
                  'truncate text-[13px]',
                  isUnread ? 'font-medium text-foreground' : 'text-foreground/70',
                )}>
                  {email.subject || '(no subject)'}
                </span>
                {email.snippet && (
                  <span className="truncate text-[13px] text-muted-foreground">
                    &nbsp;&mdash;&nbsp;{email.snippet}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AiProgressBar() {
  const { aiProcessingStatus } = useEmailStore();
  const { processed, total, isProcessing } = aiProcessingStatus;

  if (!isProcessing || total === 0) return null;

  const percent = Math.round((processed / total) * 100);

  return (
    <div className="border-t border-border/30 px-3 py-1.5 bg-muted/20">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Brain className="size-3 animate-pulse text-purple-500" />
        <span>AI processing: {processed}/{total} emails</span>
        <span className="ml-auto tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
