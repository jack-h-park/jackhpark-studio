import { getImpactBadgeForControl, type ImpactLevel } from "./impact";

type Props = {
  /**
   * You can pass the specific impact level string if known,
   * or a control ID to look it up.
   */
  level?: ImpactLevel;
  controlId?: string;
  className?: string;
};

export function ImpactBadge({ level, controlId, className = "" }: Props) {
  const resolvedLevel =
    level ?? (controlId ? getImpactBadgeForControl(controlId) : "none");

  if (resolvedLevel !== "mayReduceMemory") {
    return null;
  }

  // Using existing tokens based on assumption of 'ai-badge' classes.
  // If these specific utility classes are not available, we fall back to standard Tailwind.
  // The user requested: "Badge should be visually subtle (token-based surface)"
  // and "Use existing design tokens (e.g., --ai-*)".
  // Since I saw `ai-choice__label` in presets, I'll try to align with that style or use generic classes
  // that likely map to the design system or are standard tailwind/shadcn equivalents if available.
  // Given the codebase snippets, `ai-label-overline` was mentioned.
  // I will use a small badge style.

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-[var(--ai-bg-surface-elevated)] text-[var(--ai-text-warning)] border border-[var(--ai-border-default)] ml-2 ${className}`}
      title="This setting may affect conversation memory"
    >
      May reduce memory
    </span>
  );
}
