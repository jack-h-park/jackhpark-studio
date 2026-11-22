import type {
  InputId,
  RecordId,
  SectionId,
  UseId,
} from "@/content/pm-intelligence-world/types";
import { worldContent } from "@/content/pm-intelligence-world/content";

export interface DiscoveryState {
  started: boolean;
  inputs: InputId[];
  records: RecordId[];
  connected: boolean;
  uses: UseId[];
  roles: string[];
  reviewed: boolean;
  visited: SectionId[];
}
export type DiscoveryAction =
  | { type: "START_DISCOVERY" }
  | { type: "RESET_DISCOVERY" }
  | { type: "CONNECT_RECORDS" }
  | { type: "INSPECT_TRAIL_RECORD"; record: RecordId }
  | { type: "REVEAL_USE"; use: UseId }
  | { type: "INSPECT_ROLE"; role: string }
  | { type: "ACKNOWLEDGE_REVIEW" };
export const emptyDiscovery: DiscoveryState = {
  started: false,
  inputs: [],
  records: [],
  connected: false,
  uses: [],
  roles: [],
  reviewed: false,
  visited: [],
};
export function appendUnique<T>(items: T[], value: T): T[] {
  return items.includes(value) ? items : [...items, value];
}
export function canConnect(d: DiscoveryState): boolean {
  return (
    d.started &&
    d.inputs.length === 3 &&
    d.records.includes("strategy-note") &&
    d.records.includes("answer-draft")
  );
}
export function discoveryMilestones(d: DiscoveryState): boolean[] {
  return [d.inputs.length === 3, d.connected, d.uses.length === 4, d.reviewed];
}
export function illuminatedSections(d: DiscoveryState): SectionId[] {
  if (!d.started) return [];
  return [
    ...(d.inputs.length ? ["inputs" as const] : []),
    ...(d.connected ? ["knowledge" as const] : []),
    ...worldContent.uses
      .filter((u) => d.uses.includes(u.id))
      .map((u) => u.section),
    ...(d.reviewed ? ["roles" as const] : []),
  ];
}
export function discoveryReducer(
  d: DiscoveryState,
  a: DiscoveryAction,
): DiscoveryState {
  if (a.type === "RESET_DISCOVERY") return emptyDiscovery;
  if (a.type === "START_DISCOVERY")
    return { ...d, started: true, visited: appendUnique(d.visited, "inputs") };
  if (!d.started) return d;
  switch (a.type) {
    case "INSPECT_TRAIL_RECORD":
      return { ...d, records: appendUnique(d.records, a.record) };
    case "CONNECT_RECORDS":
      return canConnect(d) ? { ...d, connected: true } : d;
    case "REVEAL_USE":
      return d.connected ? { ...d, uses: appendUnique(d.uses, a.use) } : d;
    case "INSPECT_ROLE":
      return worldContent.roles.some((r) => r.name === a.role)
        ? { ...d, roles: appendUnique(d.roles, a.role) }
        : d;
    case "ACKNOWLEDGE_REVIEW":
      return d.connected && d.uses.length === 4 && d.roles.length >= 2
        ? { ...d, reviewed: true }
        : d;
  }
}

export function nextDiscoveryAction(d: DiscoveryState): {
  stage: number;
  label: string;
} {
  if (d.inputs.length < 3) return { stage: 0, label: "Find the three inputs" };
  if (!d.connected) return { stage: 1, label: "Connect the source and draft" };
  if (d.uses.length < 4) return { stage: 1, label: "Explore all four uses" };
  if (d.roles.length < 2) return { stage: 2, label: "Inspect two Agent roles" };
  if (!d.reviewed) return { stage: 2, label: "Review human responsibility" };
  return { stage: 3, label: "Open your exploration passport" };
}
