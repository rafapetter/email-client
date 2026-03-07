import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  listWidth: number;
  detailCollapsed: boolean;
  composeOpen: boolean;
  composeMode: 'new' | 'reply' | 'replyAll' | 'forward';
  composeReplyToId: string | null;
  searchOpen: boolean;
  aiPanelOpen: boolean;

  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setListWidth: (width: number) => void;
  setDetailCollapsed: (collapsed: boolean) => void;
  openCompose: (mode?: 'new' | 'reply' | 'replyAll' | 'forward', replyToId?: string) => void;
  closeCompose: () => void;
  toggleSearch: () => void;
  setSearchOpen: (open: boolean) => void;
  toggleAiPanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 220,
  listWidth: 400,
  detailCollapsed: false,
  composeOpen: false,
  composeMode: 'new',
  composeReplyToId: null,
  searchOpen: false,
  aiPanelOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setListWidth: (width) => set({ listWidth: width }),
  setDetailCollapsed: (collapsed) => set({ detailCollapsed: collapsed }),
  openCompose: (mode = 'new', replyToId) =>
    set({ composeOpen: true, composeMode: mode, composeReplyToId: replyToId ?? null }),
  closeCompose: () => set({ composeOpen: false, composeReplyToId: null }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
}));
