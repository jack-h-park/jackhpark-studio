import { FiX } from "@react-icons/all-files/fi/FiX";

import type { AdminChatConfig } from "@/types/chat-config";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type RawConfigJsonModalProps = {
  config: AdminChatConfig;
  isOpen: boolean;
  onClose: () => void;
  isWordWrapEnabled: boolean;
  onToggleWordWrap: (checked: boolean) => void;
};

export function RawConfigJsonModal({
  config,
  isOpen,
  onClose,
  isWordWrapEnabled,
  onToggleWordWrap,
}: RawConfigJsonModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="flex flex-col w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl bg-[color:var(--ai-role-surface-2)] shadow-2xl border border-[color:var(--ai-role-border-subtle)]"
        role="dialog"
        aria-modal="true"
        aria-label="Raw admin chat config"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--ai-role-border-subtle)] bg-[color:var(--ai-role-surface-1)]">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold text-[var(--ai-text-strong)]">
              Admin Chat Configuration Data{" "}
              <span className="text-sm font-normal text-[var(--ai-text-muted)]">
                (JSON)
              </span>
            </h2>
            <p className="text-xs text-[var(--ai-text-muted)]">
              This is for read-only.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="word-wrap-toggle"
                checked={isWordWrapEnabled}
                onCheckedChange={onToggleWordWrap}
              />
              <div className="ai-choice">
                <Label
                  htmlFor="word-wrap-toggle"
                  className="ai-choice__label cursor-pointer"
                >
                  Word Wrap
                </Label>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              type="button"
              onClick={onClose}
            >
              <FiX aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "flex-1 w-full min-w-0 p-6 bg-[color:var(--ai-role-surface-1)]",
            isWordWrapEnabled ? "overflow-y-auto" : "overflow-auto",
          )}
        >
          <pre
            className={cn(
              "text-xs font-mono text-[var(--ai-text)]",
              isWordWrapEnabled ? "whitespace-pre-wrap" : "whitespace-pre",
            )}
          >
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
