import { InlineAlert } from "@/components/ui/alert";

type Props = {
  message: string;
  onDismiss: () => void;
};

export function DrawerInlineWarning({ message, onDismiss }: Props) {
  if (!message) return null;

  return (
    <InlineAlert
      severity="warning"
      className="mb-1 animate-in fade-in slide-in-from-top-2"
      onDismiss={onDismiss}
    >
      {message}
    </InlineAlert>
  );
}
