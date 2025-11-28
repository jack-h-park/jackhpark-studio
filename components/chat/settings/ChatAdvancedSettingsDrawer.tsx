"use client";

import { FiSettings } from "@react-icons/all-files/fi/FiSettings";
import { useEffect } from "react";

import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { Button } from "@/components/ui/button";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

import { SettingsSectionContextHistory } from "./SettingsSectionContextHistory";
import { SettingsSectionCoreSummary } from "./SettingsSectionCoreSummary";
import { SettingsSectionDisplay } from "./SettingsSectionDisplay";
import { SettingsSectionModelEngine } from "./SettingsSectionModelEngine";
import { SettingsSectionPresets } from "./SettingsSectionPresets";
import { SettingsSectionRagRetrieval } from "./SettingsSectionRagRetrieval";
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

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
        role="dialog"
        aria-modal="true"
        aria-label="Advanced chat settings"
      >
        <div className="ai-settings-drawer__panel">
          <div className="ai-settings-drawer__inner">
            <div className="ai-settings-drawer__header">
              <HeadingWithIcon as="h2" icon={<FiSettings aria-hidden="true" />}>
                Advanced Settings
              </HeadingWithIcon>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close advanced settings"
              >
                ✕
              </Button>
            </div>
            <div className="ai-settings-drawer__content space-y-4">
              <SettingsSectionCoreSummary
                summary={adminConfig.coreSystemPromptSummary}
              />

              <SettingsSectionDisplay />

              <SettingsSectionPresets
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                helperText="The chosen preset cascades into the following engine, retrieval, and prompt controls."
                setSessionConfig={setSessionConfig}
              />

              <div className="ai-settings-cascade space-y-4">
                <SettingsSectionModelEngine
                  adminConfig={adminConfig}
                  sessionConfig={sessionConfig}
                  setSessionConfig={setSessionConfig}
                />

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

                <SettingsSectionUserPrompt
                  adminConfig={adminConfig}
                  sessionConfig={sessionConfig}
                  setSessionConfig={setSessionConfig}
                />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={resetToDefault}
              >
                Reset to Default
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
