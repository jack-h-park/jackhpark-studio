import {
  type Mode,
  type SectionId,
  sectionIds,
} from "@/content/pm-intelligence-world/types";

export function parseFragment(hash: string): {
  mode: Mode;
  section: SectionId;
} {
  const [mode, section, ...rest] = hash.replace(/^#/, "").split("/");
  if (
    rest.length ||
    !["quick", "guide", "explore"].includes(mode) ||
    !sectionIds.includes(section as SectionId)
  )
    return { mode: "quick", section: "overview" };
  return { mode: mode as Mode, section: section as SectionId };
}
export function formatFragment(mode: Mode, section: SectionId): string {
  return `#${mode}/${section}`;
}
