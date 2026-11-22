import {
  type Mode,
  type SectionId,
  sectionIds,
} from "@/content/pm-intelligence-world/types";

export function isReadingFragment(hash: string): boolean {
  return hash.length > 1 && hash !== "#observatory";
}

// The fragment is unavailable to SSR. Run before either view is parsed, then
// let React take ownership once client routing has initialized. Keep this literal
// stable across server/client minifiers; the executable test checks agreement.
export const initialViewScript =
  'document.documentElement.setAttribute("data-pm-initial-view", location.hash.length > 1 && location.hash !== "#observatory" ? "reading" : "observatory");';

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
