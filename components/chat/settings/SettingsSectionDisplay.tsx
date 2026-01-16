"use client";

import { FiMonitor } from "@react-icons/all-files/fi/FiMonitor";

import { DiagnosticsDisplayControls } from "@/components/chat/settings/DiagnosticsDisplayControls";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";

import drawerStyles from "./ChatAdvancedSettingsDrawer.module.css";

export function SettingsSectionDisplay() {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle as="p" icon={<FiMonitor aria-hidden="true" />}>
          Diagnostics Display
        </SectionTitle>
      </SectionHeader>
      <SectionContent className="grid gap-3">
        <DiagnosticsDisplayControls
          className={drawerStyles.drawerDiagnosticsCard}
        />
      </SectionContent>
    </Section>
  );
}
