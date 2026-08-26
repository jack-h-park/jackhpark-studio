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
import { DrawerDisclosure } from "./DrawerDisclosure";
import { computeOverridesActive } from "./preset-overrides";
import { SettingsSectionContextHistory } from "./SettingsSectionContextHistory";
import { SettingsSectionDisplay } from "./SettingsSectionDisplay";
import { SettingsSectionModelEngine } from "./SettingsSectionModelEngine";
import { SettingsSectionOptionalOverrides } from "./SettingsSectionOptionalOverrides";
import { PresetSelectorTabs } from "./SettingsSectionPresets";
import { SettingsSectionRagRetrieval } from "./SettingsSectionRagRetrieval";

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
  // The drawer body is ~234 elements. Rendering it while closed cost a ~200ms
  // forced layout inside the hydration commit, so it is not mounted until the
  // first open; after that it stays mounted so reopening is cheap.
  const [everOpened, setEverOpened] = useState(false);
  // Drives the slide transform separately from `open` so the first open can
  // mount in the closed position and animate on the next frame.
  const [slidIn, setSlidIn] = useState(false);
  const isPresetActive = Boolean(
    sessionConfig.appliedPreset ?? sessionConfig.presetId,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setEverOpened(true);
      return;
    }
    setSlidIn(false);
  }, [open]);

  // Runs after the closed markup is committed, so the transform has a frame to
  // transition from. Without this the first open would appear with no animation.
  useEffect(() => {
    if (!open || !everOpened) return;
    const frame = requestAnimationFrame(() => setSlidIn(true));
    return () => cancelAnimationFrame(frame);
  }, [open, everOpened]);

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

  if (!mounted || !everOpened) return null;

  return createPortal(
    <>
      <div
        className={`${styles.overlay} ${slidIn ? styles.overlayVisible : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`${styles.drawer} ${slidIn ? styles.drawerVisible : ""}`}
        // The drawer stays mounted after its first open, so without `inert` its
        // ~17 controls remain focusable and in the tab order while it sits
        // off-screen. `inert` also hides the subtree from assistive tech.
        inert={!slidIn}
        role="dialog"
        aria-modal="true"
        aria-label="Chat settings"
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
                  Chat Settings
                </HeadingWithIcon>
                <StatusPill variant="muted">SESSION-WIDE</StatusPill>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close chat settings"
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
                          Preset
                          <ImpactTooltip text="Changing presets can affect retrieval, memory budgets, and response behavior for this session.">
                            <FiInfo aria-hidden="true" />
                          </ImpactTooltip>
                        </span>
                      </SectionTitle>
                    </div>
                    <p className="ai-setting-section-description">
                      Choose how answers balance speed, precision, and recall
                      for this session.
                    </p>
                    <div className={styles.presetSelector}>
                      <PresetSelectorTabs
                        adminConfig={adminConfig}
                        sessionConfig={sessionConfig}
                        setSessionConfig={setSessionConfig}
                      />
                    </div>
                  </div>
                  {isPresetActive && (
                    <DrawerDisclosure
                      title="Preset effects"
                      hint="What this preset configures behind the scenes"
                    >
                      <AdvancedSettingsPresetEffects
                        adminConfig={adminConfig}
                        sessionConfig={sessionConfig}
                      />
                    </DrawerDisclosure>
                  )}
                </Section>
              </div>

              <div className={styles.drawerSection}>
                <SettingsSectionDisplay />
              </div>

              <DrawerDisclosure
                title="Advanced"
                hint="Model, retrieval, and memory details"
              >
                <SettingsSectionOptionalOverrides
                  adminConfig={adminConfig}
                  sessionConfig={sessionConfig}
                  setSessionConfig={setSessionConfig}
                />

                {!isSettingLocked("embeddingModel") && (
                  <SettingsSectionModelEngine
                    adminConfig={adminConfig}
                    sessionConfig={sessionConfig}
                    setSessionConfig={setSessionConfig}
                  />
                )}

                {!isSettingLocked("rag") && (
                  <SettingsSectionRagRetrieval
                    adminConfig={adminConfig}
                    sessionConfig={sessionConfig}
                    setSessionConfig={setSessionConfig}
                  />
                )}

                <SettingsSectionContextHistory
                  adminConfig={adminConfig}
                  sessionConfig={sessionConfig}
                  setSessionConfig={setSessionConfig}
                  messages={messages}
                />
              </DrawerDisclosure>

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
