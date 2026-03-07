'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getAiPreferences, updateAiPreferences } from '@/server/actions/accounts';

interface AiPreference {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  dbField: 'aiSummariesEnabled' | 'aiPriorityEnabled' | 'aiClassificationEnabled' | 'focusedInboxEnabled';
}

const PREFERENCE_DEFS: Omit<AiPreference, 'enabled'>[] = [
  {
    id: 'ai-summaries',
    label: 'AI Summaries',
    description: 'Automatically generate summaries for incoming emails using AI.',
    dbField: 'aiSummariesEnabled',
  },
  {
    id: 'ai-priority',
    label: 'AI Priority Scoring',
    description: 'Assign priority scores to emails based on content, sender, and urgency.',
    dbField: 'aiPriorityEnabled',
  },
  {
    id: 'ai-classification',
    label: 'AI Classification',
    description: 'Automatically categorize emails into work, personal, finance, and other categories.',
    dbField: 'aiClassificationEnabled',
  },
  {
    id: 'focused-inbox',
    label: 'Focused Inbox',
    description:
      'Use AI to separate important emails from newsletters, notifications, and low-priority messages.',
    dbField: 'focusedInboxEnabled',
  },
];

export default function SettingsAiPage() {
  const [preferences, setPreferences] = useState<AiPreference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getAiPreferences();
      if (result.success) {
        setPreferences(
          PREFERENCE_DEFS.map((def) => ({
            ...def,
            enabled: result.data[def.dbField],
          })),
        );
      } else {
        toast.error('Failed to load AI preferences', { description: result.error });
        // Fall back to defaults so the page is still usable
        setPreferences(
          PREFERENCE_DEFS.map((def) => ({
            ...def,
            enabled: def.dbField === 'focusedInboxEnabled' ? false : true,
          })),
        );
      }
      setLoading(false);
    }
    void load();
  }, []);

  async function togglePreference(id: string) {
    const pref = preferences.find((p) => p.id === id);
    if (!pref) return;

    const newValue = !pref.enabled;

    // Optimistic update
    setPreferences((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: newValue } : p)),
    );

    const result = await updateAiPreferences({ [pref.dbField]: newValue });
    if (result.success) {
      toast.success(`${pref.label} ${newValue ? 'enabled' : 'disabled'}`);
    } else {
      // Revert on failure
      setPreferences((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !newValue } : p)),
      );
      toast.error('Failed to save preference', { description: result.error });
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">AI Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure how AI processes and enriches your emails.
          </p>
        </div>
        <div className="mt-8 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="space-y-2 pr-4 flex-1">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
              </div>
              <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">AI Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure how AI processes and enriches your emails.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        {preferences.map((pref) => (
          <div
            key={pref.id}
            className="flex items-center justify-between rounded-lg border border-border p-4"
          >
            <div className="space-y-0.5 pr-4">
              <label htmlFor={pref.id} className="text-sm font-medium cursor-pointer">
                {pref.label}
              </label>
              <p className="text-xs text-muted-foreground">{pref.description}</p>
            </div>
            <button
              id={pref.id}
              role="switch"
              aria-checked={pref.enabled}
              onClick={() => void togglePreference(pref.id)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                pref.enabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                  pref.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          AI features require an AI adapter to be configured on your email account. You can set this
          up in{' '}
          <a href="/settings/accounts" className="text-primary underline underline-offset-2">
            Account Settings
          </a>
          .
        </p>
      </div>
    </div>
  );
}
