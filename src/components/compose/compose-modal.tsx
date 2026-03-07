'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUiStore } from '@/stores/ui-store';
import { useEmailStore } from '@/stores/email-store';
import { toast } from 'sonner';
import {
  Send,
  Trash2,
  ChevronUp,
  Paperclip,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { AiComposeBar } from './ai-compose-bar';

import { sendEmail, replyToEmail, forwardEmail } from '@/server/actions/emails';

interface ComposeFormState {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

const INITIAL_FORM: ComposeFormState = {
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
};

function buildQuotedText(
  originalBody: string | undefined,
  from: { name?: string; address: string } | null,
  date: string | undefined
): string {
  const senderLabel = from?.name ?? from?.address ?? 'Unknown';
  const dateLabel = date ? new Date(date).toLocaleString() : '';
  const divider = `\n\n---------- Original Message ----------\nFrom: ${senderLabel}\nDate: ${dateLabel}\n\n`;
  return divider + (originalBody ?? '');
}

export function ComposeModal() {
  const { composeOpen, composeMode, composeReplyToId, closeCompose } = useUiStore();
  const { emails } = useEmailStore();

  const [form, setForm] = useState<ComposeFormState>(INITIAL_FORM);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // Resolve the email we are replying to / forwarding
  const originalEmail = useMemo(() => {
    if (!composeReplyToId) return null;
    return emails.find((e) => e.id === composeReplyToId) ?? null;
  }, [composeReplyToId, emails]);

  // Pre-fill form when compose opens
  useEffect(() => {
    if (!composeOpen) return;

    const next = { ...INITIAL_FORM };

    if (originalEmail) {
      const originalText = originalEmail.body?.text ?? '';

      if (composeMode === 'reply' || composeMode === 'replyAll') {
        next.to = originalEmail.from?.address ?? '';
        if (composeMode === 'replyAll' && originalEmail.cc) {
          next.cc = originalEmail.cc.map((c) => c.address).join(', ');
          setShowCc(true);
        }
        const subj = originalEmail.subject ?? '';
        next.subject = subj.startsWith('Re:') ? subj : `Re: ${subj}`;
        next.body = buildQuotedText(originalText, originalEmail.from, originalEmail.date);
      } else if (composeMode === 'forward') {
        const subj = originalEmail.subject ?? '';
        next.subject = subj.startsWith('Fwd:') ? subj : `Fwd: ${subj}`;
        next.body = buildQuotedText(originalText, originalEmail.from, originalEmail.date);
      }
    }

    setForm(next);

    // Focus the right field after next paint
    requestAnimationFrame(() => {
      if (composeMode === 'forward' || composeMode === 'new') {
        toRef.current?.focus();
      } else {
        bodyRef.current?.focus();
        // Place cursor at the beginning (before quoted text)
        if (bodyRef.current) {
          bodyRef.current.selectionStart = 0;
          bodyRef.current.selectionEnd = 0;
        }
      }
    });
  }, [composeOpen, composeMode, originalEmail]);

  const updateField = useCallback(
    (field: keyof ComposeFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    },
    []
  );

  const setBodyContent = useCallback((content: string) => {
    setForm((prev) => ({ ...prev, body: content }));
  }, []);

  const handleDiscard = useCallback(() => {
    setForm(INITIAL_FORM);
    setShowCc(false);
    setShowBcc(false);
    setIsFullScreen(false);
    closeCompose();
  }, [closeCompose]);

  const handleSend = useCallback(async () => {
    if (!form.to.trim()) {
      toast.error('Please add at least one recipient.');
      return;
    }

    setIsSending(true);

    try {
      const toAddresses = form.to.split(',').map((a) => a.trim()).filter(Boolean);
      const ccAddresses = form.cc ? form.cc.split(',').map((a) => a.trim()).filter(Boolean) : undefined;
      const bccAddresses = form.bcc ? form.bcc.split(',').map((a) => a.trim()).filter(Boolean) : undefined;

      let result;

      if (composeMode === 'reply' || composeMode === 'replyAll') {
        result = await replyToEmail(composeReplyToId!, { text: form.body });
      } else if (composeMode === 'forward') {
        result = await forwardEmail(composeReplyToId!, toAddresses);
      } else {
        result = await sendEmail({
          to: toAddresses,
          subject: form.subject,
          text: form.body,
          cc: ccAddresses,
          bcc: bccAddresses,
        });
      }

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Email sent successfully.');
      handleDiscard();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send email.';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  }, [form, composeMode, composeReplyToId, handleDiscard]);

  const modeLabel =
    composeMode === 'reply'
      ? 'Reply'
      : composeMode === 'replyAll'
        ? 'Reply All'
        : composeMode === 'forward'
          ? 'Forward'
          : 'New Message';

  return (
    <Dialog
      open={composeOpen}
      onOpenChange={(open) => {
        if (!open) handleDiscard();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={
          isFullScreen
            ? 'sm:max-w-[calc(100vw-4rem)] sm:max-h-[calc(100vh-4rem)] h-[calc(100vh-4rem)] flex flex-col'
            : 'sm:max-w-2xl flex flex-col max-h-[85vh]'
        }
      >
        {/* Header */}
        <DialogHeader className="flex-none">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">{modeLabel}</DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsFullScreen((v) => !v)}
                title={isFullScreen ? 'Exit full screen' : 'Full screen'}
              >
                {isFullScreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Compose and send an email message
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto min-h-0">
          {/* To */}
          <div className="flex items-center gap-2">
            <label htmlFor="compose-to" className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              ref={toRef}
              id="compose-to"
              placeholder="recipient@example.com"
              value={form.to}
              onChange={updateField('to')}
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-8"
            />
            <div className="flex items-center gap-1 shrink-0">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Bcc
                </button>
              )}
            </div>
          </div>

          {/* CC */}
          {showCc && (
            <div className="flex items-center gap-2">
              <label htmlFor="compose-cc" className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
                Cc
              </label>
              <Input
                id="compose-cc"
                placeholder="cc@example.com"
                value={form.cc}
                onChange={updateField('cc')}
                className="border-0 shadow-none focus-visible:ring-0 px-0 h-8"
              />
              <button
                type="button"
                onClick={() => {
                  setShowCc(false);
                  setForm((prev) => ({ ...prev, cc: '' }));
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronUp className="size-3" />
              </button>
            </div>
          )}

          {/* BCC */}
          {showBcc && (
            <div className="flex items-center gap-2">
              <label htmlFor="compose-bcc" className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
                Bcc
              </label>
              <Input
                id="compose-bcc"
                placeholder="bcc@example.com"
                value={form.bcc}
                onChange={updateField('bcc')}
                className="border-0 shadow-none focus-visible:ring-0 px-0 h-8"
              />
              <button
                type="button"
                onClick={() => {
                  setShowBcc(false);
                  setForm((prev) => ({ ...prev, bcc: '' }));
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronUp className="size-3" />
              </button>
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <label htmlFor="compose-subject" className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
              Subject
            </label>
            <Input
              id="compose-subject"
              placeholder="Subject"
              value={form.subject}
              onChange={updateField('subject')}
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 font-medium"
            />
          </div>

          {/* Body */}
          <Textarea
            ref={bodyRef}
            placeholder="Write your message..."
            value={form.body}
            onChange={updateField('body')}
            className="flex-1 min-h-[200px] resize-none border-0 shadow-none focus-visible:ring-0 px-0"
          />

          {/* AI Compose Bar */}
          <AiComposeBar body={form.body} onBodyChange={setBodyContent} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3 flex-none">
          <div className="flex items-center gap-2">
            <Button onClick={handleSend} disabled={isSending} size="sm">
              <Send className="size-3.5" />
              {isSending ? 'Sending...' : 'Send'}
            </Button>
            <Button variant="ghost" size="icon-sm" title="Attach file" disabled>
              <Paperclip className="size-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleDiscard} className="text-muted-foreground">
            <Trash2 className="size-3.5" />
            Discard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
