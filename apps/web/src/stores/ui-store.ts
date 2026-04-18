'use client';

import type { ReactNode } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Shape of the persisted UI store. Kept deliberately small — only state that
 * must survive reloads lives here. Per-route ephemeral UI state (such as the
 * sidebar slot contents) lives in non-persisted slices on the same store so
 * the shell can read it synchronously during render.
 */
export interface UiState {
  /**
   * Whether the app-shell sidebar is expanded. Defaults to `true` so a
   * first-time user sees the full layout on their initial visit. Toggled via
   * the top-bar hamburger and the `Ctrl/Cmd + \` keyboard shortcut.
   */
  sidebarOpen: boolean;
  /** Flip {@link UiState.sidebarOpen}. */
  toggleSidebar: () => void;
  /** Set {@link UiState.sidebarOpen} to an explicit value. */
  setSidebarOpen: (open: boolean) => void;

  /**
   * Current per-route sidebar content. Routes that need custom widgets in
   * the shell sidebar (Explore's DB picker + conversations list, future
   * Views/Settings filters, etc.) call {@link UiState.setSidebarSlot} on
   * mount and clear it on unmount. When `null`, the sidebar renders empty.
   *
   * Stored in the Zustand store rather than a React context so the slot can
   * be set from any client component without threading providers through
   * every route layout. Not persisted — slot contents are ephemeral and
   * re-register on navigation.
   */
  sidebarSlot: ReactNode | null;
  /**
   * Install per-route content into the shell sidebar. Typical usage:
   *
   * ```tsx
   * useEffect(() => {
   *   setSidebarSlot(<ExploreSidebar ... />);
   *   return () => setSidebarSlot(null);
   * }, [setSidebarSlot, ...deps]);
   * ```
   *
   * The cleanup on unmount keeps non-Explore routes from inheriting stale
   * sidebar content when the user navigates away.
   */
  setSidebarSlot: (slot: ReactNode | null) => void;
}

/**
 * Safe `localStorage` accessor that falls back to an in-memory no-op on the
 * server. Zustand's `persist` middleware calls `getItem` during the initial
 * module evaluation — on the Next.js server pass that throws unless we guard
 * the access, which would crash SSR for every route using this store.
 */
const storage =
  typeof window === 'undefined'
    ? {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      }
    : window.localStorage;

/**
 * Zustand store backing the app-shell. `persist` hydrates `sidebarOpen`
 * from `localStorage['lb:ui']` on the client; during SSR and the initial
 * client render the defaults below are used, so hydration never mismatches
 * the server HTML. `sidebarSlot` is intentionally excluded from persistence
 * — it holds live React nodes that cannot be serialized.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      sidebarSlot: null,
      setSidebarSlot: (slot: ReactNode | null) => set({ sidebarSlot: slot }),
    }),
    {
      name: 'lb:ui',
      storage: createJSONStorage(() => storage),
      // Only persist the `sidebarOpen` slice — actions are recreated per session
      // and `sidebarSlot` holds live React nodes that can't round-trip JSON.
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    },
  ),
);
