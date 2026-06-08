"use client";

import * as React from "react";

const MERMAID_CDN_URL =
  "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

let mermaidModulePromise: Promise<any> | null = null;

async function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import(
      /* webpackIgnore: true */ MERMAID_CDN_URL
    ).then((mod) => mod.default ?? mod);
  }
  return mermaidModulePromise;
}

interface MermaidDiagramProps {
  code: string;
  blockId?: string;
}

export function MermaidDiagram({ code, blockId }: MermaidDiagramProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let isMounted = true;
    let svgObserver: MutationObserver | null = null;
    const themeObservers: MutationObserver[] = [];

    const renderMermaid = async () => {
      if (!code) {
        return;
      }

      try {
        const mermaid = await loadMermaid();

        const initDark =
          document.body?.classList.contains("dark-mode") ||
          document.documentElement?.dataset.theme === "dark" ||
          !!containerRef.current?.closest(".dark-mode, .notion-dark-theme, [data-theme='dark']");

        mermaid.initialize?.({
          startOnLoad: false,
          theme: "base",
          mindmap: {
            padding: 16,
            useMaxWidth: true,
          },
          themeVariables: initDark
            ? {
                primaryColor: "#412454",
                primaryTextColor: "#f2f0ea",
                primaryBorderColor: "#b439df",
                secondaryColor: "#252525",
                secondaryTextColor: "#f2f0ea",
                secondaryBorderColor: "#5b8def",
                tertiaryColor: "#252525",
                tertiaryTextColor: "#b4b2a9",
                tertiaryBorderColor: "#4b4842",
                lineColor: "#4b4842",
                background: "#191919",
                fontSize: "13px",
                fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
              }
            : {
                primaryColor: "#eae4f2",
                primaryTextColor: "#191919",
                primaryBorderColor: "#b439df",
                secondaryColor: "#ddebf1",
                secondaryTextColor: "#191919",
                secondaryBorderColor: "#5b8def",
                tertiaryColor: "#f7f6f3",
                tertiaryTextColor: "#191919",
                tertiaryBorderColor: "#efeeea",
                lineColor: "#9b9a97",
                background: "#ffffff",
                fontSize: "13px",
                fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
              },
        });

        const sanitizedId = `mermaid-${(blockId ?? "unknown").replaceAll("-", "")}`;
        const { svg } = await mermaid.render(sanitizedId, code);

        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgElement = containerRef.current.querySelector("svg");

          if (svgElement) {
            const sanitizeSvg = () => {
              svgElement.dataset.processedMermaid = "";

              const shapeNodes = svgElement.querySelectorAll(
                "rect, circle, ellipse, polygon, polyline, path",
              );
              for (const shape of shapeNodes) {
                shape.removeAttribute("fill");
                shape.removeAttribute("stroke");
                if (shape instanceof SVGElement) {
                  shape.style.removeProperty("fill");
                  shape.style.removeProperty("stroke");
                }
              }

              const textNodes = svgElement.querySelectorAll("text, tspan");
              for (const textNode of textNodes) {
                textNode.removeAttribute("fill");
                if (textNode instanceof SVGElement) {
                  textNode.style.removeProperty("fill");
                }
              }

              const svgId = svgElement.getAttribute("id") ?? sanitizedId;
              const container = containerRef.current;
              const styles = container ? getComputedStyle(container) : null;

              const isDarkMode = Boolean(
                document.body?.classList.contains("dark-mode") ||
                document.documentElement?.dataset.theme === "dark" ||
                svgElement.closest(".dark-mode, .notion-dark-theme, [data-theme='dark']"),
              );

              const defaultPalette = isDarkMode
                ? {
                    bg: "#252525",
                    border: "#4b4842",
                    fg: "#f2f0ea",
                  }
                : {
                    bg: "#f7f6f3",
                    border: "#c2bdb0",
                    fg: "#191919",
                  };

              const getColor = (
                name: string,
                fallback: string = defaultPalette.bg,
              ) => {
                const value = styles?.getPropertyValue(name)?.trim();
                return value && value.length > 0 ? value : fallback;
              };

              const baseFontSize =
                styles?.getPropertyValue("--m-font-size")?.trim() || "1rem";
              const baseRootFontSize =
                styles?.getPropertyValue("--m-root-font-size")?.trim() ||
                baseFontSize ||
                "1.05rem";
              const baseFontWeight =
                styles?.getPropertyValue("--m-font-weight")?.trim() || "600";
              const baseRootFontWeight =
                styles?.getPropertyValue("--m-root-font-weight")?.trim() ||
                baseFontWeight ||
                "600";

              const colors = {
                bg: getColor("--m-bg", defaultPalette.bg),
                border: getColor("--m-border", defaultPalette.border),
                fg: getColor("--m-fg", defaultPalette.fg),
                rootBg: getColor(
                  "--m-root-bg",
                  getColor("--m-bg", defaultPalette.bg),
                ),
                rootBorder: getColor(
                  "--m-root-border",
                  getColor("--m-border", defaultPalette.border),
                ),
                rootFg: getColor(
                  "--m-root-fg",
                  getColor("--m-fg", defaultPalette.fg),
                ),
                fontSize: baseFontSize,
                rootFontSize: baseRootFontSize,
                fontWeight: baseFontWeight,
                rootFontWeight: baseRootFontWeight,
              };

              let overrideStyle = svgElement.querySelector<SVGStyleElement>(
                "style[data-mermaid-override]",
              );

              const overrideCss = `
                #${svgId} {
                  fill: ${colors.bg} !important;
                }

                #${svgId} rect,
                #${svgId} circle,
                #${svgId} ellipse,
                #${svgId} polygon,
                #${svgId} polyline {
                  fill: ${colors.bg} !important;
                  stroke: ${colors.border} !important;
                }

                #${svgId} .node path,
                #${svgId} .label-container {
                  fill: ${colors.bg} !important;
                  stroke: ${colors.border} !important;
                }

                #${svgId} .flowchart-link,
                #${svgId} .edgePaths path,
                #${svgId} .arrowMarkerPath,
                #${svgId} line {
                  fill: none !important;
                  stroke: ${colors.border} !important;
                }

                #${svgId} text,
                #${svgId} tspan {
                  fill: ${colors.fg} !important;
                  font-size: ${colors.fontSize} !important;
                  font-weight: ${colors.fontWeight} !important;
                }

                #${svgId} foreignObject .label,
                #${svgId} foreignObject span,
                #${svgId} foreignObject p,
                #${svgId} foreignObject div {
                  color: ${colors.fg} !important;
                }

                #${svgId} foreignObject .edgeLabel,
                #${svgId} foreignObject .labelBkg {
                  background-color: transparent !important;
                }

                #${svgId} .section-root rect,
                #${svgId} .section-root circle,
                #${svgId} .section-root ellipse,
                #${svgId} .section-root path,
                #${svgId} .section-root polygon,
                #${svgId} .section-root polyline {
                  fill: ${colors.rootBg} !important;
                  stroke: ${colors.rootBorder} !important;
                }

                #${svgId} .section-root text,
                #${svgId} .section-root tspan {
                  fill: ${colors.rootFg} !important;
                  font-size: ${colors.rootFontSize} !important;
                  font-weight: ${colors.rootFontWeight} !important;
                }

                #${svgId} .section-root foreignObject .label,
                #${svgId} .section-root foreignObject span,
                #${svgId} .section-root foreignObject p,
                #${svgId} .section-root foreignObject div {
                  color: ${colors.rootFg} !important;
                }
              `;

              if (!overrideStyle) {
                overrideStyle = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "style",
                );
                overrideStyle.dataset.mermaidOverride = "true";
                svgElement.append(overrideStyle);
              }

              overrideStyle.textContent = overrideCss;

              // When Mermaid sets a natural max-width (e.g. mindmaps), the CSS
              // width:100% compresses nodes together causing overlap. Scale to
              // 72% of the natural width so the diagram fits more compactly;
              // the container's overflow-x:auto handles any remaining overflow.
              const naturalMaxWidth = svgElement.style.maxWidth;
              if (naturalMaxWidth) {
                const naturalPx = parseFloat(naturalMaxWidth);
                const containerPx = containerRef.current?.getBoundingClientRect().width ?? 0;
                if (!Number.isNaN(naturalPx) && naturalPx > containerPx) {
                  const scaledPx = Math.round(naturalPx * 0.72);
                  svgElement.style.width = `${scaledPx}px`;
                }
              }
            };

            sanitizeSvg();

            svgObserver = new MutationObserver(() => {
              sanitizeSvg();
            });

            svgObserver.observe(svgElement, {
              subtree: true,
              attributes: true,
              attributeFilter: ["style", "fill", "stroke", "class"],
            });

            const watchThemeChanges = (target: Element | null) => {
              if (!target) {
                return;
              }

              const themeObserver = new MutationObserver(() => {
                sanitizeSvg();
              });

              themeObserver.observe(target, {
                attributes: true,
                attributeFilter: ["class", "data-theme"],
              });

              themeObservers.push(themeObserver);
            };

            watchThemeChanges(containerRef.current);
            watchThemeChanges(containerRef.current?.parentElement);
            watchThemeChanges(containerRef.current?.closest(".notion"));
            watchThemeChanges(containerRef.current?.closest("[data-theme]"));
            watchThemeChanges(document.body);
            watchThemeChanges(document.documentElement);
          }
        }
      } catch (err) {
        console.error("Failed to render mermaid diagram.", err);
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = "";
          const pre = document.createElement("pre");
          pre.textContent = code;
          containerRef.current.append(pre);
        }
      }
    };

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }

    void renderMermaid();

    return () => {
      isMounted = false;
      if (svgObserver) {
        svgObserver.disconnect();
        svgObserver = null;
      }
      for (const observer of themeObservers) {
        observer.disconnect();
      }
    };
  }, [blockId, code]);

  return (
    <div
      aria-label="Mermaid diagram"
      className="notion-mermaid"
      ref={containerRef}
      role="img"
    />
  );
}
