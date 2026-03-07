'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkles, Wand2, ChevronDown, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { improveWriting, changeTone, aiCompose } from '@/server/actions/emails';

const TONE_OPTIONS = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
] as const;

type ToneValue = (typeof TONE_OPTIONS)[number]['value'];

interface AiComposeBarProps {
  body: string;
  onBodyChange: (content: string) => void;
}

export function AiComposeBar({ body, onBodyChange }: AiComposeBarProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const handleAiCompose = useCallback(async () => {
    if (!aiPrompt.trim()) return;

    setIsLoading(true);
    try {
      const result = await aiCompose(aiPrompt);
      onBodyChange(result);
      setShowAiInput(false);
      setAiPrompt('');
      toast.success('AI draft generated.');
    } catch {
      toast.error('AI compose is not available yet.');
    } finally {
      setIsLoading(false);
    }
  }, [aiPrompt, onBodyChange]);

  const handleImproveWriting = useCallback(async () => {
    if (!body.trim()) {
      toast.error('Write something first to improve.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await improveWriting(body);
      onBodyChange(result);
      toast.success('Writing improved.');
    } catch {
      toast.error('Improve writing is not available yet.');
    } finally {
      setIsLoading(false);
    }
  }, [body, onBodyChange]);

  const handleChangeTone = useCallback(
    async (tone: ToneValue) => {
      if (!body.trim()) {
        toast.error('Write something first to change the tone.');
        return;
      }

      setIsLoading(true);
      try {
        const result = await changeTone(body, tone);
        onBodyChange(result);
        toast.success(`Tone changed to ${tone}.`);
      } catch {
        toast.error('Change tone is not available yet.');
      } finally {
        setIsLoading(false);
      }
    },
    [body, onBodyChange]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* AI Compose Input */}
      {showAiInput && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <Input
            placeholder="Describe what you want to write..."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAiCompose();
              }
            }}
            className="border-0 shadow-none focus-visible:ring-0 px-0 h-7 bg-transparent text-sm"
            disabled={isLoading}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setShowAiInput(false);
              setAiPrompt('');
            }}
            disabled={isLoading}
          >
            <X className="size-3" />
          </Button>
          <Button
            size="xs"
            onClick={handleAiCompose}
            disabled={isLoading || !aiPrompt.trim()}
          >
            {isLoading ? <Loader2 className="size-3 animate-spin" /> : 'Generate'}
          </Button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5">
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>AI is processing...</span>
          </div>
        )}

        {!isLoading && (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowAiInput((v) => !v)}
              className="text-muted-foreground"
            >
              <Sparkles className="size-3" />
              AI Compose
            </Button>

            <Button
              variant="ghost"
              size="xs"
              onClick={handleImproveWriting}
              className="text-muted-foreground"
              disabled={!body.trim()}
            >
              <Wand2 className="size-3" />
              Improve Writing
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  disabled={!body.trim()}
                >
                  Change Tone
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {TONE_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => handleChangeTone(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  );
}
