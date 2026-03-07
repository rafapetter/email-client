'use client';

import { useCallback, useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { askAi } from '@/server/actions/ai';
import { useEmailStore } from '@/stores/email-store';

interface AskAiPanelProps {
  emailId?: string;
  onClose: () => void;
}

interface AiAnswer {
  answer: string;
  sources: Array<{ emailId: string; subject: string }>;
  confidence: number;
}

export function AskAiPanel({ emailId, onClose }: AskAiPanelProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setSelectedEmailId } = useEmailStore();

  const handleAsk = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);

    const emailIds = emailId ? [emailId] : undefined;
    const result = await askAi(question.trim(), emailIds);

    if (result.success) {
      setAnswer(result.data);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [question, loading, emailId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleAsk();
      }
    },
    [handleAsk],
  );

  return (
    <div className="border-t border-border bg-gradient-to-b from-indigo-50/30 to-transparent dark:from-indigo-950/20">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-indigo-500" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Ask AI
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this email..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            disabled={loading}
          />
          <button
            onClick={() => void handleAsk()}
            disabled={!question.trim() || loading}
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              question.trim() && !loading
                ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                : 'text-muted-foreground/40',
            )}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}

        {answer && (
          <div className="mt-3 space-y-2">
            <p className="text-sm leading-relaxed text-foreground/90">{answer.answer}</p>

            {answer.sources && answer.sources.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Sources:</span>
                {answer.sources.map((source) => (
                  <button
                    key={source.emailId}
                    onClick={() => setSelectedEmailId(source.emailId)}
                    className="block text-xs text-indigo-500 hover:text-indigo-600 hover:underline truncate max-w-full text-left"
                  >
                    {source.subject}
                  </button>
                ))}
              </div>
            )}

            {answer.confidence > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.round(answer.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(answer.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
