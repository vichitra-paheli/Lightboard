'use client';

import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui-store';

/**
 * Returns `true` when an input-like element currently owns keyboard focus —
 * used to bail out of global shortcuts so typing a backslash inside the
 * composer doesn't collapse the sidebar underneath the user.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Global shortcut hook: `Ctrl/Cmd + \` toggles the sidebar.
 *
 * Mounted once at the shell level (`AppShell`). Bails out while the user is
 * focused inside an input / textarea / contenteditable so typing the key in
 * a field works normally. Other shortcuts (e.g. the Explore `Cmd+K` focus
 * for the DB picker) are untouched — this listener only handles the
 * backslash combo and calls `preventDefault` so the browser doesn't treat
 * it as a page action either.
 */
export function useSidebarShortcut() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isToggleCombo =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === '\\';
      if (!isToggleCombo) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggleSidebar();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);
}
