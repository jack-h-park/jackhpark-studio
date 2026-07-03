import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { hero } from "@/content/landing";

import styles from "./landing.module.css";

const ParticleField = dynamic(
  () => import("./three/ParticleField").then((m) => m.ParticleField),
  { ssr: false },
);

function SubheadlineWithEmphasis() {
  const { subheadline, subheadlineEmphasis } = hero;
  const start = subheadline.indexOf(subheadlineEmphasis);

  if (start === -1) {
    return <>{subheadline}</>;
  }

  return (
    <>
      {subheadline.slice(0, start)}
      <em className={styles.heroSubEmphasis}>{subheadlineEmphasis}</em>
      {subheadline.slice(start + subheadlineEmphasis.length)}
    </>
  );
}

export function Hero() {
  // Hydrate the Three.js layer only after the browser is idle so the
  // HTML headline owns LCP (storyboard §5).
  const [fieldMounted, setFieldMounted] = useState(false);

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const mountWhenIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => setFieldMounted(true), {
          timeout: 2000,
        });
      } else {
        timeoutId = window.setTimeout(() => setFieldMounted(true), 200);
      }
    };

    // Background tabs never go idle — defer WebGL init until first visible.
    const onVisible = () => {
      document.removeEventListener("visibilitychange", onVisible);
      mountWhenIdle();
    };

    if (document.visibilityState === "visible") {
      mountWhenIdle();
    } else {
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <header className={styles.hero} id="top">
      {/* Static wash — the permanent fallback under the Three.js field. */}
      <div className={styles.heroWash} aria-hidden="true" />
      {fieldMounted && <ParticleField />}
      {/* Contrast scrim — above the field, below the text (storyboard §0). */}
      <div className={styles.heroScrim} aria-hidden="true" />
      <div className={styles.heroInner} data-speed="0.92">
        <p className={styles.eyebrow} data-anim="hero-eyebrow">
          {hero.eyebrow}
        </p>
        <h1 className={styles.heroHeadline} data-anim="hero-headline">
          {hero.headline}
        </h1>
        <p className={styles.heroSub} data-anim="hero-item">
          <SubheadlineWithEmphasis />
        </p>
        <p className={styles.heroPositioning} data-anim="hero-item">
          {hero.positioning}
        </p>
        <div className={styles.heroCtaRow} data-anim="hero-item">
          <Link href={hero.primaryCta.href} className={styles.buttonSecondary}>
            {hero.primaryCta.label}
          </Link>
          <Link
            href={hero.secondaryCta.href}
            className={styles.buttonTertiary}
          >
            <span className={styles.miniUnderline}>
              {hero.secondaryCta.label}
            </span>
          </Link>
        </div>
      </div>
      <div className={styles.scrollHint} aria-hidden="true" />
    </header>
  );
}
