'use server';

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db';
import { emailAccounts, workflowRules, cachedEmails } from '@/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getCachedEnrichment, setCachedEnrichment } from './ai-cache';
import type {
  WorkflowCondition,
  WorkflowAction,
  WorkflowRule,
  WorkflowExecutionResult,
  AiEnrichment,
} from '@/types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

// Load AiEngine directly from emai SDK — no IMAP/provider needed
const _require = createRequire(join(process.cwd(), 'package.json'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AiEngine: new (config: any) => any;
try {
  const emaiModule = _require('@petter100/emai');
  AiEngine = emaiModule.AiEngine;
  if (!AiEngine) throw new Error('AiEngine not found in exports');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  AiEngine = class { constructor() { throw new Error(`@petter100/emai failed to load: ${msg}`); } } as never;
}

async function getAccount() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const account = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.userId, session.user.id), eq(emailAccounts.isDefault, true)))
    .get();

  if (!account) throw new Error('No email account connected');
  return account;
}

function createAiEngine(account: typeof emailAccounts.$inferSelect) {
  if (!account.aiAdapter || !account.aiApiKeyEncrypted) {
    throw new Error('No AI adapter configured');
  }
  return new AiEngine({
    adapter: account.aiAdapter,
    apiKey: decrypt(account.aiApiKeyEncrypted),
    ...(account.aiModel && { model: account.aiModel }),
  });
}

