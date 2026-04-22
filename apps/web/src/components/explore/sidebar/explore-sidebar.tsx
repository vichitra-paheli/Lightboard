'use client';

import type { DataSourceOption } from '../types';
import { ConversationsList } from './conversations-list';
import { DatabasePicker } from './database-picker';
import { NewChatButton } from './new-chat-button';

/**
 * Props for {@link ExploreSidebar}.
 */
interface ExploreSidebarProps {
  sources: DataSourceOption[];
  selectedId: string | null;
  onSelectSource: (id: string) => void;
  onNewChat: () => void;
  /** Currently-active conversation id, if one is loaded. */
  activeConversationId?: string | null;
  /** Called with the id of a clicked conversation. */
  onSelectConversation?: (id: string) => void;
}

/**
 * Composed sidebar for the Explore route. Stacks:
 *
 * 1. Database picker (source dropdown).
 * 2. Grouped conversations list — fed by `/api/conversations?sourceId=<id>`,
 *    bucketed Today / Yesterday / This week / Older client-side.
 * 3. Flex spacer.
 * 4. `New conversation` button pinned to the bottom.
 *
 * Installed into the shell sidebar via `useUiStore.setSidebarSlot` from
 * `ExplorePageClient`. The outer `aside` is provided by the shell's
 * `<Sidebar>` — this component only renders the per-route content stack.
 */
export function ExploreSidebar({
  sources,
  selectedId,
  onSelectSource,
  onNewChat,
  activeConversationId,
  onSelectConversation,
}: ExploreSidebarProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <DatabasePicker
        sources={sources}
        selectedId={selectedId}
        onChange={onSelectSource}
      />
      <ConversationsList
        sourceId={selectedId}
        activeId={activeConversationId}
        onSelect={onSelectConversation}
      />
      <div className="flex-1" />
      <NewChatButton onClick={onNewChat} />
    </div>
  );
}
