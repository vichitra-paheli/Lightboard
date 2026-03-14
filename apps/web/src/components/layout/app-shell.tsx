'use client';

import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/**
 * App shell layout with sidebar and top bar.
 * The shell renders instantly — only the content area shows loading states.
 */
export function AppShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
