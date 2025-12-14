import { FiSettings } from "@react-icons/all-files/fi/FiSettings";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { type ChatMessage } from "@/components/chat/hooks/useChatSession";
import {
  getImpactWarningMessage,
  type ImpactKey} from "@/components/chat/settings/impact";
import { Button } from "@/components/ui/button";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";

import styles from "./ChatAdvancedSettingsDrawer.module.css";
import { DrawerInlineWarning } from "./DrawerInlineWarning";
import { SettingsSectionContextHistory } from "./SettingsSectionContextHistory";
import { SettingsSectionCoreSummary } from "./SettingsSectionCoreSummary";
import { SettingsSectionDisplay } from "./SettingsSectionDisplay";
import { SettingsSectionModelEngine } from "./SettingsSectionModelEngine";
import { SettingsSectionPresets } from "./SettingsSectionPresets";
import { SettingsSectionRagRetrieval } from "./SettingsSectionRagRetrieval";
import { SettingsSectionSessionAdditionalPrompt } from "./SettingsSectionSessionAdditionalPrompt";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
};

export function ChatAdvancedSettingsDrawer({
  open,
  onClose,
  messages,
}: DrawerProps) {
  const { adminConfig, sessionConfig, setSessionConfig } = useChatConfig();
  const [mounted, setMounted] = useState(false);
  const [warningState, setWarningState] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: "" });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      // Reset warning when drawer closes
      setWarningState({ visible: false, message: "" });
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

  const triggerImpactWarning = (key: ImpactKey) => {
    const message = getImpactWarningMessage(key);
    // Only update if not already visible or if message is different (optional enhancement)
    // Detailed requirement: "Avoid spamming: if banner is already visible, don’t re-add multiple banners; optionally update the message"
    setWarningState({ visible: true, message });
  };

  const resetToDefault = () => {
    setSessionConfig(() => ({
      ...adminConfig.presets.default,
      presetId: "default",
      additionalSystemPrompt:
        adminConfig.presets.default.additionalSystemPrompt ?? "",
      appliedPreset: "default",
    }));
    triggerImpactWarning("reset");
  };

  if (!mounted) return null;

  return createPortal(
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
              {warningState.visible && (
                <DrawerInlineWarning
                  message={warningState.message}
                  onDismiss={() =>
                    setWarningState((prev) => ({ ...prev, visible: false }))
                  }
                />
              )}

              <SettingsSectionCoreSummary
                summary={adminConfig.baseSystemPromptSummary ?? ""}
              />

              <SettingsSectionDisplay />

              <SettingsSectionPresets
                adminConfig={adminConfig}
                sessionConfig={sessionConfig}
                helperText="The chosen preset cascades into the following engine, retrieval, and prompt controls."
                setSessionConfig={setSessionConfig}
                onDisruptiveChange={(key) => triggerImpactWarning(key)}
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
                  messages={messages}
                  onDisruptiveChange={(key) => triggerImpactWarning(key)}
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
    </>,
    document.body,
  );
}
