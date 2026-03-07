export interface SerializedEmail {
  id: string;
  subject: string;
  from: { name?: string; address: string } | null;
  to: Array<{ name?: string; address: string }>;
  cc?: Array<{ name?: string; address: string }>;
  date: string; // ISO string
  body?: {
    text?: string;
    html?: string;
  };
  snippet?: string;
  isRead: boolean;
  isStarred: boolean;
  labels?: string[];
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
  threadId?: string;
}

export interface SerializedFolder {
  id: string;
  name: string;
  type?: string;
  unreadCount?: number;
  totalCount?: number;
}

export interface SerializedLabel {
  id: string;
  name: string;
  color?: string;
}

export interface AiEnrichment {
  priority?: {
    score: number;
    level: string;
    reasoning: string;
  };
  classification?: {
    category: string;
    confidence: number;
    sentiment: string;
    urgency: string;
  };
  summary?: {
    summary: string;
    keyPoints: string[];
  };
  actionItems?: Array<{
    action: string;
    priority: string;
    deadline?: string;
  }>;
  topics?: string[];
  extractedData?: Record<string, unknown>;
  _error?: string;
  _loading?: boolean;
}

export interface AskAiResult {
  answer: string;
  sources: Array<{ emailId: string; subject: string }>;
  confidence: number;
}

export interface TopicGroup {
  topic: string;
  description: string;
  emailIds: string[];
  confidence: number;
}

export interface AiProcessingStatus {
  processed: number;
  total: number;
  isProcessing: boolean;
}

export interface EmailAccount {
  id: string;
  name: string;
  providerType: string;
  isDefault: boolean;
  hasAi: boolean;
}

// Workflow Rules
export interface WorkflowCondition {
  field: 'priority' | 'category' | 'sentiment' | 'urgency' | 'sender' | 'subject' | 'hasAttachment' | 'custom';
  operator: 'equals' | 'notEquals' | 'contains' | 'in' | 'greaterThan' | 'lessThan';
  value: string | string[] | number | boolean;
  customPrompt?: string; // For 'custom' field — AI evaluates this
}

export interface WorkflowAction {
  type: 'label' | 'move' | 'archive' | 'star' | 'markRead' | 'forward'
      | 'ai:extract' | 'ai:ask' | 'ai:assess' | 'ai:custom';
  params: Record<string, unknown>;
}

export interface WorkflowRule {
  id: string;
  accountId: string;
  name: string;
  description?: string;
  conditions: WorkflowCondition[];
  conditionLogic: 'and' | 'or';
  actions: WorkflowAction[];
  enabled: boolean;
  priority: number;
  triggerCount: number;
  lastTriggered?: string;
}

export interface WorkflowExecutionResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  actionsExecuted: Array<{ type: string; success: boolean; result?: unknown; error?: string }>;
}