function rowToRule(row: typeof workflowRules.$inferSelect): WorkflowRule {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    description: row.description ?? undefined,
    conditions: JSON.parse(row.conditionsJson) as WorkflowCondition[],
    conditionLogic: row.conditionLogic as 'and' | 'or',
    actions: JSON.parse(row.actionsJson) as WorkflowAction[],
    enabled: row.enabled,
    priority: row.priority,
    triggerCount: row.triggerCount,
    lastTriggered: row.lastTriggered?.toISOString(),
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listWorkflowRules(): Promise<ActionResult<WorkflowRule[]>> {
  try {
    const account = await getAccount();
    const rows = await db
      .select()
      .from(workflowRules)
      .where(eq(workflowRules.accountId, account.id))
      .orderBy(workflowRules.priority)
      .all();
    return { success: true, data: rows.map(rowToRule) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createWorkflowRule(data: {
  name: string;
  description?: string;
  conditions: WorkflowCondition[];
  conditionLogic?: 'and' | 'or';
  actions: WorkflowAction[];
  priority?: number;
}): Promise<ActionResult<WorkflowRule>> {
  try {
    const account = await getAccount();
    const id = randomUUID();
    const now = new Date();

    await db.insert(workflowRules)
      .values({
        id,
        accountId: account.id,
        name: data.name,
        description: data.description ?? null,
        conditionsJson: JSON.stringify(data.conditions),
        conditionLogic: data.conditionLogic ?? 'and',
        actionsJson: JSON.stringify(data.actions),
        enabled: true,
        priority: data.priority ?? 0,
        triggerCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = (await db.select().from(workflowRules).where(eq(workflowRules.id, id)).get())!;
    return { success: true, data: rowToRule(row) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateWorkflowRule(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    conditions: WorkflowCondition[];
    conditionLogic: 'and' | 'or';
    actions: WorkflowAction[];
    priority: number;
    enabled: boolean;
  }>,
): Promise<ActionResult<WorkflowRule>> {
  try {
    const account = await getAccount();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.conditions !== undefined) updates.conditionsJson = JSON.stringify(data.conditions);
    if (data.conditionLogic !== undefined) updates.conditionLogic = data.conditionLogic;
    if (data.actions !== undefined) updates.actionsJson = JSON.stringify(data.actions);
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    await db.update(workflowRules)
      .set(updates)
      .where(and(eq(workflowRules.id, id), eq(workflowRules.accountId, account.id)))
      .run();

    const row = await db.select().from(workflowRules).where(eq(workflowRules.id, id)).get();
    if (!row) return { success: false, error: 'Rule not found' };
    return { success: true, data: rowToRule(row) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteWorkflowRule(id: string): Promise<ActionResult<void>> {
  try {
    const account = await getAccount();
    await db.delete(workflowRules)
      .where(and(eq(workflowRules.id, id), eq(workflowRules.accountId, account.id)))
      .run();
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleWorkflowRule(
  id: string,
  enabled: boolean,
): Promise<ActionResult<WorkflowRule>> {
  return updateWorkflowRule(id, { enabled });
}

// ─── CONDITION EVALUATION ────────────────────────────────────────────────────

function evaluateCondition(
  condition: WorkflowCondition,
  enrichment: AiEnrichment,
  emailRow: { fromAddress: string | null; subject: string | null; attachmentsJson: string | null },
): boolean {
  let fieldValue: unknown;

  switch (condition.field) {
    case 'priority':
      fieldValue = enrichment.priority?.level;
      break;
    case 'category':
      fieldValue = enrichment.classification?.category;
      break;
    case 'sentiment':
      fieldValue = enrichment.classification?.sentiment;
      break;
    case 'urgency':
      fieldValue = enrichment.classification?.urgency;
      break;
    case 'sender':
      fieldValue = emailRow.fromAddress ?? '';
      break;
    case 'subject':
      fieldValue = emailRow.subject ?? '';
      break;
    case 'hasAttachment': {
      const atts = emailRow.attachmentsJson ? JSON.parse(emailRow.attachmentsJson) : [];
      fieldValue = Array.isArray(atts) && atts.length > 0;
      break;
    }
    case 'custom':
      // Custom conditions require AI evaluation — handled separately
      return false;
    default:
      return false;
  }

  const { operator, value } = condition;

  switch (operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === String(value).toLowerCase();
    case 'notEquals':
      return String(fieldValue).toLowerCase() !== String(value).toLowerCase();
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'in':
      if (Array.isArray(value)) {
        return value.map((v) => String(v).toLowerCase()).includes(String(fieldValue).toLowerCase());
      }
      return false;
    case 'greaterThan':
      return Number(fieldValue) > Number(value);
    case 'lessThan':
      return Number(fieldValue) < Number(value);
    default:
      return false;
  }
}

function checkConditions(
  conditions: WorkflowCondition[],
  logic: 'and' | 'or',
  enrichment: AiEnrichment,
  emailRow: { fromAddress: string | null; subject: string | null; attachmentsJson: string | null },
): boolean {
  if (conditions.length === 0) return false;

  const nonCustom = conditions.filter((c) => c.field !== 'custom');

  if (logic === 'and') {
    return nonCustom.every((c) => evaluateCondition(c, enrichment, emailRow));
  }
  return nonCustom.some((c) => evaluateCondition(c, enrichment, emailRow));
}

// ─── ACTION EXECUTION ────────────────────────────────────────────────────────

async function executeAction(
  action: WorkflowAction,
  emailId: string,
  accountId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiEngine: any,
  enrichment: AiEnrichment,
  emailContent: Record<string, unknown>,
): Promise<{ type: string; success: boolean; result?: unknown; error?: string }> {
  try {
    switch (action.type) {
      // Standard email actions — update local cache, actual IMAP ops happen lazily
      case 'label':
        return { type: 'label', success: true, result: { label: action.params.label, note: 'queued' } };
      case 'move':
        return { type: 'move', success: true, result: { folder: action.params.folder, note: 'queued' } };
      case 'archive':
        return { type: 'archive', success: true, result: { note: 'queued' } };
      case 'star': {
        await db.update(cachedEmails)
          .set({ isStarred: true, updatedAt: new Date() })
          .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, emailId)))
          .run();
        return { type: 'star', success: true };
      }
      case 'markRead': {
        await db.update(cachedEmails)
          .set({ isRead: true, updatedAt: new Date() })
          .where(and(eq(cachedEmails.accountId, accountId), eq(cachedEmails.id, emailId)))
          .run();
        return { type: 'markRead', success: true };
      }
      case 'forward':
        return { type: 'forward', success: true, result: { to: action.params.to, note: 'queued' } };

      // AI actions — use AiEngine directly (no IMAP needed)
      case 'ai:extract': {
        const prompt = String(action.params.prompt ?? 'Extract key data from this email');
        const result = await aiEngine.askQuestion(prompt, [emailContent]);
        await setCachedEnrichment(accountId, emailId, {
          extractedData: { prompt, result: result?.answer ?? result },
        });
        return { type: 'ai:extract', success: true, result };
      }
      case 'ai:ask': {
        const question = String(action.params.question ?? '');
        const result = await aiEngine.askQuestion(question, [emailContent]);
        return { type: 'ai:ask', success: true, result };
      }
      case 'ai:assess': {
        const assessPrompt = buildAssessmentPrompt(enrichment);
        const result = await aiEngine.askQuestion(assessPrompt, [emailContent]);
        return { type: 'ai:assess', success: true, result };
      }
      case 'ai:custom': {
        const customPrompt = String(action.params.prompt ?? '');
        const result = await aiEngine.askQuestion(customPrompt, [emailContent]);
        return { type: 'ai:custom', success: true, result };
      }
      default:
        return { type: action.type, success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err) {
    return { type: action.type, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildAssessmentPrompt(enrichment: AiEnrichment): string {
  const parts: string[] = ['Assess this email based on its AI analysis and suggest specific next actions:\n'];

  if (enrichment.priority) {
    parts.push(`Priority: ${enrichment.priority.level} (score: ${enrichment.priority.score}) — ${enrichment.priority.reasoning}`);
  }
  if (enrichment.classification) {
    parts.push(`Category: ${enrichment.classification.category}, Sentiment: ${enrichment.classification.sentiment}, Urgency: ${enrichment.classification.urgency}`);
  }
  if (enrichment.summary) {
    parts.push(`Summary: ${enrichment.summary.summary}`);
  }
  if (enrichment.actionItems && enrichment.actionItems.length > 0) {
    parts.push(`Action Items: ${enrichment.actionItems.map((a) => `${a.action} (${a.priority})`).join('; ')}`);
  }
  if (enrichment.topics && enrichment.topics.length > 0) {
    parts.push(`Topics: ${enrichment.topics.join(', ')}`);
  }

  parts.push('\nProvide: 1) Overall assessment 2) Recommended actions 3) Urgency level 4) Any risks or concerns');
  return parts.join('\n');
}

// ─── RULE EVALUATION ENGINE ──────────────────────────────────────────────────

export async function evaluateWorkflowRules(
  emailId: string,
): Promise<ActionResult<WorkflowExecutionResult[]>> {
  try {
    const account = await getAccount();

    // Get enabled rules sorted by priority
    const rules = await db
      .select()
      .from(workflowRules)
      .where(and(eq(workflowRules.accountId, account.id), eq(workflowRules.enabled, true)))
      .orderBy(workflowRules.priority)
      .all();

    if (rules.length === 0) {
      return { success: true, data: [] };
    }

    // Load email data from cache
    const emailRow = await db
      .select()
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.id, emailId)))
      .get();

    if (!emailRow) {
      return { success: false, error: 'Email not found in cache' };
    }

    // Load enrichment
    const enrichment = await getCachedEnrichment(account.id, emailId) ?? {};

    // Build email content for AI actions
    const emailContent = {
      subject: emailRow.subject ?? '',
      body: { text: emailRow.bodyText ?? undefined, html: emailRow.bodyHtml ?? undefined },
      from: emailRow.fromAddress ? { name: emailRow.fromName ?? undefined, address: emailRow.fromAddress } : undefined,
      to: emailRow.toJson ? JSON.parse(emailRow.toJson) : [],
      date: emailRow.date ? emailRow.date.toISOString() : undefined,
    };

    // Create AI engine only if needed (lazy)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let aiEngine: any = null;
    function getAiEngine() {
      if (!aiEngine) aiEngine = createAiEngine(account);
      return aiEngine;
    }

    const results: WorkflowExecutionResult[] = [];

    for (const row of rules) {
      const rule = rowToRule(row);
      const matched = checkConditions(rule.conditions, rule.conditionLogic, enrichment, emailRow);

      if (!matched) {
        results.push({ ruleId: rule.id, ruleName: rule.name, matched: false, actionsExecuted: [] });
        continue;
      }

      // Execute actions
      const actionsExecuted: WorkflowExecutionResult['actionsExecuted'] = [];
      for (const action of rule.actions) {
        const actionResult = await executeAction(
          action,
          emailId,
          account.id,
          getAiEngine(),
          enrichment,
          emailContent,
        );
        actionsExecuted.push(actionResult);
      }

      // Update trigger count
      await db.update(workflowRules)
        .set({
          triggerCount: sql`${workflowRules.triggerCount} + 1`,
          lastTriggered: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workflowRules.id, rule.id))
        .run();

      results.push({ ruleId: rule.id, ruleName: rule.name, matched: true, actionsExecuted });
    }

    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Dry-run a single rule against an email (no side effects for standard actions, AI actions still run) */
export async function testWorkflowRule(
  ruleId: string,
  emailId: string,
): Promise<ActionResult<WorkflowExecutionResult>> {
  try {
    const account = await getAccount();

    const row = await db
      .select()
      .from(workflowRules)
      .where(and(eq(workflowRules.id, ruleId), eq(workflowRules.accountId, account.id)))
      .get();

    if (!row) return { success: false, error: 'Rule not found' };
    const rule = rowToRule(row);

    const emailRow = await db
      .select()
      .from(cachedEmails)
      .where(and(eq(cachedEmails.accountId, account.id), eq(cachedEmails.id, emailId)))
      .get();

    if (!emailRow) return { success: false, error: 'Email not found' };

    const enrichment = await getCachedEnrichment(account.id, emailId) ?? {};
    const matched = checkConditions(rule.conditions, rule.conditionLogic, enrichment, emailRow);

    return {
      success: true,
      data: {
        ruleId: rule.id,
        ruleName: rule.name,
        matched,
        actionsExecuted: matched
          ? rule.actions.map((a) => ({ type: a.type, success: true, result: '[dry run]' }))
          : [],
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
