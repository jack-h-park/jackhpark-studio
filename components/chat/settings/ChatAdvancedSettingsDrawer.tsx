"use client";

import { FiSettings } from "@react-icons/all-files/fi/FiSettings";
import { useEffect } from "react";

import { useChatConfig } from "@/components/chat/context/ChatConfigContext";

import { SettingsSectionContextHistory } from "./SettingsSectionContextHistory";
import { SettingsSectionCoreSummary } from "./SettingsSectionCoreSummary";
import { SettingsSectionDisplay } from "./SettingsSectionDisplay";
import { SettingsSectionModelEngine } from "./SettingsSectionModelEngine";
import { SettingsSectionPresets } from "./SettingsSectionPresets";
import { SettingsSectionRagRetrieval } from "./SettingsSectionRagRetrieval";
import { SettingsSectionSummaries } from "./SettingsSectionSummaries";
import { SettingsSectionUserPrompt } from "./SettingsSectionUserPrompt";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function ChatAdvancedSettingsDrawer({ open, onClose }: DrawerProps) {
  const { adminConfig, sessionConfig, setSessionConfig } = useChatConfig();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    };
  }, [open]);

  const resetToDefault = () =>
    setSessionConfig(() => ({
      ...adminConfig.presets.default,
      appliedPreset: "default",
    }));

  return (
    <>
      <div
        className={`ai-settings-drawer-overlay ${
          open ? "ai-settings-drawer-overlay--visible" : ""
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`ai-settings-drawer ${open ? "ai-settings-drawer--visible" : ""}`}
      >
        <div className="ai-settings-drawer__panel">
          <div className="ai-settings-drawer__inner">
            <div className="ai-settings-drawer__header">
              <h2 className="ai-settings-drawer__title heading-with-icon">
                <FiSettings aria-hidden="true" />
                Advanced Settings
              </h2>
              <button
                onClick={onClose}
                className="ai-settings-drawer__close"
                aria-label="Close advanced settings"
              >
                ✕
              </button>
            </div>
            <div className="ai-settings-drawer__content">
              <SettingsSectionCoreSummary
                summary={adminConfig.coreSystemPromptSummary}
              />

              <SettingsSectionModelEngine
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                setSessionConfig={setSessionConfig}
              />

              <SettingsSectionDisplay />

              <SettingsSectionRagRetrieval
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                setSessionConfig={setSessionConfig}
              />

              <SettingsSectionContextHistory
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                setSessionConfig={setSessionConfig}
              />

              <SettingsSectionSummaries
                summaryPresets={adminConfig.summaryPresets}
                sessionConfig={sessionConfig}
                setSessionConfig={setSessionConfig}
              />

              <SettingsSectionUserPrompt
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                setSessionConfig={setSessionConfig}
              />

              <SettingsSectionPresets
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                setSessionConfig={setSessionConfig}
              />

              <button
                type="button"
                className="settings-section__reset"
                onClick={resetToDefault}
              >
                Reset to Default
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
