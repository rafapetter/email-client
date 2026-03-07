'use client';

import { useUiStore } from '@/stores/ui-store';
import { EmailDetail } from '@/components/layout/email-detail';
import { MIN_PANE_WIDTH } from '@/lib/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Search, ArrowLeft, X } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Star, Paperclip } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SerializedEmail } from '@/types';

import { searchEmails } from '@/server/actions/search';

export default function SearchPage() {
  const { listWidth, setListWidth } = useUiStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialEmailId = searchParams.get('emailId') ?? null;

  const [query, setQuery] = useState(initialQuery);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(initialEmailId);
  const [results, setResults] = useState<SerializedEmail[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFullWidth = !selectedEmailId;

  // Update URL when query or selected email changes
  const updateUrl = useCallback((q: string, emailId: string | null) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (emailId) params.set('emailId', emailId);
    const url = params.toString() ? `/search?${params.toString()}` : '/search';
    window.history.replaceState(null, '', url);
  }, []);

  const handleSelectEmail = useCallback((emailId: string) => {
    setSelectedEmailId(emailId);
    updateUrl(query, emailId);
  }, [query, updateUrl]);

  const handleCloseDetail = useCallback(() => {
    setSelectedEmailId(null);
    updateUrl(query, null);
  }, [query, updateUrl]);

  // Perform search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchEmails(q);
      if (result.success) {
        setResults(result.data);
      } else {
        setResults([]);
      }
      setHasSearched(true);
    } catch {
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      updateUrl('', selectedEmailId);
      return;
    }

    updateUrl(query, selectedEmailId);

    debounceTimer.current = setTimeout(() => {
      void doSearch(query);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Search immediately on mount if there's a query from URL
  useEffect(() => {
    if (initialQuery) {
      void doSearch(initialQuery);
    }
    // Focus the input
    inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Search list panel — full width when no email selected, fixed width when email is open */}
      <div
        style={!isFullWidth ? { width: listWidth } : undefined}
        className={cn('overflow-hidden', isFullWidth ? 'flex-1 w-full' : 'flex-shrink-0')}
      >
        <div className="flex h-full flex-col">
          {/* Search header */}
          <div className="border-b border-border px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.back()}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
              >
                <ArrowLeft className="size-4" />
              </button>
              <h2 className="text-sm font-semibold">Search</h2>
              {hasSearched && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search emails..."
                autoFocus
                className="w-full rounded-md border border-border bg-background pl-9 pr-8 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {isSearching && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Search className="size-4 animate-pulse mr-2" />
                Searching...
              </div>
            )}

            {!isSearching && hasSearched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="size-8 mb-3 opacity-30" />
                <p className="text-sm">No results found</p>
                <p className="text-xs mt-1">Try different keywords or check spelling</p>
              </div>
            )}

            {!isSearching && !hasSearched && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="size-8 mb-3 opacity-30" />
                <p className="text-sm">Search your emails</p>
                <p className="text-xs mt-1">Search by sender, subject, or content</p>
              </div>
            )}

            {/* Full-width result rows */}
            {results.map((email) => (
              <button
                key={email.id}
                onClick={() => handleSelectEmail(email.id)}
                className={cn(
                  'w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent/50',
                  selectedEmailId === email.id && 'bg-accent',
                  !email.isRead && 'bg-accent/20',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm shrink-0', !email.isRead ? 'font-semibold' : 'text-foreground')}>
                        {email.from?.name || email.from?.address || 'Unknown'}
                      </span>
                      {email.isStarred && (
                        <Star className="size-3 shrink-0 fill-yellow-500 text-yellow-500" />
                      )}
                      {email.attachments.length > 0 && (
                        <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {email.date
                          ? isFullWidth
                            ? format(new Date(email.date), 'MMM d, yyyy')
                            : formatDistanceToNow(new Date(email.date), { addSuffix: false })
                          : ''}
                      </span>
                    </div>
                    <p className={cn('text-sm mt-0.5', !email.isRead ? 'font-medium' : 'text-foreground/90', isFullWidth ? '' : 'truncate')}>
                      {email.subject || '(no subject)'}
                    </p>
                    <p className={cn('text-xs text-muted-foreground mt-0.5', isFullWidth ? 'line-clamp-2' : 'truncate')}>
                      {email.snippet}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Email detail pane */}
      {selectedEmailId && (
        <>
          <ListResizeHandle
            onResize={(delta) => {
              const newWidth = listWidth + delta;
              if (newWidth >= MIN_PANE_WIDTH && newWidth <= 800) {
                setListWidth(newWidth);
              }
            }}
          />
          <div className="flex-1 overflow-hidden relative">
            <button
              onClick={handleCloseDetail}
              className="absolute top-3 right-3 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
              title="Close"
            >
              <X className="size-4" />
            </button>
            <EmailDetail emailId={selectedEmailId} />
          </div>
        </>
      )}
    </div>
  );
}

function ListResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      lastX.current = e.clientX;
      setIsDragging(true);

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - lastX.current;
        lastX.current = e.clientX;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onResize],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'w-1 cursor-col-resize hover:bg-primary/20 transition-colors flex-shrink-0',
        isDragging && 'bg-primary/30',
      )}
    />
  );
}
