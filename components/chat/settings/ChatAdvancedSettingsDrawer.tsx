"use client";

import { FiSettings } from "@react-icons/all-files/fi/FiSettings";
import { useEffect } from "react";

import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { Button } from "@/components/ui/button";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

import { SettingsSectionContextHistory } from "./SettingsSectionContextHistory";
import { SettingsSectionCoreSummary } from "./SettingsSectionCoreSummary";
import styles from "./ChatAdvancedSettingsDrawer.module.css";
import { SettingsSectionDisplay } from "./SettingsSectionDisplay";
import { SettingsSectionModelEngine } from "./SettingsSectionModelEngine";
import { SettingsSectionPresets } from "./SettingsSectionPresets";
import { SettingsSectionRagRetrieval } from "./SettingsSectionRagRetrieval";
import { SettingsSectionSessionAdditionalPrompt } from "./SettingsSectionSessionAdditionalPrompt";

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
      presetId: "default",
      additionalSystemPrompt:
        adminConfig.presets.default.additionalSystemPrompt ?? "",
      appliedPreset: "default",
    }));

  return (
    <>
      <div
        className={`${styles.overlay} ${open ? styles.overlayVisible : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`${styles.drawer} ${open ? styles.drawerVisible : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Advanced chat settings"
      >
        <div className={styles.panel}>
          <div className={styles.inner}>
            <div className={styles.header}>
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
            <div className={`${styles.content} space-y-4`}>
              <SettingsSectionCoreSummary
                summary={adminConfig.baseSystemPromptSummary ?? ""}
              />

              <SettingsSectionDisplay />

              <SettingsSectionPresets
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                helperText="The chosen preset cascades into the following engine, retrieval, and prompt controls."
                setSessionConfig={setSessionConfig}
              />

              <div className={`${styles.cascade} space-y-4`}>
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

                <SettingsSectionSessionAdditionalPrompt
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
