'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Shape of the persisted UI store. Kept deliberately small — only state that
 * must survive reloads lives here. Per-route ephemeral UI state should stay
 * in local component state.
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
 * Zustand store backing the app-shell. `persist` hydrates from
 * `localStorage['lb:ui']` on the client; during SSR and the initial client
 * render the default `sidebarOpen: true` is used, so hydration never
 * mismatches the server HTML.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
    }),
    {
      name: 'lb:ui',
      storage: createJSONStorage(() => storage),
      // Only persist the `sidebarOpen` slice — actions are recreated per session.
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    },
  ),
);
