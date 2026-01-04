import { getImpactBadgeForControl, type ImpactLevel } from "./impact";

const IMPACT_LABELS: Record<ImpactLevel, string | undefined> = {
  none: undefined,
  mayReduceMemory: "May reduce memory",
};

type Props = {
  label?: string;
  controlId?: string;
  className?: string;
};

export function ImpactBadge({ label, controlId, className = "" }: Props) {
  const controlImpact = controlId
    ? getImpactBadgeForControl(controlId)
    : ("none" as ImpactLevel);
  const resolvedLabel = label ?? IMPACT_LABELS[controlImpact];

  if (!resolvedLabel) {
    return null;
  }

  return (
    <span
      className={`inline-flex select-none items-center rounded-full border border-[color:var(--ai-border-muted)] bg-[color:var(--ai-surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ai-text-muted)] ${className}`}
      title={resolvedLabel}
    >
      {resolvedLabel}
    </span>
  );
}
