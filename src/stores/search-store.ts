import { create } from 'zustand';

interface SearchResult {
  emailId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  score: number;
}

interface SearchState {
  query: string;
  searchType: 'hybrid' | 'semantic' | 'fulltext';
  results: SearchResult[];
  isSearching: boolean;

  setQuery: (query: string) => void;
  setSearchType: (type: 'hybrid' | 'semantic' | 'fulltext') => void;
  setResults: (results: SearchResult[]) => void;
  setIsSearching: (searching: boolean) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  searchType: 'hybrid',
  results: [],
  isSearching: false,

  setQuery: (query) => set({ query }),
  setSearchType: (searchType) => set({ searchType }),
  setResults: (results) => set({ results, isSearching: false }),
  setIsSearching: (isSearching) => set({ isSearching }),
  reset: () => set({ query: '', results: [], isSearching: false }),
}));
