'use client';

import { useEffect, useRef, useState } from 'react';
import { useEmailStore } from '@/stores/email-store';
import { loadEnrichmentsForEmails } from '@/server/actions/ai-cache';
import { getAiProcessingStatus, processUnprocessedEmails } from '@/server/actions/ai-process';

const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RETRY_DELAY_MS = 3_000;
const PAUSE_BETWEEN_BATCHES_MS = 500;

/**
 * Background enrichment hook:
 * 1. Checks AI processing status IMMEDIATELY on mount
 * 2. Hydrates Zustand from SQLite cache (instant)
 * 3. Processes unprocessed emails in background loop with auto-retry
 */
export function useBackgroundEnrichment() {
  const { emails, hydrateEnrichments, setAiProcessingStatus } = useEmailStore();
  const processingRef = useRef(false);
  const mountedRef = useRef(false);
  // retryTick forces the effect to re-run after error pauses
  const [retryTick, setRetryTick] = useState(0);

  // Phase 1: Check processing status IMMEDIATELY on mount (no delay)
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    getAiProcessingStatus().then((result) => {
      if (result.success) {
        setAiProcessingStatus(result.data);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 2: Hydrate from SQLite cache when emails change
  useEffect(() => {
    if (emails.length === 0) return;
    const emailIds = emails.map((e) => e.id);
    loadEnrichmentsForEmails(emailIds).then((cached) => {
      if (Object.keys(cached).length > 0) {
        hydrateEnrichments(cached);
      }
    }).catch((err) => {
      console.warn('[BackgroundEnrichment] Cache load error:', err);
    });

    // Also refresh status when emails change
    getAiProcessingStatus().then((result) => {
      if (result.success) {
        setAiProcessingStatus(result.data);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails]);

  // Phase 3: Process unprocessed emails in background
  const { aiProcessingStatus } = useEmailStore();

  useEffect(() => {
    if (!aiProcessingStatus.isProcessing || processingRef.current) return;
    processingRef.current = true;

    let batchCount = 0;

    async function processLoop() {
      let hasMore = true;
      let consecutiveErrors = 0;

      while (hasMore) {
        try {
          const result = await processUnprocessedEmails(5);
          if (!result.success) {
            console.warn('[BackgroundEnrichment] Processing failed:', result.error);
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.warn('[BackgroundEnrichment] Too many errors, pausing 15s then retrying');
              break;
            }
            await new Promise((r) => setTimeout(r, ERROR_RETRY_DELAY_MS));
            continue;
          }

          consecutiveErrors = 0;
          batchCount++;
          hasMore = result.data.remaining > 0;

          // Update status directly from result
          const total = useEmailStore.getState().aiProcessingStatus.total;
          useEmailStore.getState().setAiProcessingStatus({
            processed: total - result.data.remaining,
            total,
            isProcessing: hasMore,
          });

          // Re-hydrate every 3 batches
          if (batchCount % 3 === 0) {
            const currentEmails = useEmailStore.getState().emails;
            if (currentEmails.length > 0) {
              const ids = currentEmails.map((e) => e.id);
              loadEnrichmentsForEmails(ids).then((cached) => {
                if (Object.keys(cached).length > 0) {
                  useEmailStore.getState().hydrateEnrichments(cached);
                }
              }).catch(() => {});
            }
          }

          // Small pause between batches to avoid overwhelming the API
          if (hasMore) {
            await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
          }
        } catch (err) {
          console.warn('[BackgroundEnrichment] Process loop error:', err);
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
          await new Promise((r) => setTimeout(r, ERROR_RETRY_DELAY_MS));
        }
      }

      // Final hydration
      const currentEmails = useEmailStore.getState().emails;
      if (currentEmails.length > 0) {
        const ids = currentEmails.map((e) => e.id);
        loadEnrichmentsForEmails(ids).then((cached) => {
          if (Object.keys(cached).length > 0) {
            useEmailStore.getState().hydrateEnrichments(cached);
          }
        }).catch(() => {});
      }

      // Check if there's still work remaining
      const statusResult = await getAiProcessingStatus().catch(() => null);
      processingRef.current = false;

      if (statusResult?.success && statusResult.data.isProcessing) {
        // Still has unprocessed emails — schedule a retry
        // The retryTick state change will re-trigger this effect
        useEmailStore.getState().setAiProcessingStatus(statusResult.data);
        setTimeout(() => setRetryTick((t) => t + 1), 15_000);
      } else if (statusResult?.success) {
        useEmailStore.getState().setAiProcessingStatus(statusResult.data);
      }
    }

    void processLoop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProcessingStatus.isProcessing, retryTick]);
}
