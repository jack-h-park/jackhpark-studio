import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { FiSettings } from "@react-icons/all-files/fi/FiSettings";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useChatConfig } from "@/components/chat/context/ChatConfigContext";
import { type ChatMessage } from "@/components/chat/hooks/useChatSession";
import { Button } from "@/components/ui/button";
import { HeadingWithIcon } from "@/components/ui/heading-with-icon";
import { ImpactTooltip } from "@/components/ui/impact-tooltip";
import { Section, SectionTitle } from "@/components/ui/section";
import { StatusPill } from "@/components/ui/status-pill";
import { isSettingLocked } from "@/lib/shared/chat-settings-policy";

import { AdvancedSettingsPresetEffects } from "./AdvancedSettingsPresetEffects";
import styles from "./ChatAdvancedSettingsDrawer.module.css";
import { computeOverridesActive } from "./preset-overrides";
import { SettingsSectionContextHistory } from "./SettingsSectionContextHistory";
import { SettingsSectionDisplay } from "./SettingsSectionDisplay";
import { SettingsSectionModelEngine } from "./SettingsSectionModelEngine";
import { SettingsSectionOptionalOverrides } from "./SettingsSectionOptionalOverrides";
import { PresetSelectorTabs } from "./SettingsSectionPresets";
import { SettingsSectionRagRetrieval } from "./SettingsSectionRagRetrieval";

const hasCascadeChildren =
  !isSettingLocked("embeddingModel") || !isSettingLocked("rag");

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

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const resetToDefault = () => {
    setSessionConfig(() => ({
      ...adminConfig.presets.default,
      presetId: "default",
      additionalSystemPrompt:
        adminConfig.presets.default.additionalSystemPrompt ?? "",
      appliedPreset: "default",
    }));
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
              <div className="flex items-center gap-2">
                <HeadingWithIcon
                  as="h2"
                  icon={<FiSettings aria-hidden="true" />}
                  className={styles.drawerTitle}
                >
                  Advanced Settings
                </HeadingWithIcon>
                <StatusPill variant="muted">SESSION-WIDE</StatusPill>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close advanced settings"
                className={styles.drawerCloseButton}
              >
                ✕
              </Button>
            </div>
            <div className={`${styles.content} gap-4`}>
              <div className={styles.drawerSection}>
                <Section className={styles.presetScope}>
                  <div className={styles.presetScopeHeader}>
                    <div className={styles.presetScopeTop}>
                      <SectionTitle
                        as="p"
                        icon={<FiLayers aria-hidden="true" />}
                      >
                        <span className="flex items-center gap-2">
                          AI Orchestration Preset
                          <ImpactTooltip text="Changing presets can affect retrieval, memory budgets, and response behavior for this session.">
                            <FiInfo aria-hidden="true" />
                          </ImpactTooltip>
                        </span>
                      </SectionTitle>
                    </div>
                    <p className="ai-setting-section-description">
                      Preset controls retrieval, memory, and prompt behavior for
                      this session.
                    </p>
                    <div className={styles.presetSelector}>
                      <PresetSelectorTabs
                        adminConfig={adminConfig}
                        sessionConfig={sessionConfig}
                        setSessionConfig={setSessionConfig}
                      />
                    </div>
                  </div>
                  <div className={styles.presetScopeChildren}>
                    <div
                      className={`${styles.presetScopeSection} ${styles.presetEffectsWrapper}`}
                    >
                      <AdvancedSettingsPresetEffects
                        adminConfig={adminConfig}
                        sessionConfig={sessionConfig}
                      />
                    </div>

                    <div className={styles.presetScopeSection}>
                      <SettingsSectionContextHistory
                        adminConfig={adminConfig}
                        sessionConfig={sessionConfig}
                        setSessionConfig={setSessionConfig}
                        messages={messages}
                      />
                    </div>

                    <div className={styles.presetScopeSection}>
                      <SettingsSectionOptionalOverrides
                        adminConfig={adminConfig}
                        sessionConfig={sessionConfig}
                        setSessionConfig={setSessionConfig}
                      />
                    </div>
                  </div>
                </Section>
              </div>

              {hasCascadeChildren && <div className={`${styles.cascade}`}>
                {!isSettingLocked("embeddingModel") && (
                  <div className={styles.drawerSection}>
                    <SettingsSectionModelEngine
                      adminConfig={adminConfig}
                      sessionConfig={sessionConfig}
                      setSessionConfig={setSessionConfig}
                    />
                  </div>
                )}

                {!isSettingLocked("rag") && (
                  <div className={styles.drawerSection}>
                    <SettingsSectionRagRetrieval
                      adminConfig={adminConfig}
                      sessionConfig={sessionConfig}
                      setSessionConfig={setSessionConfig}
                    />
                  </div>
                )}
              </div>}

              <div className={styles.drawerSection}>
                <SettingsSectionDisplay />
              </div>

              {computeOverridesActive({ adminConfig, sessionConfig }) && (
                <div className="pt-4">
                  <div
                    className={`${styles.drawerDivider} ${styles.drawerDividerSpacing}`}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={resetToDefault}
                  >
                    Reset to Preset Defaults
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
