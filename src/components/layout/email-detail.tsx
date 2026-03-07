'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEmailStore } from '@/stores/email-store';
import { useUiStore } from '@/stores/ui-store';
import { format } from 'date-fns';
import {
  Reply,
  ReplyAll,
  Forward,
  Archive,
  Trash2,
  Star,
  MoreHorizontal,
  Loader2,
  Paperclip,
  Mail,
  MailOpen,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Clock,
  CircleDot,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getPriorityLevel, PRIORITY_COLORS, CLASSIFICATION_COLORS } from '@/lib/constants';
import {
  getEmail,
  archiveEmail,
  deleteEmail,
  starEmail,
  unstarEmail,
  markAsRead,
  markAsUnread,
} from '@/server/actions/emails';
import {
  classifyEmail,
  summarizeEmail,
  prioritizeEmail,
  detectActions,
  extractTopics,
} from '@/server/actions/ai';
import { ThreadView } from '@/components/email/thread-view';
import { AskAiPanel } from '@/components/ai/ask-ai-panel';
import type { SerializedEmail, WorkflowExecutionResult } from '@/types';

interface EmailDetailProps {
  emailId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return FileImage;
  if (contentType.includes('pdf')) return FileText;
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return FileSpreadsheet;
  if (contentType.includes('document') || contentType.includes('word')) return FileText;
  return File;
}

function getSenderInitial(from: SerializedEmail['from']): string {
  if (from?.name) return from.name.charAt(0).toUpperCase();
  if (from?.address) return from.address.charAt(0).toUpperCase();
  return '?';
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-cyan-500',
    'bg-rose-500',
    'bg-emerald-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const PRIORITY_DOT_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
  none: 'bg-transparent',
};

const PRIORITY_TEXT_COLORS: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-muted-foreground',
  none: 'text-muted-foreground',
};

/* ------------------------------------------------------------------ */
/*  Skeleton placeholders                                              */
/* ------------------------------------------------------------------ */
function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded bg-muted', className)}
    />
  );
}

function EmailDetailSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header skeleton */}
      <div className="border-b border-border px-6 py-5 space-y-4">
        <SkeletonLine className="h-6 w-2/3" />
        <div className="flex items-center gap-3">
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="h-4 w-40" />
            <SkeletonLine className="h-3 w-24" />
          </div>
          <SkeletonLine className="h-3 w-32" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="size-8 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
      {/* Body skeleton */}
      <div className="flex-1 px-6 py-6 space-y-3">
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-5/6" />
        <SkeletonLine className="h-4 w-4/6" />
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-3/4" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Icon-only action button                                            */
/* ------------------------------------------------------------------ */
function ActionButton({
  onClick,
  disabled,
  loading: isLoading,
  icon: Icon,
  label,
  className,
  active,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'relative inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'text-yellow-500',
        className
      )}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Icon className={cn('size-4', active && 'fill-current')} />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  3-dot actions dropdown (Gmail-style)                                */
/* ------------------------------------------------------------------ */
function ActionsDropdown({
  emailId,
  email,
  actionLoading,
  onReplyAll,
  onArchive,
  onDelete,
  onToggleStar,
  onToggleRead,
}: {
  emailId: string;
  email: SerializedEmail;
  actionLoading: string | null;
  onReplyAll: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onToggleRead: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const items: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; className?: string; active?: boolean }> = [
    { icon: ReplyAll, label: 'Reply All', onClick: onReplyAll },
    { icon: Archive, label: 'Archive', onClick: onArchive },
    { icon: Trash2, label: 'Delete', onClick: onDelete, className: 'text-destructive' },
    { icon: Star, label: email.isStarred ? 'Unstar' : 'Star', onClick: onToggleStar, active: email.isStarred },
    { icon: email.isRead ? Mail : MailOpen, label: email.isRead ? 'Mark Unread' : 'Mark Read', onClick: onToggleRead },
  ];

  return (
    <div className="relative" ref={ref}>
      <ActionButton
        onClick={() => setOpen((v) => !v)}
        icon={MoreHorizontal}
        label="More actions"
      />
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-popover py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false); }}
              disabled={actionLoading === item.label.toLowerCase()}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent',
                'disabled:pointer-events-none disabled:opacity-40',
                item.className,
                item.active && 'text-yellow-500',
              )}
            >
              <item.icon className={cn('size-4', item.active && 'fill-current')} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HTML email renderer using iframe for proper image loading           */
