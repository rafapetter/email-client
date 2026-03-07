'use client';

import { useUiStore } from '@/stores/ui-store';
import { useEmailStore } from '@/stores/email-store';
import { Sidebar, CollapsedSidebar } from './sidebar';
import { ComposeModal } from '@/components/compose/compose-modal';
import { SSEProvider } from '@/components/providers/sse-provider';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useBackgroundEnrichment } from '@/hooks/use-background-enrichment';
import { getFolderCounts } from '@/server/actions/folders';
import { cn } from '@/lib/utils';
import { MIN_PANE_WIDTH } from '@/lib/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster } from 'sonner';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, sidebarWidth, setSidebarWidth, toggleSidebar } = useUiStore();
  const { setFolderCounts, setFolderPathMap } = useEmailStore();

  useKeyboardShortcuts();
  useBackgroundEnrichment();

  useEffect(() => {
    const fetchCounts = () => {
      getFolderCounts().then((result) => {
        if (result.success) {
          // Skip the currently active folder — its count comes from actual fetched emails
          const activeFolder = useEmailStore.getState().currentFolder;
          const counts = Object.fromEntries(
            Object.entries(result.data.counts)
              .filter(([k]) => k !== activeFolder)
              .map(([k, v]) => [k, v.unread]),
          );
          setFolderCounts(counts);
          setFolderPathMap(result.data.pathMap);
        }
      });
    };
    fetchCounts();
    // Refresh folder counts every 60s to keep sidebar in sync
    const interval = setInterval(fetchCounts, 60_000);
    return () => clearInterval(interval);
  }, [setFolderCounts, setFolderPathMap]);

  return (
    <SSEProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {sidebarOpen ? (
          <>
            <div style={{ width: sidebarWidth }} className="flex-shrink-0 shadow-[1px_0_3px_0_rgba(0,0,0,0.08)]">
              <Sidebar />
            </div>
            <SidebarDivider
              onResize={(delta) => {
                const newWidth = sidebarWidth + delta;
                if (newWidth >= MIN_PANE_WIDTH && newWidth <= 400) {
                  setSidebarWidth(newWidth);
                }
              }}
              onCollapse={toggleSidebar}
            />
          </>
        ) : (
          <CollapsedSidebar />
        )}
        <div className="flex flex-1 overflow-hidden">
          {children}
        </div>
      </div>
      <ComposeModal />
      <Toaster />
    </SSEProvider>
  );
}

/**
 * Sidebar divider: drag to resize, click to collapse.
 */
function SidebarDivider({
  onResize,
  onCollapse,
}: {
  onResize: (delta: number) => void;
  onCollapse: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const lastX = useRef(0);
  const didDrag = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      lastX.current = e.clientX;
      didDrag.current = false;
      setIsDragging(true);

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - lastX.current;
        if (Math.abs(delta) > 2) didDrag.current = true;
        lastX.current = e.clientX;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onResize],
  );

  const handleClick = useCallback(() => {
    if (!didDrag.current) {
      onCollapse();
    }
  }, [onCollapse]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex w-2 flex-shrink-0 items-center justify-center cursor-col-resize"
      style={{ zIndex: 10 }}
      title="Drag to resize, click to collapse"
    >
      {/* Visible center line — always shown */}
      <div
        className={cn(
          'absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors duration-150',
          isDragging ? 'bg-blue-500' : isHovered ? 'bg-blue-500' : 'bg-border',
        )}
      />
      {/* Full-height hover highlight */}
      {(isHovered || isDragging) && (
        <div className={cn(
          'absolute inset-0 transition-colors',
          isDragging ? 'bg-blue-500/15' : 'bg-blue-500/10',
        )} />
      )}
    </div>
  );
}
