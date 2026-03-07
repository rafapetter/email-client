'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Workflow } from 'lucide-react';
import Link from 'next/link';
import { RuleBuilder } from '@/components/workflows/rule-builder';
import { RuleList } from '@/components/workflows/rule-list';
import {
  listWorkflowRules,
  createWorkflowRule,
  updateWorkflowRule,
  deleteWorkflowRule,
  toggleWorkflowRule,
} from '@/server/actions/workflow-rules';
import type { WorkflowRule, WorkflowCondition, WorkflowAction } from '@/types';

export default function WorkflowsPage() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    const result = await listWorkflowRules();
    if (result.success) setRules(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const handleCreate = useCallback(
    async (data: {
      name: string;
      description?: string;
      conditions: WorkflowCondition[];
      conditionLogic: 'and' | 'or';
      actions: WorkflowAction[];
      priority: number;
    }) => {
      setSaving(true);
      const result = await createWorkflowRule(data);
      if (result.success) {
        setRules((prev) => [...prev, result.data]);
        setMode('list');
      }
      setSaving(false);
    },
    [],
  );

  const handleUpdate = useCallback(
    async (data: {
      name: string;
      description?: string;
      conditions: WorkflowCondition[];
      conditionLogic: 'and' | 'or';
      actions: WorkflowAction[];
      priority: number;
    }) => {
      if (!editingRule) return;
      setSaving(true);
      const result = await updateWorkflowRule(editingRule.id, data);
      if (result.success) {
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? result.data : r)));
        setMode('list');
        setEditingRule(null);
      }
      setSaving(false);
    },
    [editingRule],
  );

  const handleDelete = useCallback(async (id: string) => {
    const result = await deleteWorkflowRule(id);
    if (result.success) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  }, []);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    const result = await toggleWorkflowRule(id, enabled);
    if (result.success) {
      setRules((prev) => prev.map((r) => (r.id === id ? result.data : r)));
    }
  }, []);

  const handleEdit = useCallback((rule: WorkflowRule) => {
    setEditingRule(rule);
    setMode('edit');
  }, []);

  return (
    <div className="flex-1 p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Workflow className="size-5 text-blue-500" />
          <h1 className="text-2xl font-bold">Workflow Rules</h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Automate actions based on AI analysis. Rules are evaluated after each email is enriched with AI features.
      </p>

      {mode === 'list' && (
        <>
          <button
            onClick={() => setMode('create')}
            className="mb-4 flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 transition-colors"
          >
            <Plus className="size-4" />
            Create Rule
          </button>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading rules...</p>
          ) : (
            <RuleList
              rules={rules}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          )}
        </>
      )}

      {mode === 'create' && (
        <RuleBuilder
          onSave={handleCreate}
          onCancel={() => setMode('list')}
          saving={saving}
        />
      )}

      {mode === 'edit' && editingRule && (
        <RuleBuilder
          initialData={{
            name: editingRule.name,
            description: editingRule.description,
            conditions: editingRule.conditions,
            conditionLogic: editingRule.conditionLogic,
            actions: editingRule.actions,
            priority: editingRule.priority,
          }}
          onSave={handleUpdate}
          onCancel={() => { setMode('list'); setEditingRule(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
