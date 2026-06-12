import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useEffect, useRef } from "react";

/**
 * Scroll-motion layer for the landing page (storyboard §4).
 *
 * Everything animates FROM an offset back to the markup's final state, so
 * the page is complete without JS and under prefers-reduced-motion — the
 * matchMedia block simply never runs and the static markup stands.
 */
export function useLandingMotion() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      let disposed = false;
      const splits: SplitText[] = [];

      const ctx = gsap.context(() => {
        // ── Inertia scrolling + data-speed/data-lag parallax ────────
        // Wheel only (smoothTouch stays 0) so mobile keeps native scroll.
        ScrollSmoother.create({
          wrapper: "[data-smooth-wrapper]",
          content: "[data-smooth-content]",
          smooth: 1.2,
          effects: true,
        });

        // ── Hero: eyebrow → headline lines → supporting items ──────
        const headline = root.querySelector<HTMLElement>(
          '[data-anim="hero-headline"]',
        );
        // Split only after webfonts settle so line boxes are final (CLS guard).
        void document.fonts.ready.then(() => {
          if (disposed || !headline) return;
          ctx.add(() => {
            // mask:"lines" wraps each line in an overflow-hidden clip, so
            // lines rise from behind their own baseline (premium reveal).
            const split = new SplitText(headline, {
              type: "lines",
              mask: "lines",
            });
            splits.push(split);
            gsap
              .timeline({ defaults: { ease: "power3.out" } })
              .from('[data-anim="hero-eyebrow"]', {
                autoAlpha: 0,
                y: 16,
                duration: 0.5,
              })
              .from(
                split.lines,
                { yPercent: 110, duration: 0.9, stagger: 0.1 },
                "-=0.2",
              )
              .from(
                '[data-anim="hero-item"]',
                { autoAlpha: 0, y: 16, duration: 0.6, stagger: 0.1 },
                "-=0.5",
              );
          });
        });

        // ── The Chain: scrubbed sequential node reveal ──────────────
        gsap.from('[data-anim="chain-node"]', {
          autoAlpha: 0,
          y: 24,
          stagger: 0.25,
          ease: "none",
          scrollTrigger: {
            trigger: '[data-anim="chain-node"]',
            start: "top 80%",
            end: "+=400",
            scrub: 1,
          },
        });
        gsap.from('[data-anim="chain-outro"]', {
          autoAlpha: 0,
          y: 16,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: {
            trigger: '[data-anim="chain-outro"]',
            start: "top 85%",
          },
        });
        // The Full-gradient divider draws left → right.
        gsap.from('[data-anim="chain-divider"]', {
          scaleX: 0,
          transformOrigin: "left center",
          ease: "none",
          scrollTrigger: {
            trigger: '[data-anim="chain-divider"]',
            start: "top 95%",
            end: "top 70%",
            scrub: 1,
          },
        });

        // ── Pillars: play-once batch stagger ────────────────────────
        gsap.from('[data-anim="pillar-card"]', {
          autoAlpha: 0,
          y: 16,
          duration: 0.5,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: '[data-anim="pillar-card"]',
            start: "top 78%",
          },
        });

        // ── Scope: statement read at scroll speed, word by word ─────
        const statement = root.querySelector<HTMLElement>(
          '[data-anim="scope-statement"]',
        );
        if (statement) {
          const split = new SplitText(statement, { type: "words" });
          splits.push(split);
          gsap.from(split.words, {
            autoAlpha: 0.12,
            stagger: 0.04,
            ease: "none",
            scrollTrigger: {
              trigger: statement,
              start: "top 78%",
              end: "bottom 45%",
              scrub: true,
            },
          });
        }
        gsap.from('[data-anim="scope-costs"]', {
          autoAlpha: 0,
          y: 16,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: {
            trigger: '[data-anim="scope-costs"]',
            start: "top 82%",
          },
        });

        // ── Selected Work: card entrances + stat count-ups ──────────
        for (const card of gsap.utils.toArray<HTMLElement>(
          '[data-anim="work-card"]',
        )) {
          gsap.from(card, {
            autoAlpha: 0,
            y: 24,
            duration: 0.6,
            ease: "power3.out",
            scrollTrigger: { trigger: card, start: "top 82%" },
          });
        }
        for (const stat of gsap.utils.toArray<HTMLElement>("[data-count]")) {
          const raw = stat.dataset.value ?? "0";
          const target = Number(raw);
          if (!Number.isFinite(target)) continue;
          const decimals = raw.split(".")[1]?.length ?? 0;
          const prefix = stat.dataset.prefix ?? "";
          const suffix = stat.dataset.suffix ?? "";
          const counter = { value: 0 };
          gsap.to(counter, {
            value: target,
            duration: 1.2,
            ease: "power2.out",
            scrollTrigger: { trigger: stat, start: "top 88%", once: true },
            onUpdate() {
              stat.textContent = `${prefix}${counter.value.toFixed(decimals)}${suffix}`;
            },
          });
        }

        // ── Trajectory: progress line scrubbed to scroll ────────────
        gsap.from('[data-anim="timeline-progress"]', {
          scaleY: 0,
          transformOrigin: "top center",
          ease: "none",
          scrollTrigger: {
            trigger: '[data-anim="timeline-wrap"]',
            start: "top 75%",
            end: "bottom 60%",
            scrub: true,
          },
        });
        for (const item of gsap.utils.toArray<HTMLElement>(
          '[data-anim="timeline-item"]',
        )) {
          gsap.from(item, {
            autoAlpha: 0,
            x: -12,
            duration: 0.5,
            ease: "power3.out",
            scrollTrigger: { trigger: item, start: "top 85%" },
          });
        }

        // ── Closing: quiet entrance, CTA scale-in ───────────────────
        gsap.from('[data-anim="closing-headline"]', {
          autoAlpha: 0,
          y: 16,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: {
            trigger: '[data-anim="closing-headline"]',
            start: "top 82%",
          },
        });
        gsap.from('[data-anim="closing-cta"]', {
          autoAlpha: 0,
          scale: 0.96,
          duration: 0.5,
          ease: "power3.out",
          scrollTrigger: {
            trigger: '[data-anim="closing-cta"]',
            start: "top 88%",
          },
        });
      }, root);

      return () => {
        disposed = true;
        for (const split of splits) split.revert();
        ctx.revert();
      };
    });

    return () => mm.revert();
  }, []);

  return rootRef;
}
