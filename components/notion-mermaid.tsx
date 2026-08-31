"use client";

import * as React from "react";

const MERMAID_CDN_URL =
  "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

type MermaidRenderResult = { svg: string };

interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<MermaidRenderResult>;
}

let mermaidModulePromise: Promise<MermaidApi> | null = null;

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import(
      /* webpackIgnore: true */ MERMAID_CDN_URL
    ).then((mod) => (mod.default ?? mod) as MermaidApi);
  }
  return mermaidModulePromise;
}

interface MermaidDiagramProps {
  code: string;
  blockId?: string;
}

function isMindmap(code: string): boolean {
  return code.trimStart().startsWith("mindmap");
}

function isStudioIdentityMindmap(code: string): boolean {
  return isMindmap(code) && /root\(\([^)]*Jack H\. Park/.test(code);
}

function getMindmapBranches(code: string): string[] {
  const lines = code.split("\n");
  const rootIndex = lines.findIndex((line) =>
    line.trimStart().startsWith("root"),
  );

  if (rootIndex === -1) {
    return [];
  }

  return lines.slice(rootIndex + 1).flatMap((line) => {
    const match = /^ {4}(?! )(.+?)\s*$/.exec(line);
    return match ? [match[1]] : [];
  });
}

function getThemeValue(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim() || "currentColor";
}

function getMermaidColor(
  container: HTMLDivElement,
  styles: CSSStyleDeclaration,
  name: string,
): string {
  const sample = document.createElement("span");
  sample.style.color = getThemeValue(styles, name);
  container.append(sample);
  const computedColor = getComputedStyle(sample).color;
  sample.remove();

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");

  if (!context) {
    return computedColor;
  }

  context.fillStyle = computedColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function getMermaidConfig(container: HTMLDivElement): Record<string, unknown> {
  const styles = getComputedStyle(container);

  return {
    startOnLoad: false,
    theme: "base",
    mindmap: {
      padding: 20,
      useMaxWidth: true,
    },
    themeVariables: {
      primaryColor: getMermaidColor(container, styles, "--m-root-bg"),
      primaryTextColor: getMermaidColor(container, styles, "--m-root-fg"),
      primaryBorderColor: getMermaidColor(container, styles, "--m-root-border"),
      secondaryColor: getMermaidColor(container, styles, "--m-bg"),
      secondaryTextColor: getMermaidColor(container, styles, "--m-fg"),
      secondaryBorderColor: getMermaidColor(container, styles, "--m-border"),
      tertiaryColor: getMermaidColor(container, styles, "--m-bg"),
      tertiaryTextColor: getMermaidColor(container, styles, "--m-fg"),
      tertiaryBorderColor: getMermaidColor(container, styles, "--m-border"),
      lineColor: getMermaidColor(container, styles, "--m-line"),
      background: "transparent",
      fontSize: getThemeValue(styles, "--m-font-size"),
      fontFamily: getThemeValue(styles, "--m-font-family"),
    },
  };
}

function createSvgOverride(
  svgId: string,
  styles: CSSStyleDeclaration,
  identityMap: boolean,
): string {
  const rootBg = getThemeValue(styles, "--m-root-bg");
  const rootBorder = getThemeValue(styles, "--m-root-border");
  const rootFg = getThemeValue(styles, "--m-root-fg");
  const bg = getThemeValue(styles, "--m-bg");
  const border = getThemeValue(styles, "--m-border");
  const fg = getThemeValue(styles, "--m-fg");
  const line = getThemeValue(styles, "--m-line");
  const fontSize = getThemeValue(styles, "--m-font-size");
  const rootFontSize = getThemeValue(styles, "--m-root-font-size");
  const fontWeight = getThemeValue(styles, "--m-font-weight");
  const rootFontWeight = getThemeValue(styles, "--m-root-font-weight");
  const branchTokens = identityMap
    ? ["leadership", "platform", "proof", "craft", "ecosystem"]
    : [];
  const branchStyles = branchTokens
    .map((token, index) => {
      const branchColor = getThemeValue(styles, `--m-branch-${token}`);

      return `
      #${svgId} .mindmap-node.section-${index} rect,
      #${svgId} .mindmap-node.section-${index} circle,
      #${svgId} .mindmap-node.section-${index} ellipse,
      #${svgId} .mindmap-node.section-${index} polygon,
      #${svgId} .mindmap-node.section-${index} path {
        stroke: ${branchColor} !important;
      }
    `;
    })
    .join("\n");

  return `
    #${svgId} .mindmap-node rect,
    #${svgId} .mindmap-node circle,
    #${svgId} .mindmap-node ellipse,
    #${svgId} .mindmap-node polygon,
    #${svgId} .mindmap-node path {
      fill: ${bg} !important;
      stroke: ${border} !important;
    }

    #${svgId} .mindmap-edges path,
    #${svgId} .mindmap-edges line {
      fill: none !important;
      stroke: ${line} !important;
    }

    #${svgId} .mindmap-node text,
    #${svgId} .mindmap-node tspan {
      fill: ${fg} !important;
      font-size: ${fontSize} !important;
      font-weight: ${fontWeight} !important;
    }

    #${svgId} .mindmap-node foreignObject,
    #${svgId} .mindmap-node foreignObject * {
      color: ${fg} !important;
    }

    #${svgId} .mindmap-node.section-root rect,
    #${svgId} .mindmap-node.section-root circle,
    #${svgId} .mindmap-node.section-root ellipse,
    #${svgId} .mindmap-node.section-root polygon,
    #${svgId} .mindmap-node.section-root path {
      fill: ${rootBg} !important;
      stroke: ${rootBorder} !important;
    }

    #${svgId} .mindmap-node.section-root text,
    #${svgId} .mindmap-node.section-root tspan {
      fill: ${rootFg} !important;
      font-size: ${rootFontSize} !important;
      font-weight: ${rootFontWeight} !important;
    }

    #${svgId} .mindmap-node.section-root foreignObject,
    #${svgId} .mindmap-node.section-root foreignObject * {
      color: ${rootFg} !important;
    }

    ${branchStyles}
  `;
}

export function MermaidDiagram({ code, blockId }: MermaidDiagramProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = React.useState(false);
  const [isMapOpen, setIsMapOpen] = React.useState(false);
  const mindmap = isMindmap(code);
  const identityMap = isStudioIdentityMindmap(code);
  const branches = React.useMemo(() => getMindmapBranches(code), [code]);

  React.useEffect(() => {
    if (!identityMap) {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const updateCompactState = () => setIsCompact(mediaQuery.matches);

    updateCompactState();
    mediaQuery.addEventListener("change", updateCompactState);
    return () => mediaQuery.removeEventListener("change", updateCompactState);
  }, [identityMap]);

  React.useEffect(() => {
    if (!isCompact) {
      setIsMapOpen(false);
    }
  }, [isCompact]);

  const shouldRenderMap = !identityMap || !isCompact || isMapOpen;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !shouldRenderMap || !code) {
      return;
    }

    let isMounted = true;
    const themeObservers: MutationObserver[] = [];

    const renderMermaid = async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize(getMermaidConfig(container));

        const sanitizedId = `mermaid-${(blockId ?? "unknown").replaceAll("-", "")}`;
        const { svg } = await mermaid.render(sanitizedId, code);

        if (!isMounted) {
          return;
        }

        container.innerHTML = svg;
        const svgElement = container.querySelector("svg");
        if (!svgElement) {
          return;
        }

        const applyTheme = () => {
          const svgId = svgElement.getAttribute("id") ?? sanitizedId;
          let overrideStyle = svgElement.querySelector<SVGStyleElement>(
            "style[data-mermaid-override]",
          );

          if (!overrideStyle) {
            overrideStyle = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "style",
            );
            overrideStyle.dataset.mermaidOverride = "true";
            svgElement.append(overrideStyle);
          }

          overrideStyle.textContent = createSvgOverride(
            svgId,
            getComputedStyle(container),
            identityMap,
          );
        };

        applyTheme();

        const watchThemeChanges = (target: Element | null) => {
          if (!target) {
            return;
          }

          const observer = new MutationObserver(applyTheme);
          observer.observe(target, {
            attributes: true,
            attributeFilter: ["class", "data-theme"],
          });
          themeObservers.push(observer);
        };

        watchThemeChanges(container.closest(".notion"));
        watchThemeChanges(document.body);
        watchThemeChanges(document.documentElement);
      } catch (err) {
        console.error("Failed to render Mermaid diagram.", err);
        if (isMounted) {
          container.textContent = code;
        }
      }
    };

    container.innerHTML = "";
    void renderMermaid();

    return () => {
      isMounted = false;
      for (const observer of themeObservers) {
        observer.disconnect();
      }
    };
  }, [blockId, code, identityMap, shouldRenderMap]);

  const className = [
    "notion-mermaid",
    mindmap ? "notion-mermaid--mindmap" : "",
    identityMap ? "notion-mermaid--identity-map" : "",
    isMapOpen ? "notion-mermaid--expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={className}>
      {identityMap && isCompact ? (
        <div className="notion-mermaid__summary">
          <p className="notion-mermaid__eyebrow">Professional profile</p>
          <ul aria-label="Mindmap overview">
            {branches.map((branch) => (
              <li key={branch}>{branch}</li>
            ))}
          </ul>
          <button
            aria-expanded={isMapOpen}
            className="notion-mermaid__expand"
            onClick={() => setIsMapOpen((open) => !open)}
            type="button"
          >
            {isMapOpen ? "Hide full map" : "Explore full map"}
          </button>
        </div>
      ) : null}
      <div
        aria-hidden={mindmap}
        aria-label={mindmap ? undefined : "Mermaid diagram"}
        className="notion-mermaid__canvas"
        ref={containerRef}
        role={mindmap ? undefined : "img"}
      />
      {mindmap ? (
        <>
          <figcaption className="notion-mermaid__caption">
            A concise map of Jack H. Park&apos;s product leadership, platform
            work, outcomes, and partners.
          </figcaption>
          <ul className="notion-mermaid__accessible-summary">
            {branches.map((branch) => (
              <li key={branch}>{branch}</li>
            ))}
          </ul>
        </>
      ) : null}
    </figure>
  );
}
