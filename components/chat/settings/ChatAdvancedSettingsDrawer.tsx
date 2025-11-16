"use client";

import { useChatConfig } from "@/components/chat/context/ChatConfigContext";

import { SettingsSectionContextHistory } from "./SettingsSectionContextHistory";
import { SettingsSectionCoreSummary } from "./SettingsSectionCoreSummary";
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

  const resetToDefault = () =>
    setSessionConfig(() => ({
      ...adminConfig.presets.default,
      appliedPreset: "default",
    }));

  return (
    <>
      <div
        className={`drawer-overlay ${open ? "drawer-overlay--visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`drawer-panel ${open ? "drawer-panel--visible" : ""}`}
      >
        <div className="drawer-panel__inner">
          <div className="drawer-panel__header">
            <h2 className="drawer-panel__title">Advanced Settings</h2>
            <button
              onClick={onClose}
              className="drawer-panel__close"
              aria-label="Close advanced settings"
            >
              ✕
            </button>
          </div>
          <div className="drawer-panel__content">
            <SettingsSectionCoreSummary
              summary={adminConfig.coreSystemPromptSummary}
            />

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
      <style jsx>{`
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
          z-index: 90;
        }
        .drawer-overlay--visible {
          opacity: 1;
          pointer-events: auto;
        }
        .drawer-panel {
          position: fixed;
          inset-y: 0;
          right: 0;
          width: min(100%, 420px);
          background: #ffffff;
          box-shadow: -12px 0 40px rgba(15, 23, 42, 0.2);
          border-left: 1px solid #e2e8f0;
          transition: transform 0.3s ease;
          transform: translateX(100%);
          z-index: 100;
        }
        .drawer-panel--visible {
          transform: translateX(0);
        }
        .drawer-panel__inner {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .drawer-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .drawer-panel__title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: #0f172a;
        }
        .drawer-panel__close {
          border: none;
          background: transparent;
          font-size: 1rem;
          cursor: pointer;
          padding: 4px 8px;
        }
        .drawer-panel__content {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .settings-section__reset {
          width: 100%;
          border-radius: 12px;
          border: 1px solid #cbd5f5;
          padding: 10px 16px;
          background: #fff;
          font-weight: 600;
          color: #0f172a;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .settings-section__reset:hover {
          border-color: #94a3b8;
          background: #f8fafc;
        }
        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .settings-section__title {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #475569;
        }
        .settings-section__description {
          margin: 0;
          font-size: 0.95rem;
          color: #0f172a;
          line-height: 1.4;
        }
        .settings-section__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .settings-section__field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.9rem;
          color: #0f172a;
        }
        .settings-section__field-row {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
          color: #475569;
          font-size: 0.85rem;
        }
        .settings-section__input,
        .settings-section__select,
        .settings-section__number,
        .settings-section__textarea {
          border-radius: 10px;
          border: 1px solid #cbd5f5;
          background: #f8fafc;
          padding: 10px 12px;
          font-size: 0.9rem;
          color: #0f172a;
          font-family: inherit;
        }
        .settings-section__input:focus,
        .settings-section__select:focus,
        .settings-section__number:focus,
        .settings-section__textarea:focus {
          outline: none;
          border-color: #94a3b8;
          background: #ffffff;
        }
        .settings-section__grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .settings-section__preset {
          flex: 1;
          border-radius: 12px;
          border: 1px solid #cbd5f5;
          padding: 10px 12px;
          font-weight: 600;
          background: #fff;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
        }
        .settings-section__preset--active {
          background: #0f172a;
          color: #fff;
          border-color: #0f172a;
        }
        .settings-section__hint {
          margin: 0;
          font-size: 0.75rem;
          color: #64748b;
        }
        .settings-section__range {
          width: 100%;
          margin-top: 4px;
        }
        .settings-section__checkbox {
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          cursor: pointer;
          font-weight: 500;
          color: #0f172a;
        }
        .settings-section__checkbox input {
          accent-color: #0f172a;
        }
        .settings-section__radio-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .settings-section__radio {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          cursor: pointer;
        }
        .settings-section__radio input {
          accent-color: #0f172a;
        }
        .settings-section__radio .description {
          font-size: 0.75rem;
          color: #64748b;
        }
      `}</style>
    </>
  );
}
