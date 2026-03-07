'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEmailStore } from '@/stores/email-store';
import type { SerializedEmail } from '@/types';

interface SSEMessage {
  event: string;
  data: string;
}

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

export function useSSE(accountId: string | null): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { prependEmail, updateEmail, removeEmail, setFolderCounts } = useEmailStore();

  const connect = useCallback(() => {
    if (!accountId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const url = `/api/sse?accountId=${encodeURIComponent(accountId)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', () => {
      setConnected(true);
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    });

    eventSource.addEventListener('email:new', (event: MessageEvent) => {
      try {
        const email = JSON.parse(event.data) as SerializedEmail;
        prependEmail(email);
      } catch {
        // Invalid data, ignore
      }
    });

    eventSource.addEventListener('email:updated', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { id: string } & Partial<SerializedEmail>;
        const { id, ...updates } = data;
        if (id) {
          updateEmail(id, updates);
        }
      } catch {
        // Invalid data, ignore
      }
    });

    eventSource.addEventListener('email:deleted', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { id: string };
        if (data.id) {
          removeEmail(data.id);
        }
      } catch {
        // Invalid data, ignore
      }
    });

    eventSource.addEventListener('folder:updated', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Record<string, number>;
        setFolderCounts(data);
      } catch {
        // Invalid data, ignore
      }
    });

    eventSource.addEventListener('error', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { message: string };
        console.error('[SSE] Server error:', data.message);
      } catch {
        // Not a JSON error event, just a connection error
      }
    });

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      eventSourceRef.current = null;

      // Reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [accountId, prependEmail, updateEmail, removeEmail, setFolderCounts]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setConnected(false);
    };
  }, [connect]);

  return { connected };
}
