'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useEmailStore } from '@/stores/email-store';
import { useUiStore } from '@/stores/ui-store';
import { KEYBOARD_SHORTCUTS, GO_TO_SHORTCUTS } from '@/lib/constants';
import {
  archiveEmail,
  deleteEmail,
  starEmail,
  unstarEmail,
  markAsRead,
  markAsUnread,
} from '@/server/actions/emails';
import { toast } from 'sonner';

const GO_TO_TIMEOUT_MS = 1500;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(enabled = true) {
  const router = useRouter();

  // Use refs for store values to avoid re-registering listeners on every state change
  const pendingKeyRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when typing in form fields
      if (isEditableTarget(e.target)) return;

      // Skip when modifier keys are held (Cmd+C, Ctrl+V, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const {
        composeOpen,
        searchOpen,
        openCompose,
        closeCompose,
        toggleSearch,
        setSearchOpen,
      } = useUiStore.getState();

      const {
        emails,
        selectedEmailId,
        setSelectedEmailId,
      } = useEmailStore.getState();

      const key = e.key;

      // --- Handle pending "g" sequences ---
      if (pendingKeyRef.current === 'g') {
        pendingKeyRef.current = null;
        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }

        const route = GO_TO_SHORTCUTS[key];
        if (route) {
          e.preventDefault();
          router.push(route);
          return;
        }
        // If key doesn't match any go-to shortcut, fall through
      }

      // --- Escape: contextual close ---
      if (key === KEYBOARD_SHORTCUTS.escape) {
        if (composeOpen) {
          e.preventDefault();
          closeCompose();
          return;
        }
        if (searchOpen) {
          e.preventDefault();
          setSearchOpen(false);
          return;
        }
        if (selectedEmailId) {
          e.preventDefault();
          setSelectedEmailId(null);
          return;
        }
        return;
      }

      // Don't process other shortcuts when compose or search is open
      if (composeOpen) return;

      // --- Navigation ---
      if (key === KEYBOARD_SHORTCUTS.nextEmail || key === KEYBOARD_SHORTCUTS.prevEmail) {
        e.preventDefault();
        if (emails.length === 0) return;

        const currentIndex = selectedEmailId
          ? emails.findIndex((em) => em.id === selectedEmailId)
          : -1;

        let nextIndex: number;
        if (key === KEYBOARD_SHORTCUTS.nextEmail) {
          nextIndex = currentIndex < emails.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }

        const nextEmail = emails[nextIndex];
        if (nextEmail) {
          setSelectedEmailId(nextEmail.id);
        }
        return;
      }

      // --- Open selected email ---
      if (key === KEYBOARD_SHORTCUTS.openEmail) {
        if (selectedEmailId) {
          e.preventDefault();
          // Selection already highlights the email in the list;
          // the email detail pane reads selectedEmailId automatically.
        }
        return;
      }

      // --- Compose ---
      if (key === KEYBOARD_SHORTCUTS.compose) {
        e.preventDefault();
        openCompose('new');
        return;
      }

      // --- Search ---
      if (key === KEYBOARD_SHORTCUTS.search) {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // --- Help ---
      if (key === KEYBOARD_SHORTCUTS.help) {
        e.preventDefault();
        // Toggle help overlay -- dispatches a custom event that can be
        // caught by a ShortcutHelpOverlay component
        window.dispatchEvent(new CustomEvent('toggle-shortcut-help'));
        return;
      }

      // --- "g" prefix for go-to shortcuts ---
      if (key === 'g') {
        e.preventDefault();
        pendingKeyRef.current = 'g';
        pendingTimerRef.current = setTimeout(() => {
          pendingKeyRef.current = null;
        }, GO_TO_TIMEOUT_MS);
        return;
      }

      // --- Actions requiring a selected email ---
      if (!selectedEmailId) return;

      const selectedEmail = emails.find((em) => em.id === selectedEmailId);
      if (!selectedEmail) return;

      // Reply
      if (key === KEYBOARD_SHORTCUTS.reply) {
        e.preventDefault();
        openCompose('reply', selectedEmailId);
        return;
      }

      // Reply All (Shift+R)
      if (key === KEYBOARD_SHORTCUTS.replyAll) {
        e.preventDefault();
        openCompose('replyAll', selectedEmailId);
        return;
      }

      // Forward
      if (key === KEYBOARD_SHORTCUTS.forward) {
        e.preventDefault();
        openCompose('forward', selectedEmailId);
        return;
      }

      // Archive
      if (key === KEYBOARD_SHORTCUTS.archive) {
        e.preventDefault();
        archiveEmail(selectedEmailId).then((result) => {
          if (result.success) {
            useEmailStore.getState().removeEmail(selectedEmailId);
            toast.success('Email archived.');
          } else {
            toast.error(result.error);
          }
        });
        return;
      }

      // Delete
      if (key === KEYBOARD_SHORTCUTS.delete) {
        e.preventDefault();
        deleteEmail(selectedEmailId).then((result) => {
          if (result.success) {
            useEmailStore.getState().removeEmail(selectedEmailId);
            toast.success('Email deleted.');
          } else {
            toast.error(result.error);
          }
        });
        return;
      }

      // Star / Unstar
      if (key === KEYBOARD_SHORTCUTS.star) {
        e.preventDefault();
        const action = selectedEmail.isStarred ? unstarEmail : starEmail;
        action(selectedEmailId).then((result) => {
          if (result.success) {
            useEmailStore.getState().updateEmail(selectedEmailId, {
              isStarred: !selectedEmail.isStarred,
            });
          } else {
            toast.error(result.error);
          }
        });
        return;
      }

      // Toggle read / unread
      if (key === KEYBOARD_SHORTCUTS.markUnread) {
        e.preventDefault();
        const action = selectedEmail.isRead ? markAsUnread : markAsRead;
        action(selectedEmailId).then((result) => {
          if (result.success) {
            useEmailStore.getState().updateEmail(selectedEmailId, {
              isRead: !selectedEmail.isRead,
            });
          } else {
            toast.error(result.error);
          }
        });
        return;
      }
    },
    [router]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
      }
    };
  }, [enabled, handleKeyDown]);
}
