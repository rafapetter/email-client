'use client';

import { Pencil, Trash2, Zap, ZapOff, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowRule } from '@/types';

interface RuleListProps {
  rules: WorkflowRule[];
  onEdit: (rule: WorkflowRule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

const ACTION_LABELS: Record<string, string> = {
  label: 'Add Label',
  move: 'Move',
  archive: 'Archive',
  star: 'Star',
  markRead: 'Mark Read',
  forward: 'Forward',
  'ai:extract': 'AI Extract',
  'ai:ask': 'AI Ask',
  'ai:assess': 'AI Assess',
  'ai:custom': 'AI Custom',
};

export function RuleList({ rules, onEdit, onDelete, onToggle }: RuleListProps) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <Zap className="mx-auto size-8 text-muted-foreground/30" />
        <p className="mt-2 text-sm text-muted-foreground">No workflow rules yet</p>
        <p className="text-xs text-muted-foreground/60">Create your first rule to automate email actions</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className={cn(
            'group rounded-lg border border-border p-4 transition-colors hover:bg-accent/30',
            !rule.enabled && 'opacity-50',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">{rule.name}</h3>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    rule.enabled
                      ? 'bg-green-500/15 text-green-500'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {rule.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>

              {rule.description && (
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{rule.description}</p>
              )}

              {/* Conditions summary */}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {rule.conditions.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-[10px] font-medium text-muted-foreground/60 uppercase">
                        {rule.conditionLogic}
                      </span>
                    )}
                    <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[11px] text-blue-500 font-medium">
                      {c.field === 'custom'
                        ? `AI: "${(c.customPrompt ?? '').slice(0, 30)}..."`
                        : `${c.field} ${c.operator} ${String(c.value)}`}
                    </span>
                  </span>
                ))}

                <ChevronRight className="size-3 text-muted-foreground/40" />

                {rule.actions.map((a, i) => (
                  <span
                    key={i}
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                      a.type.startsWith('ai:')
                        ? 'bg-purple-500/10 text-purple-500'
                        : 'bg-green-500/10 text-green-500',
                    )}
                  >
                    {ACTION_LABELS[a.type] ?? a.type}
                  </span>
                ))}
              </div>

              {rule.triggerCount > 0 && (
                <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                  Triggered {rule.triggerCount} time{rule.triggerCount !== 1 ? 's' : ''}
                  {rule.lastTriggered && ` · Last: ${new Date(rule.lastTriggered).toLocaleDateString()}`}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onToggle(rule.id, !rule.enabled)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
                title={rule.enabled ? 'Disable' : 'Enable'}
              >
                {rule.enabled ? <ZapOff className="size-3.5" /> : <Zap className="size-3.5" />}
              </button>
              <button
                onClick={() => onEdit(rule)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
                title="Edit"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => onDelete(rule.id)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="Delete"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
