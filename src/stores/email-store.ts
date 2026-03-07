import { create } from 'zustand';
import type { SerializedEmail, AiEnrichment, AiProcessingStatus, WorkflowExecutionResult } from '@/types';

interface EmailState {
  // Selected state
  selectedEmailId: string | null;
  selectedAccountId: string | null;

  // Email data cache
  emails: SerializedEmail[];
  totalCount: number;
  currentFolder: string;

  // Folder unread counts
  folderCounts: Record<string, number>;

  // Map from normalized folder key (INBOX, SENT, etc.) to IMAP path
  folderPathMap: Record<string, string>;

  // AI enrichments cache (keyed by emailId)
  enrichments: Record<string, AiEnrichment>;

  // AI processing status
  aiProcessingStatus: AiProcessingStatus;

  // Workflow execution results (keyed by emailId)
  workflowResults: Record<string, WorkflowExecutionResult[]>;

  // Sidebar category filter
  activeCategoryFilter: string | null;

  // Actions
  setSelectedEmailId: (id: string | null) => void;
  setSelectedAccountId: (id: string | null) => void;
  setEmails: (emails: SerializedEmail[], totalCount: number) => void;
  setCurrentFolder: (folder: string) => void;
  prependEmail: (email: SerializedEmail) => void;
  updateEmail: (id: string, updates: Partial<SerializedEmail>) => void;
  removeEmail: (id: string) => void;
  setFolderCounts: (counts: Record<string, number>) => void;
  updateFolderCount: (folder: string, unread: number) => void;
  setFolderPathMap: (map: Record<string, string>) => void;
  setEnrichment: (emailId: string, enrichment: AiEnrichment) => void;
  hydrateEnrichments: (enrichments: Record<string, AiEnrichment>) => void;
  setAiProcessingStatus: (status: AiProcessingStatus) => void;
  setWorkflowResults: (emailId: string, results: WorkflowExecutionResult[]) => void;
  setActiveCategoryFilter: (category: string | null) => void;
  reset: () => void;
}

export const useEmailStore = create<EmailState>((set) => ({
  selectedEmailId: null,
  selectedAccountId: null,
  emails: [],
  totalCount: 0,
  currentFolder: 'INBOX',
  folderCounts: {},
  folderPathMap: {},
  enrichments: {},
  aiProcessingStatus: { processed: 0, total: 0, isProcessing: false },
  workflowResults: {},
  activeCategoryFilter: null,

  setSelectedEmailId: (id) => set({ selectedEmailId: id }),
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  setEmails: (emails, totalCount) => set({ emails, totalCount }),
  setCurrentFolder: (folder) => set({ currentFolder: folder }),
  prependEmail: (email) =>
    set((state) => ({
      emails: [email, ...state.emails],
      totalCount: state.totalCount + 1,
    })),
  updateEmail: (id, updates) =>
    set((state) => ({
      emails: state.emails.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  removeEmail: (id) =>
    set((state) => ({
      emails: state.emails.filter((e) => e.id !== id),
      totalCount: state.totalCount - 1,
      selectedEmailId: state.selectedEmailId === id ? null : state.selectedEmailId,
    })),
  setFolderCounts: (counts) => set((state) => ({ folderCounts: { ...state.folderCounts, ...counts } })),
  updateFolderCount: (folder, unread) =>
    set((state) => ({
      folderCounts: { ...state.folderCounts, [folder]: unread },
    })),
  setFolderPathMap: (map) => set({ folderPathMap: map }),
  setEnrichment: (emailId, enrichment) =>
    set((state) => ({
      enrichments: {
        ...state.enrichments,
        [emailId]: { ...state.enrichments[emailId], ...enrichment },
      },
    })),
  hydrateEnrichments: (newEnrichments) =>
    set((state) => {
      // Merge: cached data fills in gaps, doesn't overwrite fresher in-memory data
      const merged = { ...state.enrichments };
      for (const [id, enrichment] of Object.entries(newEnrichments)) {
        merged[id] = { ...enrichment, ...merged[id] };
      }
      return { enrichments: merged };
    }),
  setAiProcessingStatus: (status) => set({ aiProcessingStatus: status }),
  setWorkflowResults: (emailId, results) =>
    set((state) => ({
      workflowResults: { ...state.workflowResults, [emailId]: results },
    })),
  setActiveCategoryFilter: (category) => set({ activeCategoryFilter: category }),
  reset: () =>
    set({
      selectedEmailId: null,
      emails: [],
      totalCount: 0,
      folderCounts: {},
      enrichments: {},
    }),
}));
