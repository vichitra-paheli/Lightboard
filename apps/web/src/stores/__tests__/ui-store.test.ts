import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../ui-store';

describe('useUiStore', () => {
  beforeEach(() => {
    // Reset to the initial state before each test so prior toggles don't leak
    // between cases. Zustand `create()` memoizes per-module, so the same
    // store instance is reused across tests.
    useUiStore.setState({ sidebarOpen: true });
    window.localStorage.clear();
  });

  it('defaults sidebarOpen to true', () => {
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it('toggleSidebar flips sidebarOpen', () => {
    const { toggleSidebar } = useUiStore.getState();

    toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);

    toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it('setSidebarOpen writes the value deterministically', () => {
    const { setSidebarOpen } = useUiStore.getState();

    setSidebarOpen(false);
    expect(useUiStore.getState().sidebarOpen).toBe(false);

    setSidebarOpen(false);
    expect(useUiStore.getState().sidebarOpen).toBe(false);

    setSidebarOpen(true);
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it("persists to localStorage under 'lb:ui'", () => {
    // Toggle to dirty the state, then read localStorage through the key used
    // by the persist middleware. Zustand stores a JSON envelope shaped like
    // { state: {...}, version: 0 } — we assert the inner slice.
    useUiStore.getState().setSidebarOpen(false);

    const raw = window.localStorage.getItem('lb:ui');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.sidebarOpen).toBe(false);
  });
});
