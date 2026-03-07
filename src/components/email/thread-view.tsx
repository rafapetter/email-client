'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getThread } from '@/server/actions/threads';
import type { SerializedEmail } from '@/types';

interface ThreadViewProps {
  threadId: string;
  currentEmailId: string;
}

interface ThreadEmail {
  email: SerializedEmail;
  expanded: boolean;
}

export function ThreadView({ threadId, currentEmailId }: ThreadViewProps) {
  const [threadEmails, setThreadEmails] = useState<ThreadEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getThread(threadId);
    if (result.success) {
      setThreadEmails(
        result.data.emails.map((email) => ({
          email,
          expanded: email.id === currentEmailId,
        })),
      );
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [threadId, currentEmailId]);

  useEffect(() => {
    void fetchThread();
  }, [fetchThread]);

  const toggleExpanded = useCallback((emailId: string) => {
    setThreadEmails((prev) =>
      prev.map((item) =>
        item.email.id === emailId ? { ...item, expanded: !item.expanded } : item,
      ),
    );
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || threadEmails.length === 0) {
    return null;
  }

  if (threadEmails.length <= 1) {
    return null;
  }

  const unreadCount = threadEmails.filter((t) => !t.email.isRead).length;

  return (
    <div className="border-t border-border">
      <div className="flex items-center gap-2 px-6 py-2.5 bg-muted/20">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground">
          Thread ({threadEmails.length} messages)
        </p>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500/15 px-1 text-[10px] font-semibold text-blue-500">
            {unreadCount} unread
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        {threadEmails.map(({ email, expanded }) => (
          <div
            key={email.id}
            className={cn(
              email.id === currentEmailId && 'bg-accent/20',
              !email.isRead && email.id !== currentEmailId && 'bg-blue-50/30 dark:bg-blue-950/10',
            )}
          >
            <button
              onClick={() => toggleExpanded(email.id)}
              className="flex w-full items-center gap-2 px-6 py-2.5 text-left hover:bg-accent/30 transition-colors"
            >
              {expanded ? (
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
              )}
              {!email.isRead && (
                <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />
              )}
              <span className={cn('text-sm truncate', !email.isRead && 'font-semibold')}>
                {email.from?.name || email.from?.address || 'Unknown'}
              </span>
              {!expanded && email.snippet && (
                <span className="text-xs text-muted-foreground/60 truncate flex-1">
                  — {email.snippet}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap shrink-0">
                {email.date ? format(new Date(email.date), 'MMM d, h:mm a') : ''}
              </span>
            </button>
            {expanded && (
              <div className="px-6 pb-4">
                {email.body?.html ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: email.body.html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm font-sans">
                    {email.body?.text || ''}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
