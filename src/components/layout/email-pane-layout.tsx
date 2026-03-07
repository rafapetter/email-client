'use client';

import { useEmailStore } from '@/stores/email-store';
import { useUiStore } from '@/stores/ui-store';
import { EmailList } from '@/components/layout/email-list';
import { EmailDetail } from '@/components/layout/email-detail';
import { MIN_PANE_WIDTH } from '@/lib/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Mail, GripVertical } from 'lucide-react';

interface EmailPaneLayoutProps {
  folder: string;
  initialEmailId?: string;
}

// Map folder names to URL prefixes
const FOLDER_ROUTES: Record<string, string> = {
  INBOX: '/inbox',
  SENT: '/sent',
  DRAFTS: '/drafts',
  STARRED: '/starred',
  ARCHIVE: '/archive',
  TRASH: '/trash',
};

export function EmailPaneLayout({ folder, initialEmailId }: EmailPaneLayoutProps) {
  const { listWidth, setListWidth, detailCollapsed, setDetailCollapsed } = useUiStore();
  const { selectedEmailId, setSelectedEmailId } = useEmailStore();
  const [listCollapsed, setListCollapsed] = useState(false);

  // Sync initialEmailId from URL to store on mount
  useEffect(() => {
    if (initialEmailId) {
      const decoded = decodeURIComponent(initialEmailId);
      if (decoded !== selectedEmailId) {
        setSelectedEmailId(decoded);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, [initialEmailId]);

  // Update URL when email is selected (without full page navigation)
  const handleEmailSelect = useCallback(
    (emailId: string | null) => {
      setSelectedEmailId(emailId);
      const base = FOLDER_ROUTES[folder] || '/inbox';
      if (emailId) {
        window.history.replaceState(null, '', `${base}/${encodeURIComponent(emailId)}`);
      } else {
        window.history.replaceState(null, '', base);
      }
    },
    [folder, setSelectedEmailId],
  );

  // Expand detail pane when an email is selected
  useEffect(() => {
    if (selectedEmailId && useUiStore.getState().detailCollapsed) {
      setDetailCollapsed(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- read detailCollapsed via getState to avoid loop
  }, [selectedEmailId, setDetailCollapsed]);

  // Expand list when no email is selected
  useEffect(() => {
    if (!selectedEmailId && listCollapsed) {
      setListCollapsed(false);
    }
  }, [selectedEmailId, listCollapsed]);

  const toggleListCollapse = useCallback(() => {
    setListCollapsed((v) => !v);
  }, []);

  const toggleDetailCollapse = useCallback(() => {
    if (detailCollapsed) {
      setDetailCollapsed(false);
    } else {
      setDetailCollapsed(true);
      handleEmailSelect(null);
    }
  }, [detailCollapsed, setDetailCollapsed, handleEmailSelect]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Email list pane */}
      {!listCollapsed ? (
        <>
          <div
            style={{ width: detailCollapsed ? undefined : listWidth }}
            className={cn('border-r border-border/50 relative flex flex-col', detailCollapsed ? 'flex-1' : 'flex-shrink-0')}
          >
            <div className="flex-1 overflow-hidden">
              <EmailList folder={folder} onEmailSelect={handleEmailSelect} />
            </div>
          </div>
          {!detailCollapsed && (
            <PaneDivider
              onResize={(delta) => {
                const newWidth = listWidth + delta;
                if (newWidth >= MIN_PANE_WIDTH && newWidth <= 800) {
                  setListWidth(newWidth);
                }
              }}
              onClick={toggleListCollapse}
            />
          )}
        </>
      ) : (
        <PaneDivider
          onClick={toggleListCollapse}
          collapsed
        />
      )}

      {/* Detail pane */}
      {!detailCollapsed ? (
        <div className="flex-1 overflow-hidden relative">
          {selectedEmailId ? (
            <EmailDetail emailId={selectedEmailId} />
          ) : (
            <EmptyDetailPane />
          )}
        </div>
      ) : (
        <PaneDivider
          onClick={toggleDetailCollapse}
          collapsed
          side="right"
        />
      )}
    </div>
  );
}

function EmptyDetailPane() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-8">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/60">
        <Mail className="size-7 text-muted-foreground/60" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground/80">No email selected</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Choose an email from the list to read it here, or press <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono">c</kbd> to compose a new one.
        </p>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground/60">
        <span><kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> navigate</span>
        <span><kbd className="font-mono">e</kbd> archive</span>
        <span><kbd className="font-mono">r</kbd> reply</span>
        <span><kbd className="font-mono">/</kbd> search</span>
      </div>
    </div>
  );
}

/**
 * Interactive pane divider:
 * - Hover: shows blue highlight line + grip dots
 * - Click (no drag): toggles collapse of adjacent pane
 * - Drag: resizes the pane
 */
function PaneDivider({
  onResize,
  onClick,
  collapsed,
  side = 'left',
}: {
  onResize?: (delta: number) => void;
  onClick: () => void;
  collapsed?: boolean;
  side?: 'left' | 'right';
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const lastX = useRef(0);
  const didDrag = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onResize) return; // collapsed state — no drag
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
    // Only trigger collapse if user didn't drag
    if (!didDrag.current) {
      onClick();
    }
  }, [onClick]);

  if (collapsed) {
    return (
      <div
        className={cn(
          'group flex w-5 flex-shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-accent/60',
          side === 'right' ? 'border-l border-border' : 'border-r border-border',
        )}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title="Click to expand"
      >
        <GripVertical className={cn(
          'size-4 transition-colors',
          isHovered ? 'text-blue-500' : 'text-muted-foreground/50',
        )} />
      </div>
    );
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group relative flex w-2 flex-shrink-0 items-center justify-center',
        onResize ? 'cursor-col-resize' : 'cursor-pointer',
      )}
      style={{ zIndex: 10 }}
      title={onResize ? 'Drag to resize, click to collapse' : 'Click to collapse'}
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
