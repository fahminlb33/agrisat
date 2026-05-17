import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { CHAT_MODES, CHAT_MODE_LABELS, type ChatMode } from "#/types/chat";

export interface ChatModeTabsProps {
  activeMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

/**
 * Compact tab bar for selecting the AI assistant's interaction mode.
 *
 * Displays four modes: Explain, Compare, Predict, Recommend.
 * The active mode is visually highlighted. Changing mode does NOT
 * clear existing chat messages — it only affects subsequent requests.
 */
export function ChatModeTabs({ activeMode, onModeChange }: ChatModeTabsProps) {
  return (
    <Tabs
      value={activeMode}
      onValueChange={(value) => onModeChange(value as ChatMode)}
      className="px-2 pt-2"
    >
      <TabsList className="w-full">
        {CHAT_MODES.map((mode) => (
          <TabsTrigger
            key={mode}
            value={mode}
            className="flex-1 text-xs px-2 py-1"
          >
            {CHAT_MODE_LABELS[mode]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
