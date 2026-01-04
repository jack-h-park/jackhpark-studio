import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiX } from "@react-icons/all-files/fi/FiX";

import { Button } from "@/components/ui/button";

type Props = {
  message: string;
  onDismiss: () => void;
};

export function DrawerInlineWarning({ message, onDismiss }: Props) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 p-3 text-sm rounded bg-[var(--ai-bg-surface-elevated)] border border-[var(--ai-border-warning)] text-[var(--ai-text-default)] mb-1 animate-in fade-in slide-in-from-top-2"
    >
      <FiAlertTriangle
        className="flex-shrink-0 mt-0.5 text-[var(--ai-text-warning)]"
        aria-hidden="true"
      />
      <div className="flex-1 leading-tight">{message}</div>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 -mt-0.5 -mr-1 hover:bg-[var(--ai-bg-surface-hover)] text-[var(--ai-text-muted)] hover:text-[var(--ai-text-default)]"
        onClick={onDismiss}
        aria-label="Dismiss warning"
      >
        <FiX className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