/* ------------------------------------------------------------------ */
function EmailHtmlFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    // Wrap email HTML in a measurement div. The wrapper has display:inline-block
    // so it shrink-wraps to the natural content width, letting us measure overflow.
    // The outer body has no overflow:hidden so scrollWidth reflects true content size.
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1a1a1a;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    a { color: #2563eb; }
    pre, code { white-space: pre-wrap; overflow-x: auto; }
    #email-wrapper {
      display: inline-block;
      min-width: 100%;
      transform-origin: top left;
    }
    #email-wrapper img { max-width: 100%; height: auto; }
  </style>
</head>
<body><div id="email-wrapper">${html}</div></body>
</html>`);
    doc.close();

    const wrapper = doc.getElementById('email-wrapper');
    if (!wrapper) return;

    const fitContent = () => {
      const containerWidth = iframe.clientWidth;
      if (containerWidth <= 0) return;

      // Reset transform to measure natural width
      wrapper.style.transform = '';
      wrapper.style.width = '';

      // Measure the natural content width (inline-block shrink-wraps to content)
      const naturalWidth = wrapper.scrollWidth;

      if (naturalWidth > containerWidth) {
        // Scale down to fit — preserves original email layout proportions
        const scale = containerWidth / naturalWidth;
        wrapper.style.transform = `scale(${scale})`;
        wrapper.style.width = `${naturalWidth}px`;
        setHeight(Math.max(wrapper.scrollHeight * scale, 100));
      } else {
        // Content fits — render at 100% width
        wrapper.style.width = '100%';
        wrapper.style.display = 'block';
        setHeight(Math.max(wrapper.scrollHeight, 100));
      }
    };

    // Resize after images load
    const images = doc.querySelectorAll('img');
    let loaded = 0;
    const total = images.length;
    const onLoad = () => {
      loaded++;
      if (loaded >= total) fitContent();
    };
    images.forEach((img) => {
      if (img.complete) { loaded++; } else {
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onLoad);
      }
    });

    // Initial fit + delayed fit for dynamic/late content
    fitContent();
    const t1 = setTimeout(fitContent, 300);
    const t2 = setTimeout(fitContent, 1000);

    // Open links in new tab
    doc.addEventListener('click', (e) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (anchor?.href) {
        e.preventDefault();
        window.open(anchor.href, '_blank', 'noopener');
      }
    });

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin allow-popups"
      style={{ width: '100%', height, border: 'none', display: 'block', overflow: 'hidden' }}
      title="Email content"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export function EmailDetail({ emailId }: EmailDetailProps) {
  const { emails, enrichments, workflowResults, removeEmail, updateEmail, setEnrichment } = useEmailStore();
  const { openCompose } = useUiStore();

  const [fullEmail, setFullEmail] = useState<SerializedEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);

  // The list email (snippet-only) from the store
  const listEmail = emails.find((e) => e.id === emailId);
  // Prefer the fully fetched email; fall back to the list version
  const email = fullEmail ?? listEmail;
  const enrichment = enrichments[emailId];

  // Fetch full email when emailId changes
  // Show list email (from/subject/date) immediately — only skeleton for the body
  const fetchFullEmail = useCallback(async () => {
    console.log('[EmailDetail] fetchFullEmail called for:', emailId);
    setFullEmail(null);
    // Only show full skeleton if we have no list email to display
    const hasListEmail = useEmailStore.getState().emails.some((e) => e.id === emailId);
    console.log('[EmailDetail] hasListEmail:', hasListEmail, 'setting loading:', !hasListEmail);
    setLoading(!hasListEmail);

    try {
      console.log('[EmailDetail] calling getEmail...');
      const result = await getEmail(emailId);
      console.log('[EmailDetail] getEmail returned, success:', result.success);

      if (result.success) {
        setFullEmail(result.data);
        updateEmail(emailId, result.data);

        // Auto mark-as-read when opening an email
        if (!result.data.isRead) {
          updateEmail(emailId, { isRead: true });
          markAsRead(emailId).catch(() => {});
        }
      } else {
        console.error('[EmailDetail] getEmail failed:', result.error);
        toast.error('Failed to load email', { description: result.error });
      }
    } catch (err) {
      console.error('[EmailDetail] getEmail threw:', err);
      toast.error('Failed to load email');
    }

    setLoading(false);
  }, [emailId, updateEmail]);

  useEffect(() => {
    void fetchFullEmail();
  }, [fetchFullEmail]);

  // Fire AI enrichments independently — only fetch missing fields (cached ones skip API)
  useEffect(() => {
    if (!fullEmail) return;
    const existing = useEmailStore.getState().enrichments[emailId];
    // If all 5 fields are already cached, nothing to do
    if (existing?.priority && existing?.classification && existing?.summary && existing?.actionItems && existing?.topics) return;
    // If already loading, skip
    if (existing?._loading) return;

    const emailContent = {
      subject: fullEmail.subject,
      body: fullEmail.body,
      from: fullEmail.from,
      to: fullEmail.to,
      date: fullEmail.date,
      attachments: fullEmail.attachments ?? [],
    };

    setEnrichment(emailId, { _loading: true });

    // Phase 1: classify + prioritize (only if missing — server actions also check cache)
    if (!existing?.classification) {
      classifyEmail(emailId, emailContent).then((r) => {
        if (r.success) setEnrichment(emailId, { classification: r.data });
        else console.warn('[AI] classify failed:', r.error);
      }).catch((err) => console.warn('[AI] classify error:', err));
    }

    if (!existing?.priority) {
      prioritizeEmail(emailId, emailContent).then((r) => {
        if (r.success) setEnrichment(emailId, { priority: r.data });
        else console.warn('[AI] prioritize failed:', r.error);
      }).catch((err) => console.warn('[AI] prioritize error:', err));
    }

    // Phase 2: summary + actions + topics (staggered, only if missing)
    const needsSummary = !existing?.summary;
    const needsActions = !existing?.actionItems;
    const needsTopics = !existing?.topics;

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (needsSummary || needsActions || needsTopics) {
      timer = setTimeout(() => {
        if (needsSummary) {
          summarizeEmail(emailId, emailContent).then((r) => {
            if (r.success) setEnrichment(emailId, { summary: r.data });
            else console.warn('[AI] summarize failed:', r.error);
          }).catch((err) => console.warn('[AI] summarize error:', err));
        }
        if (needsActions) {
          detectActions(emailId, emailContent).then((r) => {
            if (r.success) setEnrichment(emailId, { actionItems: r.data });
            else console.warn('[AI] detectActions failed:', r.error);
          }).catch((err) => console.warn('[AI] detectActions error:', err));
        }
        if (needsTopics) {
          extractTopics(emailId, emailContent).then((r) => {
            if (r.success) setEnrichment(emailId, { topics: r.data });
            else console.warn('[AI] extractTopics failed:', r.error);
          }).catch((err) => console.warn('[AI] extractTopics error:', err));
        }
      }, 1000);
    }

    return () => { if (timer) clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- enrichments read via getState() to avoid re-render loop
  }, [fullEmail, emailId, setEnrichment]);

  // Action handlers
  const handleArchive = useCallback(async () => {
    setActionLoading('archive');
    removeEmail(emailId);
    const result = await archiveEmail(emailId);
    if (result.success) {
      toast.success('Email archived');
    } else {
      toast.error('Failed to archive email', { description: result.error });
    }
    setActionLoading(null);
  }, [emailId, removeEmail]);

  const handleDelete = useCallback(async () => {
    setActionLoading('delete');
    removeEmail(emailId);
    const result = await deleteEmail(emailId);
    if (result.success) {
      toast.success('Email deleted');
    } else {
      toast.error('Failed to delete email', { description: result.error });
    }
    setActionLoading(null);
  }, [emailId, removeEmail]);

  const handleToggleStar = useCallback(async () => {
    if (!email) return;
    setActionLoading('star');
    const wasStarred = email.isStarred;
    // Optimistic update
    updateEmail(emailId, { isStarred: !wasStarred });
    if (fullEmail) {
      setFullEmail((prev) => (prev ? { ...prev, isStarred: !wasStarred } : prev));
    }

    const result = wasStarred ? await unstarEmail(emailId) : await starEmail(emailId);
    if (result.success) {
      toast.success(wasStarred ? 'Star removed' : 'Email starred');
    } else {
      // Revert on failure
      updateEmail(emailId, { isStarred: wasStarred });
      if (fullEmail) {
        setFullEmail((prev) => (prev ? { ...prev, isStarred: wasStarred } : prev));
      }
      toast.error('Failed to update star', { description: result.error });
    }
    setActionLoading(null);
  }, [email, emailId, fullEmail, updateEmail]);

  const handleToggleRead = useCallback(async () => {
    if (!email) return;
    setActionLoading('read');
    const wasRead = email.isRead;
    // Optimistic update
    updateEmail(emailId, { isRead: !wasRead });
    if (fullEmail) {
      setFullEmail((prev) => (prev ? { ...prev, isRead: !wasRead } : prev));
    }

    const result = wasRead ? await markAsUnread(emailId) : await markAsRead(emailId);
    if (result.success) {
      toast.success(wasRead ? 'Marked as unread' : 'Marked as read');
    } else {
      // Revert on failure
      updateEmail(emailId, { isRead: wasRead });
      if (fullEmail) {
        setFullEmail((prev) => (prev ? { ...prev, isRead: wasRead } : prev));
      }
      toast.error('Failed to update read status', { description: result.error });
    }
    setActionLoading(null);
  }, [email, emailId, fullEmail, updateEmail]);

  // Loading state — skeleton
  if (loading && !email) {
    return <EmailDetailSkeleton />;
  }

  if (!email) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Email not found</p>
      </div>
    );
  }

  const senderName = email.from?.name || email.from?.address || 'Unknown';
  const senderAddress = email.from?.address || '';
  const recipients = email.to.map((t) => t.name || t.address).join(', ');
  const ccRecipients = email.cc?.map((c) => c.name || c.address).join(', ');
  const priorityLevel = enrichment?.priority
    ? getPriorityLevel(enrichment.priority.score)
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ============================================================ */}
      {/*  Header Section                                               */}
      {/* ============================================================ */}
      <div className="border-b border-border px-6 pt-5 pb-4 space-y-3">
        {/* Subject + action buttons on same row (Gmail-style) */}
        <div className="flex items-start gap-3">
          <h1 className="text-lg font-semibold leading-tight tracking-tight flex-1 min-w-0">
            {email.subject || '(no subject)'}
          </h1>
          <div className="flex items-center gap-0.5 shrink-0">
            <ActionButton
              onClick={() => openCompose('reply', emailId)}
              icon={Reply}
              label="Reply"
            />
            <ActionButton
              onClick={() => openCompose('forward', emailId)}
              icon={Forward}
              label="Forward"
            />
            <ActionsDropdown
              emailId={emailId}
              email={email}
              actionLoading={actionLoading}
              onReplyAll={() => openCompose('replyAll', emailId)}
              onArchive={() => void handleArchive()}
              onDelete={() => void handleDelete()}
              onToggleStar={() => void handleToggleStar()}
              onToggleRead={() => void handleToggleRead()}
            />
          </div>
        </div>

        {/* Sender row */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white select-none',
              getAvatarColor(senderName)
            )}
          >
            {getSenderInitial(email.from)}
          </div>

          {/* Sender info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {senderName}
              </span>
              {email.from?.name && (
                <span className="text-xs text-muted-foreground truncate">
                  &lt;{senderAddress}&gt;
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              to {recipients}
              {ccRecipients && (
                <span className="ml-1">
                  cc {ccRecipients}
                </span>
              )}
            </div>
          </div>

          {/* Date */}
          <div className="shrink-0 text-xs text-muted-foreground pt-0.5">
            {email.date
              ? format(new Date(email.date), 'MMM d, yyyy, h:mm a')
              : ''}
          </div>
        </div>

        {/* AI Enrichment Bar — shows results progressively as they arrive */}
        {enrichment && (enrichment.priority || enrichment.classification) ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
            <Sparkles className="size-3.5 text-muted-foreground/60 shrink-0" />

            {enrichment.priority && priorityLevel && priorityLevel !== 'none' && (
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-2 rounded-full shrink-0',
                    PRIORITY_DOT_COLORS[priorityLevel]
                  )}
                />
                <span
                  className={cn(
                    'text-xs font-medium capitalize',
                    PRIORITY_TEXT_COLORS[priorityLevel]
                  )}
                >
                  {enrichment.priority.level}
                </span>
              </div>
            )}

            {enrichment.classification && (
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium text-white',
                  CLASSIFICATION_COLORS[enrichment.classification.category.toLowerCase()] ??
                    CLASSIFICATION_COLORS['other']
                )}
              >
                {enrichment.classification.category}
              </span>
            )}

            {enrichment.classification?.sentiment && (
              <span className="text-[11px] text-muted-foreground capitalize">
                {enrichment.classification.sentiment}
              </span>
            )}

            {/* Topics tags */}
            {enrichment.topics && enrichment.topics.length > 0 && (
              <>
                <div className="mx-1 h-3.5 w-px bg-border/60" />
                {enrichment.topics.slice(0, 3).map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {topic}
                  </span>
                ))}
              </>
            )}

            {/* Show spinner while more results are still loading */}
            {enrichment._loading && (!enrichment.priority || !enrichment.classification) && (
              <Loader2 className="size-3 animate-spin text-muted-foreground/40" />
            )}

            <div className="ml-auto flex items-center gap-1">
              {enrichment?.summary && (
                <button
                  onClick={() => setSummaryExpanded((prev) => !prev)}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                    summaryExpanded ? 'text-purple-500 bg-purple-500/10' : 'text-purple-500 hover:bg-purple-500/10',
                  )}
                >
                  <Sparkles className="size-3" />
                  Summary
                </button>
              )}
              <button
                onClick={() => setAskAiOpen((prev) => !prev)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  askAiOpen ? 'text-indigo-500 bg-indigo-500/10' : 'text-indigo-500 hover:bg-indigo-500/10',
                )}
              >
                <Bot className="size-3" />
                Ask AI
              </button>
            </div>
          </div>
        ) : enrichment?._loading ? (
          /* Shimmer while AI enrichments are loading (no results yet) */
          <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
            <Sparkles className="size-3.5 text-muted-foreground/40 animate-pulse shrink-0" />
            <div className="flex items-center gap-2">
              <SkeletonLine className="h-3 w-16" />
              <SkeletonLine className="h-4 w-20 rounded-md" />
              <SkeletonLine className="h-3 w-12" />
            </div>
            <span className="ml-auto text-[10px] text-muted-foreground/40 select-none">
              Analyzing...
            </span>
          </div>
        ) : enrichment?._error ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
            <Sparkles className="size-3.5 text-muted-foreground/40 shrink-0" />
            <span className="text-[11px] text-muted-foreground">
              AI error: {enrichment._error}
            </span>
          </div>
        ) : null}

      </div>

      {/* ============================================================ */}
      {/*  AI Summary — Collapsible                                     */}
      {/* ============================================================ */}
      {enrichment?.summary && summaryExpanded && (
        <div className="border-b border-border">
          <div className="px-6 py-3 bg-gradient-to-b from-purple-50/40 to-transparent dark:from-purple-950/20">
            <p className="text-sm leading-relaxed text-foreground/90">
              {enrichment.summary.summary}
            </p>
            {enrichment.summary.keyPoints.length > 0 && (
              <ul className="mt-2 space-y-1">
                {enrichment.summary.keyPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 size-3 shrink-0 text-green-500" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Email Body                                                   */}
      {/* ============================================================ */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="border-t border-border/50" />
        <div className="px-6 py-6">
          {loading ? (
            <div className="space-y-3">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-5/6" />
              <SkeletonLine className="h-4 w-4/6" />
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
              <SkeletonLine className="h-4 w-2/3" />
            </div>
          ) : (
            <>
              {/* Body content — always prefer HTML */}
              {email.body?.html ? (
                <EmailHtmlFrame html={email.body.html} />
              ) : (
                <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans">
                  {email.body?.text || ''}
                </div>
              )}
            </>
          )}
        </div>

        {/* ============================================================ */}
        {/*  Attachments                                                  */}
        {/* ============================================================ */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="border-t border-border/50 px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((attachment) => {
                const FileIcon = getFileIcon(attachment.contentType);
                return (
                  <div
                    key={attachment.id}
                    className="group inline-flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/60 cursor-pointer"
                  >
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                      <FileIcon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate max-w-[180px]">
                        {attachment.filename}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatFileSize(attachment.size)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Action Items                                                 */}
        {/* ============================================================ */}
        {enrichment?.actionItems && enrichment.actionItems.length > 0 && (
          <div className="border-t border-border/50 px-6 py-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CircleDot className="size-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Action Items
                </span>
                <Sparkles className="size-3 text-muted-foreground/40" />
              </div>
              <ul className="space-y-2">
                {enrichment.actionItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-border accent-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground">{item.action}</span>
                      {item.deadline && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <Clock className="size-2.5" />
                          {item.deadline}
                        </span>
                      )}
                    </div>
                    {item.priority && (
                      <span
                        className={cn(
                          'shrink-0 text-[11px] font-medium capitalize',
                          item.priority === 'high'
                            ? 'text-red-500'
                            : item.priority === 'medium'
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-muted-foreground'
                        )}
                      >
                        {item.priority}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Workflow Results                                               */}
        {/* ============================================================ */}
        {workflowResults[emailId] && workflowResults[emailId].some((r) => r.matched) && (
          <div className="border-t border-border/50 px-6 py-4">
            <div className="rounded-lg border border-purple-500/20 bg-purple-50/30 dark:bg-purple-950/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-3.5 text-purple-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Workflow Results
                </span>
              </div>
              <div className="space-y-2">
                {workflowResults[emailId].filter((r) => r.matched).map((result) => (
                  <div key={result.ruleId} className="space-y-1">
                    <p className="text-xs font-medium text-foreground">{result.ruleName}</p>
                    {result.actionsExecuted.map((action, i) => (
                      <div key={i} className="flex items-center gap-2 pl-3">
                        <span className={cn(
                          'size-1.5 rounded-full',
                          action.success ? 'bg-green-500' : 'bg-red-500',
                        )} />
                        <span className="text-[11px] text-muted-foreground">
                          {action.type}
                          {action.result && typeof action.result === 'object' && 'answer' in (action.result as Record<string, unknown>)
                            ? `: ${String((action.result as Record<string, unknown>).answer).slice(0, 100)}...`
                            : action.error ? `: ${action.error}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Thread View                                                  */}
        {/* ============================================================ */}
        {email.threadId && (
          <ThreadView threadId={email.threadId} currentEmailId={emailId} />
        )}
      </div>

      {/* ============================================================ */}
      {/*  Ask AI Panel — sticky bottom, outside scroll area             */}
      {/* ============================================================ */}
      {askAiOpen && (
        <AskAiPanel emailId={emailId} onClose={() => setAskAiOpen(false)} />
      )}
    </div>
  );
}
