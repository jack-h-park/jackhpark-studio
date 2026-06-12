import { geistMono, geistSans } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import { ChainSection } from "./ChainSection";
import { Hero } from "./Hero";
import styles from "./landing.module.css";
import { LandingFooter } from "./LandingFooter";
import { PillarsGrid } from "./PillarsGrid";
import { ScopeDiscipline } from "./ScopeDiscipline";
import { SelectedWork } from "./SelectedWork";
import { Trajectory } from "./Trajectory";
import { useLandingMotion } from "./useLandingMotion";

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
      {/* ScrollSmoother structure — wrapper/content pair (storyboard §4). */}
      <div data-smooth-wrapper>
        <div data-smooth-content>
          <Hero />
          <main>
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
