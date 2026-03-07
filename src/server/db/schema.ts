import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const emailAccounts = sqliteTable('email_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  providerType: text('provider_type').notNull(), // 'gmail' | 'outlook' | 'imap'
  credentialsEncrypted: text('credentials_encrypted').notNull(),
  aiAdapter: text('ai_adapter'), // 'openai' | 'anthropic' | 'google' | 'ollama'
  aiApiKeyEncrypted: text('ai_api_key_encrypted'),
  aiModel: text('ai_model'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('dark'),
  paneLayout: text('pane_layout').notNull().default('three-pane'),
  sidebarWidth: integer('sidebar_width').notNull().default(220),
  listWidth: integer('list_width').notNull().default(400),
  keyboardShortcutsEnabled: integer('keyboard_shortcuts_enabled', { mode: 'boolean' }).notNull().default(true),
  aiSummariesEnabled: integer('ai_summaries_enabled', { mode: 'boolean' }).notNull().default(true),
  aiPriorityEnabled: integer('ai_priority_enabled', { mode: 'boolean' }).notNull().default(true),
  aiClassificationEnabled: integer('ai_classification_enabled', { mode: 'boolean' }).notNull().default(true),
  focusedInboxEnabled: integer('focused_inbox_enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const cachedEmails = sqliteTable('cached_emails', {
  id: text('id').notNull(),                // IMAP message ID
  accountId: text('account_id').notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  subject: text('subject'),
  fromAddress: text('from_address'),
  fromName: text('from_name'),
  toJson: text('to_json'),                 // JSON: [{name, address}]
  ccJson: text('cc_json'),                 // JSON: [{name, address}]
  date: integer('date', { mode: 'timestamp' }),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  snippet: text('snippet'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  labelsJson: text('labels_json'),         // JSON: string[]
  attachmentsJson: text('attachments_json'), // JSON: [{id, filename, contentType, size}]
  threadId: text('thread_id'),
  folder: text('folder').notNull(),
  aiProcessed: integer('ai_processed', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('cached_emails_account_id_idx').on(table.accountId, table.id),
  index('cached_emails_folder_idx').on(table.accountId, table.folder),
  index('cached_emails_date_idx').on(table.accountId, table.date),
  index('cached_emails_ai_processed_idx').on(table.accountId, table.aiProcessed),
]);

export const aiEnrichments = sqliteTable('ai_enrichments', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  emailId: text('email_id').notNull(),
  priority: text('priority'),              // JSON: {score, level, reasoning}
  classification: text('classification'),  // JSON: {category, confidence, sentiment, urgency}
  summary: text('summary'),               // JSON: {summary, keyPoints}
  actionItems: text('action_items'),       // JSON: [{action, priority, deadline?}]
  topics: text('topics'),                  // JSON: string[]
  extractedData: text('extracted_data'),   // JSON: Record<string, unknown>
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('ai_enrichments_account_email_idx').on(table.accountId, table.emailId),
]);

export const workflowRules = sqliteTable('workflow_rules', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  conditionsJson: text('conditions_json').notNull(),   // JSON: WorkflowCondition[]
  conditionLogic: text('condition_logic').notNull().default('and'), // 'and' | 'or'
  actionsJson: text('actions_json').notNull(),          // JSON: WorkflowAction[]
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  priority: integer('priority').notNull().default(0),
  triggerCount: integer('trigger_count').notNull().default(0),
  lastTriggered: integer('last_triggered', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('workflow_rules_account_idx').on(table.accountId),
]);
