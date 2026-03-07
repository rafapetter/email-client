'use client';

import { useCallback, useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowCondition, WorkflowAction } from '@/types';

const CONDITION_FIELDS: Array<{ value: WorkflowCondition['field']; label: string }> = [
  { value: 'priority', label: 'Priority Level' },
  { value: 'category', label: 'Category' },
  { value: 'sentiment', label: 'Sentiment' },
  { value: 'urgency', label: 'Urgency' },
  { value: 'sender', label: 'Sender' },
  { value: 'subject', label: 'Subject' },
  { value: 'hasAttachment', label: 'Has Attachment' },
  { value: 'custom', label: 'Custom AI Prompt' },
];

const OPERATORS: Array<{ value: WorkflowCondition['operator']; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'is one of' },
  { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' },
];

const FIELD_PRESETS: Record<string, string[]> = {
  priority: ['high', 'medium', 'low'],
  category: ['work', 'personal', 'promotions', 'social', 'updates', 'finance', 'travel'],
  sentiment: ['positive', 'negative', 'neutral', 'mixed'],
  urgency: ['urgent', 'not urgent', 'normal'],
};

const ACTION_TYPES: Array<{ value: WorkflowAction['type']; label: string; group: string }> = [
  { value: 'label', label: 'Add Label', group: 'Standard' },
  { value: 'move', label: 'Move to Folder', group: 'Standard' },
  { value: 'archive', label: 'Archive', group: 'Standard' },
  { value: 'star', label: 'Star', group: 'Standard' },
  { value: 'markRead', label: 'Mark as Read', group: 'Standard' },
  { value: 'forward', label: 'Forward', group: 'Standard' },
  { value: 'ai:extract', label: 'AI: Extract Data', group: 'AI' },
  { value: 'ai:ask', label: 'AI: Ask Question', group: 'AI' },
  { value: 'ai:assess', label: 'AI: Assess & Suggest Actions', group: 'AI' },
  { value: 'ai:custom', label: 'AI: Custom Prompt', group: 'AI' },
];

