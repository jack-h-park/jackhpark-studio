import dynamic from "next/dynamic";

import { geistMono, geistSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import { ChainSection } from "./ChainSection";
import { Hero } from "./Hero";
import styles from "./landing.module.css";
import { LandingFooter } from "./LandingFooter";
import { PillarsGrid } from "./PillarsGrid";
import { ScopeDiscipline } from "./ScopeDiscipline";
import { SectionNav } from "./SectionNav";
import { SelectedWork } from "./SelectedWork";
import { Trajectory } from "./Trajectory";
import { useLandingMotion } from "./useLandingMotion";

// Kept out of the first-load bundle + client-only (WebGL). Mounts after the
// HTML paints so the hero headline owns LCP.
const MorphField = dynamic(
  () => import("./three/MorphField").then((m) => m.MorphField),
  { ssr: false },
);

export function LandingPage() {
  const rootRef = useLandingMotion();

  return (
    // data-theme="jp" is required: the type-scale/radius/font tokens used by
    // landing.module.css only exist under that scope (styles/jp-theme.css).
    <div
      ref={rootRef}
      data-theme="jp"
      className={cn(geistSans.variable, geistMono.variable, styles.page)}
    >
      {/* Fixed paint layer — outside the smoother so it can never be
          transformed away; owns the base background + ambient mesh. */}
      <div className={styles.vibeBackdrop} aria-hidden="true" />
      {/* Persistent page-wide particle field, above the mesh, below content.
          Self-bails on mobile / reduced motion. */}
      <MorphField />
      {/* Per-section atmosphere: its hue crossfades by chapter (data-atmo,
          driven in useLandingMotion). Behind content, over mesh + particles. */}
      <div className={styles.vibeAtmoTint} aria-hidden="true" />
      <SectionNav />
      {/* ScrollSmoother structure — wrapper/content pair (storyboard §4). */}
      <div data-smooth-wrapper className={styles.smoothWrapper}>
        <div data-smooth-content className={styles.smoothContent}>
          <Hero />
          <main className={styles.landingMain}>
            <ChainSection />
            <PillarsGrid />
            <ScopeDiscipline />
            <SelectedWork />
            <Trajectory />
            <LandingFooter />
          </main>
        </div>
      </div>
    </div>
  );
}
