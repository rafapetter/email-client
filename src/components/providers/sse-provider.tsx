'use client';

import { useSSE } from '@/hooks/use-sse';
import { useEmailStore } from '@/stores/email-store';

interface SSEProviderProps {
  children: React.ReactNode;
}

export function SSEProvider({ children }: SSEProviderProps) {
  const { selectedAccountId } = useEmailStore();
  const { connected } = useSSE(selectedAccountId);

  return <>{children}</>;
}
