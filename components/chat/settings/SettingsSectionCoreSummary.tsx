"use client";

type Props = {
  summary: string;
};

export function SettingsSectionCoreSummary({ summary }: Props) {
  return (
    <section className="settings-section">
      <p className="settings-section__title">Core System Behavior</p>
      <p className="settings-section__description">{summary}</p>
    </section>
  );
}