interface RuleBuilderProps {
  initialData?: {
    name: string;
    description?: string;
    conditions: WorkflowCondition[];
    conditionLogic: 'and' | 'or';
    actions: WorkflowAction[];
    priority: number;
  };
  onSave: (data: {
    name: string;
    description?: string;
    conditions: WorkflowCondition[];
    conditionLogic: 'and' | 'or';
    actions: WorkflowAction[];
    priority: number;
  }) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function RuleBuilder({ initialData, onSave, onCancel, saving }: RuleBuilderProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [conditions, setConditions] = useState<WorkflowCondition[]>(
    initialData?.conditions ?? [{ field: 'priority', operator: 'equals', value: 'high' }],
  );
  const [conditionLogic, setConditionLogic] = useState<'and' | 'or'>(
    initialData?.conditionLogic ?? 'and',
  );
  const [actions, setActions] = useState<WorkflowAction[]>(
    initialData?.actions ?? [{ type: 'ai:assess', params: {} }],
  );
  const [priority, setPriority] = useState(initialData?.priority ?? 0);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { field: 'category', operator: 'equals', value: '' }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCondition = useCallback((index: number, updates: Partial<WorkflowCondition>) => {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...updates } : c)),
    );
  }, []);

  const addAction = useCallback(() => {
    setActions((prev) => [...prev, { type: 'label', params: {} }]);
  }, []);

  const removeAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateAction = useCallback((index: number, updates: Partial<WorkflowAction>) => {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...updates } : a)),
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      conditions,
      conditionLogic,
      actions,
      priority,
    });
  }, [name, description, conditions, conditionLogic, actions, priority, onSave]);

  return (
    <div className="space-y-6">
      {/* Name & Description */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Rule Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., High priority negative emails"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this rule do?"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* Conditions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Conditions
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Match</span>
            <button
              onClick={() => setConditionLogic(conditionLogic === 'and' ? 'or' : 'and')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                conditionLogic === 'and'
                  ? 'bg-blue-500/15 text-blue-500'
                  : 'bg-orange-500/15 text-orange-500',
              )}
            >
              {conditionLogic === 'and' ? 'ALL' : 'ANY'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <ConditionRow
              key={index}
              condition={condition}
              onChange={(updates) => updateCondition(index, updates)}
              onRemove={() => removeCondition(index)}
              canRemove={conditions.length > 1}
              logicLabel={index > 0 ? conditionLogic.toUpperCase() : undefined}
            />
          ))}
        </div>

        <button
          onClick={addCondition}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-500/10 transition-colors"
        >
          <Plus className="size-3" />
          Add condition
        </button>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Actions
        </label>

        <div className="space-y-2">
          {actions.map((action, index) => (
            <ActionRow
              key={index}
              action={action}
              onChange={(updates) => updateAction(index, updates)}
              onRemove={() => removeAction(index)}
              canRemove={actions.length > 1}
            />
          ))}
        </div>

        <button
          onClick={addAction}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-500/10 transition-colors"
        >
          <Plus className="size-3" />
          Add action
        </button>
      </div>

      {/* Priority */}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Priority (lower runs first)
        </label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="mt-1 w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Rule'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Condition Row ───────────────────────────────────────────────────────────

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
  logicLabel,
}: {
  condition: WorkflowCondition;
  onChange: (updates: Partial<WorkflowCondition>) => void;
  onRemove: () => void;
  canRemove: boolean;
  logicLabel?: string;
}) {
  const presets = FIELD_PRESETS[condition.field];
  const isCustom = condition.field === 'custom';
  const isBool = condition.field === 'hasAttachment';

  return (
    <div className="space-y-1">
      {logicLabel && (
        <span className="ml-2 text-[10px] font-semibold text-muted-foreground/60 uppercase">
          {logicLabel}
        </span>
      )}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
        <GripVertical className="size-3.5 text-muted-foreground/40 flex-shrink-0" />

        {/* Field */}
        <select
          value={condition.field}
          onChange={(e) => {
            const field = e.target.value as WorkflowCondition['field'];
            const defaults: Partial<WorkflowCondition> = { field };
            if (field === 'hasAttachment') {
              defaults.operator = 'equals';
              defaults.value = true;
            } else if (field === 'custom') {
              defaults.operator = 'equals';
              defaults.value = '';
              defaults.customPrompt = '';
            } else {
              defaults.operator = 'equals';
              defaults.value = '';
            }
            onChange(defaults);
          }}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {CONDITION_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {!isCustom && !isBool && (
          <>
            {/* Operator */}
            <select
              value={condition.operator}
              onChange={(e) => onChange({ operator: e.target.value as WorkflowCondition['operator'] })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {/* Value */}
            {presets ? (
              <select
                value={String(condition.value)}
                onChange={(e) => onChange({ value: e.target.value })}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">Select...</option>
                {presets.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={String(condition.value)}
                onChange={(e) => onChange({ value: e.target.value })}
                placeholder="Value..."
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            )}
          </>
        )}

        {isCustom && (
          <input
            type="text"
            value={condition.customPrompt ?? ''}
            onChange={(e) => onChange({ customPrompt: e.target.value })}
            placeholder="AI prompt to evaluate (e.g., 'Is this email about a contract?')"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}

        {isBool && (
          <span className="text-xs text-muted-foreground">= true</span>
        )}

        {canRemove && (
          <button
            onClick={onRemove}
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Action Row ──────────────────────────────────────────────────────────────

function ActionRow({
  action,
  onChange,
  onRemove,
  canRemove,
}: {
  action: WorkflowAction;
  onChange: (updates: Partial<WorkflowAction>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const needsPrompt = action.type === 'ai:extract' || action.type === 'ai:custom';
  const needsQuestion = action.type === 'ai:ask';
  const needsLabel = action.type === 'label';
  const needsFolder = action.type === 'move';
  const needsTo = action.type === 'forward';
  const noParams = action.type === 'archive' || action.type === 'star' || action.type === 'markRead' || action.type === 'ai:assess';

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-2">
      <GripVertical className="mt-1 size-3.5 text-muted-foreground/40 flex-shrink-0" />

      <div className="flex-1 space-y-2">
        <select
          value={action.type}
          onChange={(e) => onChange({ type: e.target.value as WorkflowAction['type'], params: {} })}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <optgroup label="Standard Actions">
            {ACTION_TYPES.filter((t) => t.group === 'Standard').map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </optgroup>
          <optgroup label="AI Actions">
            {ACTION_TYPES.filter((t) => t.group === 'AI').map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </optgroup>
        </select>

        {needsLabel && (
          <input
            type="text"
            value={String(action.params.label ?? '')}
            onChange={(e) => onChange({ params: { ...action.params, label: e.target.value } })}
            placeholder="Label name..."
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}

        {needsFolder && (
          <input
            type="text"
            value={String(action.params.folder ?? '')}
            onChange={(e) => onChange({ params: { ...action.params, folder: e.target.value } })}
            placeholder="Folder name..."
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}

        {needsTo && (
          <input
            type="email"
            value={String(action.params.to ?? '')}
            onChange={(e) => onChange({ params: { ...action.params, to: e.target.value } })}
            placeholder="Forward to email..."
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}

        {needsPrompt && (
          <textarea
            value={String(action.params.prompt ?? '')}
            onChange={(e) => onChange({ params: { ...action.params, prompt: e.target.value } })}
            placeholder="AI prompt..."
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none resize-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}

        {needsQuestion && (
          <input
            type="text"
            value={String(action.params.question ?? '')}
            onChange={(e) => onChange({ params: { ...action.params, question: e.target.value } })}
            placeholder="Question to ask AI..."
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}

        {noParams && action.type === 'ai:assess' && (
          <p className="text-[11px] text-muted-foreground">
            AI will analyze all enrichment data and suggest next actions
          </p>
        )}
      </div>

      {canRemove && (
        <button
          onClick={onRemove}
          className="mt-1 flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}
