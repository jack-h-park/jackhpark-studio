/* @ds-bundle: {"format":3,"namespace":"JHPStudioDesignSystem_70185e","components":[{"name":"JhpMark","sourcePath":"assets/logo/JhpMark.tsx"}],"sourceHashes":{"assets/logo/JhpMark.tsx":"2d96f1ea7d2c","ui_kits/BrandMark.jsx":"80a8efaa4b71","ui_kits/PhosphorIcons.jsx":"8b6f81f21ec0","ui_kits/lab/ChatAssistantScreen.jsx":"14885a2dbad2","ui_kits/lab/ChatConfigScreen.jsx":"014bc6504982","ui_kits/lab/DocumentsScreen.jsx":"005c89b662fe","ui_kits/lab/IngestionScreen.jsx":"e1f359666079","ui_kits/lab/Primitives.jsx":"94f6f5324c6a","ui_kits/lab/Shell.jsx":"ba70a0c695d7","ui_kits/studio/Article.jsx":"2961b8051ffc","ui_kits/studio/ChatWidget.jsx":"7831cf553134","ui_kits/studio/Footer.jsx":"a19071e5071b","ui_kits/studio/Header.jsx":"9f57a928d31d","ui_kits/studio/HomeIndex.jsx":"36b474b0d3cd","ui_kits/studio/Icons.jsx":"625828b5a411"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.JHPStudioDesignSystem_70185e = window.JHPStudioDesignSystem_70185e || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/logo/JhpMark.tsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const files = {
  primary: 'jhp-mark-primary.svg',
  small: 'jhp-mark-small.svg',
  opticalBold: 'jhp-mark-optical-bold.svg',
  monoInk: 'jhp-mark-mono-ink.svg',
  monoInverse: 'jhp-mark-mono-inverse.svg',
  transparentInk: 'jhp-mark-transparent-ink.svg',
  transparentWhite: 'jhp-mark-transparent-white.svg'
};
function JhpMark({
  variant = 'primary',
  assetBasePath = '/assets/brand',
  alt = 'Jack H. Park Studio JHP mark',
  ...props
}) {
  const base = assetBasePath.replace(/\/$/, '');
  return /*#__PURE__*/React.createElement("img", _extends({
    src: `${base}/${files[variant]}`,
    alt: alt
  }, props));
}
Object.assign(__ds_scope, { JhpMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/logo/JhpMark.tsx", error: String((e && e.message) || e) }); }

// ui_kits/BrandMark.jsx
try { (() => {
/* global React */
/* ============================================================
   JHP Studio brand marks (React) — implements Brand Guide §2

   Three variants, all driven from the same gradient definition:
     <BrandMark variant="primary"        />  // gradient on light/dark bg
     <BrandMark variant="filled-icon"    />  // approved JHP mark (rounded square, embedded-H)
     <BrandWordmark size="lg|md|sm"      />  // workmark + STUDIO tag
     <BrandLockup  size="lg|md|sm"       />  // filled icon + workmark

   The hyphen rect x/y is computed from rendered J and P bboxes
   (per §2.3 — DO NOT hardcode position).
   ============================================================ */

const {
  useId,
  useRef,
  useLayoutEffect,
  useState
} = React;

// Resolve the approved-asset directory relative to THIS script's own URL, so
// the visual-locked marks load correctly regardless of the consuming page's
// depth (preview/, ui_kits/studio/, ui_kits/lab/, …). BrandMark.jsx always
// lives at <root>/ui_kits/BrandMark.jsx, so assets are one level up.
const ASSET_BASE = (() => {
  try {
    const scripts = document.querySelectorAll("script[src]");
    for (const s of scripts) {
      if (/BrandMark\.jsx(\?|$)/.test(s.getAttribute("src") || "")) {
        return new URL("../assets/logo/", s.src).href;
      }
    }
  } catch (e) {/* non-browser / detached */}
  return "assets/logo/";
})();
function useHyphenPosition() {
  const jRef = React.useRef(null);
  const pRef = React.useRef(null);
  const [hyphen, setHyphen] = useState({
    x: 38,
    y: 50,
    w: 36,
    h: 12
  });
  const [pX, setPX] = useState(76);
  // contentRight is the x-coordinate of the right edge of the rendered P
  // glyph in unscaled coords — used by the parent SVG to center the whole
  // J·P group horizontally instead of left-anchoring it at x=0.
  const [contentRight, setContentRight] = useState(125);
  React.useLayoutEffect(() => {
    if (!jRef.current || !pRef.current) return;
    let raf;
    function measure() {
      try {
        const jb = jRef.current.getBBox();
        const pb = pRef.current.getBBox();
        const hyphenLeft = jb.x + 0.86 * jb.width;
        const hyphenWidth = 34;
        const HYPHEN_TO_P_GAP = -6;
        const nextPX = hyphenLeft + hyphenWidth + HYPHEN_TO_P_GAP;
        const cy = pb.y + pb.height * 0.54;
        setHyphen({
          x: hyphenLeft,
          y: cy - 6,
          w: hyphenWidth,
          h: 12
        });
        setPX(nextPX);
        setContentRight(nextPX + pb.width);
      } catch (e) {
        /* getBBox can throw if not yet in DOM */
      }
    }
    measure();
    raf = requestAnimationFrame(measure);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(measure));
    }
    return () => cancelAnimationFrame(raf);
  }, []);
  return [jRef, pRef, hyphen, pX, contentRight];
}
function BrandMark({
  variant = "primary",
  size = 120,
  color
}) {
  const gradId = useId().replace(/:/g, "");
  const [jRef, pRef, h, pX, contentRight] = useHyphenPosition();

  // Filled icon: the visual-locked JHP mark — rounded square, diagonal
  // signature gradient, white monogram with the embedded negative-space H.
  // §2 / v1.2: the logo is NEVER redrawn by hand — render the approved
  // raster asset so letterform, spacing, and the H stay exact. (The earlier
  // hand-drawn "J·P" hyphen monogram was retired in v1.2.)
  if (variant === "filled-icon") {
    return /*#__PURE__*/React.createElement("img", {
      src: ASSET_BASE + "jhp-mark-primary-512.png",
      width: size,
      height: size,
      style: {
        display: "block"
      },
      alt: "JHP \xB7 Jack H. Park Studio"
    });
  }

  // Primary: gradient fill on transparent bg (light or dark surface).
  // viewBox is sized to the actual rendered content so the SVG's bounding
  // box matches the J·P optical bounds — no left or right asymmetric
  // padding inside the SVG. A tiny right pad (3u) shifts the mark
  // optically left when centered in its container, compensating for J's
  // tighter left side-bearing vs P's open bowl on the right.
  const fill = color === "mono-white" ? "#fff" : color === "mono-dark" ? "#37352F" : `url(#${gradId})`;
  const RIGHT_PAD = 3;
  const vbWidth = Math.max(contentRight, 100) + RIGHT_PAD;
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size / vbWidth * 100,
    viewBox: `0 0 ${vbWidth} 100`,
    xmlns: "http://www.w3.org/2000/svg",
    role: "img",
    "aria-label": "J\xB7P \xB7 Jack H. Park Studio"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gradId,
    x1: "0",
    y1: "0",
    x2: vbWidth,
    y2: "0",
    gradientUnits: "userSpaceOnUse"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#f06292"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "30%",
    stopColor: "#b439df"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "60%",
    stopColor: "#5b8def"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#4dd0e1"
  }))), /*#__PURE__*/React.createElement("text", {
    ref: jRef,
    x: "0",
    y: "78",
    fontFamily: "Geist, ui-sans-serif, sans-serif",
    fontWeight: "600",
    fontSize: "100",
    letterSpacing: "-4",
    fill: fill
  }, "J"), /*#__PURE__*/React.createElement("rect", {
    x: h.x,
    y: h.y,
    width: h.w,
    height: h.h,
    rx: "1.5",
    fill: fill
  }), /*#__PURE__*/React.createElement("text", {
    ref: pRef,
    x: pX,
    y: "78",
    fontFamily: "Geist, ui-sans-serif, sans-serif",
    fontWeight: "600",
    fontSize: "100",
    letterSpacing: "-4",
    fill: fill
  }, "P"));
}
function BrandWordmark({
  size = "md",
  studio = true,
  studioPlacement = "stacked",
  gradientStudio = false
}) {
  // §2.4 — name in Geist 500 -0.025em, "STUDIO" in Geist Mono 400 0.22em.
  // Three legitimate variants:
  //   studio=false                          → "Jack H. Park" alone (one line)
  //   studio=true, placement="stacked"      → name above, STUDIO tag below (default, two lines)
  //   studio=true, placement="inline"       → "Jack H. Park │ STUDIO" (single line, narrow contexts only)
  const scales = {
    sm: {
      name: 14,
      tag: 9
    },
    md: {
      name: 19,
      tag: 10
    },
    lg: {
      name: 26,
      tag: 12
    }
  };
  const s = scales[size] || scales.md;
  const nameEl = /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: s.name + "px",
      fontWeight: 500,
      letterSpacing: "-0.025em",
      color: "var(--text-primary)",
      lineHeight: 1
    }
  }, "Jack H. Park");
  if (!studio) {
    return /*#__PURE__*/React.createElement("span", {
      className: "brand-wordmark",
      style: {
        display: "inline-flex",
        alignItems: "center"
      }
    }, nameEl);
  }
  const studioStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: s.tag + "px",
    fontWeight: 400,
    letterSpacing: "0.22em",
    // Optical alignment: letter-spacing only adds trailing space after each
    // glyph, so the first letter sits flush at x=0 — visually further left
    // than the J of "Jack". Nudge the whole tag right by roughly one full
    // tracking unit so S aligns optically with J.
    marginLeft: "0.22em",
    textTransform: "uppercase",
    lineHeight: 1,
    ...(gradientStudio ? {
      backgroundImage: "var(--gradient-full)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent"
    } : {
      color: "var(--text-tertiary)"
    })
  };
  if (studioPlacement === "stacked") {
    return /*#__PURE__*/React.createElement("span", {
      className: "brand-wordmark",
      style: {
        display: "inline-flex",
        flexDirection: "column",
        lineHeight: 1.05,
        gap: 6
      }
    }, nameEl, /*#__PURE__*/React.createElement("span", {
      style: studioStyle
    }, "STUDIO"));
  }

  // inline (default): name │ STUDIO with a hairline divider, baseline-aligned
  return /*#__PURE__*/React.createElement("span", {
    className: "brand-wordmark",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: Math.round(s.name * 0.55)
    }
  }, nameEl, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: Math.round(s.name * 0.85),
      background: "var(--border-default, currentColor)",
      opacity: 0.45
    },
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    style: studioStyle
  }, "STUDIO"));
}
function BrandLockup({
  size = "md",
  studio = true,
  studioPlacement = "stacked",
  gradientStudio = false
}) {
  // §2.5 — filled icon + workmark, vertically centered.
  const sizes = {
    sm: 40,
    md: 52,
    lg: 68
  };
  const iconSize = sizes[size] || sizes.md;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(BrandMark, {
    variant: "filled-icon",
    size: iconSize
  }), /*#__PURE__*/React.createElement(BrandWordmark, {
    size: size,
    studio: studio,
    studioPlacement: studioPlacement,
    gradientStudio: gradientStudio
  }));
}
Object.assign(window, {
  BrandMark,
  BrandWordmark,
  BrandLockup
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/BrandMark.jsx", error: String((e && e.message) || e) }); }

// ui_kits/PhosphorIcons.jsx
try { (() => {
/* global React */
/* ============================================================
   Phosphor Icons (Regular weight) — inline SVG library.
   Matches Brand Guidelines §6.1: outline icons, 1.5px stroke
   equivalent, 24×24 grid, rounded line caps.

   Adding an icon: copy its <svg> body from the @phosphor-icons/core
   regular set and add an entry to PHOSPHOR_PATHS below.
   ============================================================ */

// Phosphor uses a 256×256 viewBox internally; we map to 24×24 by scaling.
// Each entry is the SVG inner markup (paths, no <svg> wrapper).
const PHOSPHOR_PATHS = {
  "database": '<ellipse cx="128" cy="56" rx="88" ry="32" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 56v144c0 17.7 39.4 32 88 32s88-14.3 88-32V56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 128c0 17.7 39.4 32 88 32s88-14.3 88-32" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "file-text": '<path d="M200 224H56a8 8 0 0 1-8-8V40a8 8 0 0 1 8-8h96l56 56v128a8 8 0 0 1-8 8Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><polyline points="152 32 152 88 208 88" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="96" y1="136" x2="160" y2="136" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="96" y1="168" x2="160" y2="168" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "sliders-horizontal": '<line x1="40" y1="88" x2="216" y2="88" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="40" y1="168" x2="216" y2="168" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="84" cy="88" r="20" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="172" cy="168" r="20" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "chat-circle-text": '<path d="M79.6 224a96 96 0 1 1 51.7 14.4l-43.7 12a8 8 0 0 1-9.9-9.9L88 196.3" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" transform="translate(20 -10)"/><line x1="92" y1="128" x2="164" y2="128" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="92" y1="100" x2="164" y2="100" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "git-branch": '<circle cx="64" cy="48" r="24" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="64" cy="208" r="24" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="192" cy="80" r="24" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="64" y1="72" x2="64" y2="184" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M192 104c0 40-64 32-64 80" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "gear": '<circle cx="128" cy="128" r="40" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="m130.1 206.1 4.4 14.7a8 8 0 0 0 9.4 5.4 95.8 95.8 0 0 0 33.2-13.7 8 8 0 0 0 2.6-10.7L172 188.4a76.3 76.3 0 0 0 16.5-28.6l16.3-2.8a8 8 0 0 0 6.5-8.7 95.2 95.2 0 0 0 0-22.6 8 8 0 0 0-6.5-8.7L188.5 114a76.3 76.3 0 0 0-16.5-28.6L179.7 70a8 8 0 0 0-2.6-10.7 95.8 95.8 0 0 0-33.2-13.7 8 8 0 0 0-9.4 5.4l-4.4 14.7a76.5 76.5 0 0 0-4.2 0l-4.4-14.7a8 8 0 0 0-9.4-5.4 95.8 95.8 0 0 0-33.2 13.7A8 8 0 0 0 76.3 70L84 85.4A76.3 76.3 0 0 0 67.5 114l-16.3 2.8a8 8 0 0 0-6.5 8.7 95.2 95.2 0 0 0 0 22.6 8 8 0 0 0 6.5 8.7l16.3 2.8A76.3 76.3 0 0 0 84 188.4L76.3 204a8 8 0 0 0 2.6 10.7 95.8 95.8 0 0 0 33.2 13.7 8 8 0 0 0 9.4-5.4l4.4-14.7"  fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "magnifying-glass": '<circle cx="112" cy="112" r="80" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="168.6" y1="168.6" x2="224" y2="224" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "question": '<circle cx="128" cy="128" r="96" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><polyline points="118 132 128 128 128 168" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="120" y1="168" x2="144" y2="168" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="124" cy="92" r="12" fill="currentColor"/>',
  "caret-right": '<polyline points="96 48 176 128 96 208" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "download-simple": '<line x1="128" y1="144" x2="128" y2="32" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><polyline points="216 144 216 208 40 208 40 144" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><polyline points="168 104 128 144 88 104" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "play": '<polygon points="80 56 80 200 192 128 80 56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "arrows-clockwise": '<polyline points="176 104 224 104 224 56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M191.1 191.1a96 96 0 1 1 0-126.3l32.9 31.2" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "arrow-square-out": '<polyline points="112 32 176 32 176 96" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="104" y1="104" x2="176" y2="32" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 144v64a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V112a8 8 0 0 1 8-8h64" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "plus": '<line x1="40" y1="128" x2="216" y2="128" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="128" y1="40" x2="128" y2="216" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "funnel": '<path d="M40 56h176v18.7a8 8 0 0 1-2.6 5.9L160 128v68.4a8 8 0 0 1-3.6 6.7l-32 21.3a8 8 0 0 1-12.4-6.7V128L42.6 80.6a8 8 0 0 1-2.6-5.9Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "check": '<polyline points="216 72 104 184 48 128" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "trash": '<line x1="216" y1="56" x2="40" y2="56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="104" y1="104" x2="104" y2="168" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="152" y1="104" x2="152" y2="168" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M200 56v152a8 8 0 0 1-8 8H64a8 8 0 0 1-8-8V56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M168 56V40a16 16 0 0 0-16-16h-48a16 16 0 0 0-16 16v16" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "paper-plane-tilt": '<path d="M223.9 64.2 35.1 124.7a8 8 0 0 0-.5 15l65.6 22.7a8 8 0 0 1 5 5l22.7 65.6a8 8 0 0 0 15-.5l60.5-188.8a8 8 0 0 0-10-10Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="100.3" y1="156" x2="170.5" y2="85.8" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "quotes": '<path d="M104 72v50.7a48 48 0 0 1-12.5 32.4l-14.4 16.4a8 8 0 0 1-12 0L50.5 154.7a48 48 0 0 1-12.5-32.4V72a8 8 0 0 1 8-8h50a8 8 0 0 1 8 8Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M216 72v50.7a48 48 0 0 1-12.5 32.4l-14.4 16.4a8 8 0 0 1-12 0L162.5 154.7a48 48 0 0 1-12.5-32.4V72a8 8 0 0 1 8-8h50a8 8 0 0 1 8 8Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "sun": '<circle cx="128" cy="128" r="56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="128" y1="40" x2="128" y2="24" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="64" y1="64" x2="56" y2="56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="40" y1="128" x2="24" y2="128" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="64" y1="192" x2="56" y2="200" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="128" y1="216" x2="128" y2="232" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="192" y1="192" x2="200" y2="200" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="216" y1="128" x2="232" y2="128" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="192" y1="64" x2="200" y2="56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "moon": '<path d="M227.5 154A96 96 0 1 1 102 28.5 8 8 0 0 1 111.4 39 88 88 0 0 0 217 144.6a8 8 0 0 1 10.5 9.4Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "x": '<line x1="200" y1="56" x2="56" y2="200" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="200" y1="200" x2="56" y2="56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "chat-circle": '<path d="M79.6 224a96 96 0 1 1 51.7 14.4l-43.7 12a8 8 0 0 1-9.9-9.9L88 196.3" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" transform="translate(20 -10)"/>',
  "github-logo": '<path d="M84 240a23.9 23.9 0 0 0 24-24v-38" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M172 240a23.9 23.9 0 0 1-24-24v-38" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 178c30 0 56-9 56-44a51.5 51.5 0 0 0-14-35c4-9 4-22 0-31 0 0-12 0-32 14a113 113 0 0 0-60 0c-20-14-32-14-32-14-4 9-4 22 0 31a51.5 51.5 0 0 0-14 35c0 35 26 44 56 44 0 0-9.9 4.3-13.9 12-7 6-21 7-29.3 0a26.6 26.6 0 0 1-6.8-7" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "linkedin-logo": '<rect x="32" y="32" width="192" height="192" rx="8" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="120" y1="112" x2="120" y2="176" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="88" y1="112" x2="88" y2="176" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M120 140a28 28 0 0 1 56 0v36" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="88" cy="80" r="12" fill="currentColor"/>',
  "instagram-logo": '<rect x="36" y="36" width="184" height="184" rx="48" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="128" cy="128" r="40" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="180" cy="76" r="12" fill="currentColor"/>',
  "youtube-logo": '<path d="M164.4 121.3 116.1 96a8 8 0 0 0-11.7 7.1v50.5a8 8 0 0 0 11.7 7.1l48.3-25.2a8 8 0 0 0 0-14.2Z" fill="currentColor"/><path d="M24 128.7v-1.4c0-14.3.4-39.7 4.4-53.3a23.9 23.9 0 0 1 16.8-16.8C61.3 53 128 53 128 53s66.7 0 82.8 4.2a23.9 23.9 0 0 1 16.8 16.8c4 13.5 4.4 38.9 4.4 53.3v1.4c0 14.3-.4 39.8-4.4 53.3a23.9 23.9 0 0 1-16.8 16.8C194.7 203 128 203 128 203s-66.7 0-82.8-4.2a23.9 23.9 0 0 1-16.8-16.8c-4-13.5-4.4-39-4.4-53.3Z" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>',
  "envelope-simple": '<rect x="32" y="48" width="192" height="160" rx="8" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="m224 56-96 88L32 56" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>'
};
function Phosphor({
  name,
  size = 18,
  color,
  className,
  style
}) {
  const inner = PHOSPHOR_PATHS[name];
  if (!inner) {
    if (typeof console !== "undefined") console.warn("Phosphor icon missing:", name);
    return null;
  }
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 256 256",
    width: size,
    height: size,
    className: className,
    style: {
      display: "inline-block",
      flexShrink: 0,
      color: color || "currentColor",
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: inner
    }
  });
}
window.Phosphor = Phosphor;
window.PhosphorIcon = Phosphor;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/PhosphorIcons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/lab/ChatAssistantScreen.jsx
try { (() => {
/* global React */
const {
  useState,
  useEffect,
  useRef
} = React;
const {
  Panel,
  Btn,
  Pill,
  Overline,
  Icon
} = window;
const SEED = [{
  role: "user",
  text: "What's the difference between the Native and LangChain engines?"
}, {
  role: "assistant",
  text: "The Native Engine runs on the Edge Runtime and streams tokens first. It includes Reverse RAG, HyDE, and multi-stage query rewriting — so it can do more work per request and still feel fast.\n\nThe LangChain Engine runs on the Node Runtime and trades raw speed for clearer orchestration. It's a 6-step chain (retriever → context builder → prompt → reasoner → parser → citation mapper) that's easier to debug and recompose.",
  cites: [{
    src: "readme.md",
    para: "Two Execution Engines",
    sim: 0.94
  }, {
    src: "readme.md",
    para: "LangChain RAG Pipeline",
    sim: 0.88
  }],
  meta: {
    model: "GPT-4o mini · OpenAI",
    latency: "1.2s",
    tokens: 412
  }
}];
function ChatAssistantScreen() {
  const [thread, setThread] = useState(SEED);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread, streaming]);
  function send() {
    if (!draft.trim() || streaming) return;
    const q = draft.trim();
    setThread(t => [...t, {
      role: "user",
      text: q
    }]);
    setDraft("");
    setStreaming(true);
    const reply = "I'd retrieve the top chunks for that, but this is a static demo — the live assistant streams from the Edge runtime with HyDE and citation mapping. Try the production site at jackhpark.com/chat to see it run for real.";
    let i = 0;
    setThread(t => [...t, {
      role: "assistant",
      text: "",
      cites: [{
        src: "readme.md",
        para: "Conversational Chat",
        sim: 0.83
      }],
      meta: {
        model: "GPT-4o mini · OpenAI",
        latency: "—",
        tokens: 0
      }
    }]);
    const id = setInterval(() => {
      i += 4;
      setThread(t => {
        const next = t.slice();
        const last = {
          ...next[next.length - 1]
        };
        last.text = reply.slice(0, i);
        last.meta = {
          ...last.meta,
          tokens: Math.floor(i / 4),
          latency: `${(i * 8).toString()}ms`
        };
        next[next.length - 1] = last;
        return next;
      });
      if (i >= reply.length) {
        clearInterval(id);
        setStreaming(false);
      }
    }, 30);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-page lab-page--chat"
  }, /*#__PURE__*/React.createElement("header", {
    className: "lab-page__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Overline, {
    color: "var(--jp-ink-blue)"
  }, "SECTION 04 \xB7 CONSOLE"), /*#__PURE__*/React.createElement("h1", {
    className: "lab-page__title"
  }, "Assistant"), /*#__PURE__*/React.createElement("p", {
    className: "lab-page__sub"
  }, "Test the live chat with the current chat-config settings. Citations show the chunks the model grounded its answer on.")), /*#__PURE__*/React.createElement("div", {
    className: "lab-page__actions"
  }, /*#__PURE__*/React.createElement(Pill, {
    tone: "info",
    dot: true
  }, "Streaming \xB7 Edge"), /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost",
    icon: "trash"
  }, "Clear thread"))), /*#__PURE__*/React.createElement(Panel, {
    overline: `THREAD · ${thread.length} turns`,
    title: "Conversation",
    dense: true
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-thread",
    ref: bodyRef
  }, thread.map((m, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    className: `lab-msg lab-msg--${m.role}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-msg__av"
  }, m.role === "assistant" ? /*#__PURE__*/React.createElement("img", {
    src: "../../assets/avatar-jack.png",
    alt: ""
  }) : /*#__PURE__*/React.createElement("span", null, "JP")), /*#__PURE__*/React.createElement("div", {
    className: "lab-msg__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-msg__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-msg__who"
  }, m.role === "user" ? "You" : "Jack's AI Assistant"), m.meta && /*#__PURE__*/React.createElement("span", {
    className: "lab-msg__meta mono"
  }, m.meta.model, " \xB7 ", m.meta.latency, " \xB7 ", m.meta.tokens, " tok")), /*#__PURE__*/React.createElement("div", {
    className: "lab-msg__text"
  }, m.text || /*#__PURE__*/React.createElement("span", {
    className: "lab-msg__cursor"
  })), m.cites && m.cites.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "lab-cites"
  }, m.cites.map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "lab-cite"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "quotes",
    size: 11
  }), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, c.src), /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, "\xB7 \xB6 ", c.para), /*#__PURE__*/React.createElement("span", {
    className: "mono lab-cite__sim"
  }, c.sim.toFixed(2))))))))), /*#__PURE__*/React.createElement("div", {
    className: "lab-composer"
  }, /*#__PURE__*/React.createElement("textarea", {
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    placeholder: "Ask anything about Jack's projects, RAG architecture, or career\u2026",
    rows: 2,
    disabled: streaming
  }), /*#__PURE__*/React.createElement("div", {
    className: "lab-composer__row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-composer__chips"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-tag lab-tag--gray"
  }, "\u23CE to send"), /*#__PURE__*/React.createElement("span", {
    className: "lab-tag lab-tag--gray"
  }, "\u21E7\u23CE newline")), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    icon: "paper-plane-tilt",
    onClick: send,
    disabled: streaming || !draft.trim()
  }, streaming ? "Streaming…" : "Send")))));
}
window.ChatAssistantScreen = ChatAssistantScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/lab/ChatAssistantScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/lab/ChatConfigScreen.jsx
try { (() => {
/* global React */
const {
  useState
} = React;
const {
  Panel,
  Btn,
  Overline,
  Field,
  Toggle,
  Segmented,
  Icon
} = window;
function ChatConfigScreen() {
  const [hyde, setHyde] = useState(true);
  const [reverse, setReverse] = useState(false);
  const [stream, setStream] = useState(true);
  const [summary, setSummary] = useState(true);
  const [model, setModel] = useState("openai-4o-mini");
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-page"
  }, /*#__PURE__*/React.createElement("header", {
    className: "lab-page__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Overline, {
    color: "var(--jp-ink-blue)"
  }, "SECTION 03 \xB7 CONSOLE"), /*#__PURE__*/React.createElement("h1", {
    className: "lab-page__title"
  }, "Chat config"), /*#__PURE__*/React.createElement("p", {
    className: "lab-page__sub"
  }, "Tune what the assistant says and how it retrieves context. All changes persist to ", /*#__PURE__*/React.createElement("code", {
    className: "lab-code"
  }, "chat_settings"), " ", "in Supabase.")), /*#__PURE__*/React.createElement("div", {
    className: "lab-page__actions"
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost"
  }, "Reset to defaults"), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    icon: "check"
  }, "Save changes"))), /*#__PURE__*/React.createElement("div", {
    className: "lab-grid-2"
  }, /*#__PURE__*/React.createElement(Panel, {
    overline: "PROMPT",
    title: "System prompt"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Persona",
    hint: "Shown to every model on every request."
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "lab-textarea",
    defaultValue: "You are Jack H. Park's portfolio assistant.\nAnswer concisely, ground every claim in retrieved chunks, and cite source titles inline.\nIf a question is outside Jack's published work, say so."
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Chitchat fallback",
    hint: "Used when the user sends a greeting / non-question."
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input",
    defaultValue: "Hi \u2014 I can answer questions about Jack's projects, writing, and the RAG pipeline. What are you curious about?"
  }))), /*#__PURE__*/React.createElement(Panel, {
    overline: "MODEL",
    title: "Reasoning model"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Default model"
  }, /*#__PURE__*/React.createElement(Segmented, {
    items: [{
      value: "openai-4o-mini",
      label: "GPT-4o mini"
    }, {
      value: "gemini-1.5",
      label: "Gemini 1.5"
    }, {
      value: "ollama-mistral",
      label: "Mistral · local"
    }],
    value: model,
    onChange: setModel
  })), /*#__PURE__*/React.createElement("div", {
    className: "lab-grid-2"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Temperature"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    defaultValue: "0.0"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Max output tokens"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    defaultValue: "1024"
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "History token budget"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    defaultValue: "900"
  }))), /*#__PURE__*/React.createElement(Panel, {
    overline: "RETRIEVAL",
    title: "RAG knobs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-grid-2"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Top-K"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    defaultValue: "15"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Similarity \u2265"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    defaultValue: "0.78"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Context budget (tokens)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    defaultValue: "1200"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Excerpt clip (tokens)"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    defaultValue: "320"
  })))), /*#__PURE__*/React.createElement(Panel, {
    overline: "BEHAVIOUR",
    title: "Pipeline toggles"
  }, /*#__PURE__*/React.createElement(Toggle, {
    label: "HyDE generation",
    hint: "Generate a hypothetical answer before retrieval.",
    checked: hyde,
    onChange: setHyde
  }), /*#__PURE__*/React.createElement(Toggle, {
    label: "Reverse RAG rewrite",
    hint: "Multi-stage query rewriting with a small model first.",
    checked: reverse,
    onChange: setReverse
  }), /*#__PURE__*/React.createElement(Toggle, {
    label: "Stream tokens to UI",
    hint: "Edge runtime only.",
    checked: stream,
    onChange: setStream
  }), /*#__PURE__*/React.createElement(Toggle, {
    label: "Rolling history summary",
    hint: "Collapse older turns into a summary once over budget.",
    checked: summary,
    onChange: setSummary
  }))));
}
window.ChatConfigScreen = ChatConfigScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/lab/ChatConfigScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/lab/DocumentsScreen.jsx
try { (() => {
/* global React */
const {
  useState
} = React;
const {
  Panel,
  Btn,
  Pill,
  Overline,
  Icon
} = window;
const DOCS = [{
  id: "doc_28299029",
  title: "RAG Pipeline & LangChain Integration",
  source: "notion",
  chunks: 84,
  updated: "2025-10-07",
  tags: ["rag", "langchain"]
}, {
  id: "doc_28999029",
  title: "Personal Life",
  source: "notion",
  chunks: 32,
  updated: "2025-10-04",
  tags: ["bio"]
}, {
  id: "doc_2ae99029",
  title: "Photography Gallery",
  source: "notion",
  chunks: 18,
  updated: "2025-09-28",
  tags: ["gallery"]
}, {
  id: "doc_f1a2b3c4",
  title: "Edge Functions deep dive",
  source: "url",
  chunks: 48,
  updated: "2025-09-30",
  tags: ["edge", "vercel"]
}, {
  id: "doc_77e1d2a3",
  title: "2025-Q3 PRD — RAG v2",
  source: "file",
  chunks: 198,
  updated: "2025-09-28",
  tags: ["prd"]
}];
const TAG_TONE = {
  rag: "purple",
  langchain: "blue",
  bio: "brown",
  gallery: "teal",
  edge: "yellow",
  vercel: "gray",
  prd: "pink"
};
function DocumentsScreen() {
  const [active, setActive] = useState(DOCS[0]);
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-page"
  }, /*#__PURE__*/React.createElement("header", {
    className: "lab-page__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Overline, {
    color: "var(--jp-ink-blue)"
  }, "SECTION 02 \xB7 CONSOLE"), /*#__PURE__*/React.createElement("h1", {
    className: "lab-page__title"
  }, "Documents"), /*#__PURE__*/React.createElement("p", {
    className: "lab-page__sub"
  }, "All ingested sources and their chunk breakdowns. Click a row to inspect chunks and re-trigger embedding.")), /*#__PURE__*/React.createElement("div", {
    className: "lab-page__actions"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "magnifying-glass",
    size: 14
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search title, id, or tag\u2026"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "lab-grid-split"
  }, /*#__PURE__*/React.createElement(Panel, {
    overline: "ALL DOCS \xB7 5",
    title: "Index",
    dense: true
  }, /*#__PURE__*/React.createElement("table", {
    className: "lab-table lab-table--tight"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Title"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Chunks"), /*#__PURE__*/React.createElement("th", null, "Updated"))), /*#__PURE__*/React.createElement("tbody", null, DOCS.map(d => /*#__PURE__*/React.createElement("tr", {
    key: d.id,
    className: active.id === d.id ? "is-active" : "",
    onClick: () => setActive(d)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "lab-doc-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: `lab-doc-src lab-doc-src--${d.source}`
  }, d.source[0].toUpperCase()), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "lab-doc-name"
  }, d.title), /*#__PURE__*/React.createElement("div", {
    className: "mono muted lab-doc-id"
  }, d.id)))), /*#__PURE__*/React.createElement("td", {
    className: "r mono"
  }, d.chunks), /*#__PURE__*/React.createElement("td", {
    className: "mono muted"
  }, d.updated)))))), /*#__PURE__*/React.createElement(Panel, {
    overline: `DOC · ${active.id}`,
    title: active.title,
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Btn, {
      variant: "ghost",
      icon: "arrow-square-out"
    }, "Open source"), /*#__PURE__*/React.createElement(Btn, {
      variant: "secondary",
      icon: "arrows-clockwise"
    }, "Re-embed"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-detail"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-meta-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-meta-cell"
  }, /*#__PURE__*/React.createElement(Overline, null, "Source"), /*#__PURE__*/React.createElement("div", {
    className: "mono"
  }, active.source)), /*#__PURE__*/React.createElement("div", {
    className: "lab-meta-cell"
  }, /*#__PURE__*/React.createElement(Overline, null, "Chunks"), /*#__PURE__*/React.createElement("div", {
    className: "mono"
  }, active.chunks)), /*#__PURE__*/React.createElement("div", {
    className: "lab-meta-cell"
  }, /*#__PURE__*/React.createElement(Overline, null, "Updated"), /*#__PURE__*/React.createElement("div", {
    className: "mono"
  }, active.updated)), /*#__PURE__*/React.createElement("div", {
    className: "lab-meta-cell"
  }, /*#__PURE__*/React.createElement(Overline, null, "Status"), /*#__PURE__*/React.createElement(Pill, {
    tone: "ok"
  }, "Ingested"))), /*#__PURE__*/React.createElement("div", {
    className: "lab-tags"
  }, active.tags.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    className: `lab-tag lab-tag--${TAG_TONE[t] || "gray"}`
  }, t))), /*#__PURE__*/React.createElement("hr", {
    className: "lab-hr"
  }), /*#__PURE__*/React.createElement(Overline, null, "Top chunks \xB7 cosine \u2265 0.78"), /*#__PURE__*/React.createElement("div", {
    className: "lab-chunks"
  }, [{
    i: 1,
    sim: 0.94,
    text: "The Native Engine runs on the Edge Runtime and streams tokens first — it includes Reverse RAG, HyDE, and multi-stage query rewriting."
  }, {
    i: 2,
    sim: 0.89,
    text: "Unlike the earlier single-provider design, the system now supports OpenAI text-embedding-3-small and Gemini embeddings, stored in Supabase pgvector under provider-specific tables."
  }, {
    i: 3,
    sim: 0.81,
    text: "While the Native Engine includes additional augmentations, the LangChain pipeline remains a clear, modular reference implementation."
  }].map(c => /*#__PURE__*/React.createElement("div", {
    key: c.i,
    className: "lab-chunk"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-chunk__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono lab-chunk__i"
  }, "#", c.i), /*#__PURE__*/React.createElement("span", {
    className: "mono muted"
  }, "cosine ", c.sim.toFixed(2))), /*#__PURE__*/React.createElement("p", {
    className: "lab-chunk__text"
  }, c.text))))))));
}
window.DocumentsScreen = DocumentsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/lab/DocumentsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/lab/IngestionScreen.jsx
try { (() => {
/* global React */
const {
  useState
} = React;
const {
  Panel,
  Stat,
  Btn,
  Pill,
  Overline,
  Field,
  Segmented,
  Icon
} = window;
const RUNS = [{
  id: "r-1284",
  source: "notion://rag-architecture",
  provider: "OpenAI · te3s",
  chunks: 1284,
  latency: "142ms",
  at: "2025-10-07 14:21",
  status: "ok"
}, {
  id: "r-1283",
  source: "notion://personal-life",
  provider: "Gemini · embed-001",
  chunks: 312,
  latency: "208ms",
  at: "2025-10-07 13:04",
  status: "ok"
}, {
  id: "r-1282",
  source: "notion://changelog",
  provider: "OpenAI · te3s",
  chunks: 84,
  latency: "92ms",
  at: "2025-10-06 22:51",
  status: "ok"
}, {
  id: "r-1281",
  source: "url://vercel.com/blog/edge-functions",
  provider: "OpenAI · te3s",
  chunks: 48,
  latency: "1.2s",
  at: "2025-09-30 09:18",
  status: "warn"
}, {
  id: "r-1280",
  source: "url://openai.com/research/o1",
  provider: "OpenAI · te3s",
  chunks: 0,
  latency: "—",
  at: "2025-09-29 16:42",
  status: "err"
}, {
  id: "r-1279",
  source: "file://2025-q3-prd.md",
  provider: "Gemini · embed-001",
  chunks: 198,
  latency: "302ms",
  at: "2025-09-28 11:12",
  status: "ok"
}];
function IngestionScreen() {
  const [sourceType, setSourceType] = useState("notion");
  const [provider, setProvider] = useState("openai");
  const [topK, setTopK] = useState(15);
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-page"
  }, /*#__PURE__*/React.createElement("header", {
    className: "lab-page__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Overline, {
    color: "var(--jp-ink-blue)"
  }, "SECTION 01 \xB7 CONSOLE"), /*#__PURE__*/React.createElement("h1", {
    className: "lab-page__title"
  }, "Ingestion"), /*#__PURE__*/React.createElement("p", {
    className: "lab-page__sub"
  }, "Run, monitor, and re-trigger embedding jobs across Notion pages, URLs, and uploaded files.")), /*#__PURE__*/React.createElement("div", {
    className: "lab-page__actions"
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost",
    icon: "download-simple"
  }, "Export CSV"), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    icon: "play"
  }, "Run new ingestion"))), /*#__PURE__*/React.createElement("div", {
    className: "lab-grid-4",
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Chunks ingested",
    value: "28,499",
    delta: "+312 today",
    tone: "ok"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Latency p50",
    value: "142",
    unit: "ms",
    delta: "\u221218ms wk",
    tone: "ok"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Top-K hit rate",
    value: "94.2",
    unit: "%",
    delta: "\u22121.4 pts wk",
    tone: "warn"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Cost / 1k chunks",
    value: "$0.18",
    delta: "\u2212$0.02 wk",
    tone: "ok"
  })), /*#__PURE__*/React.createElement(Panel, {
    overline: "LIVE RUNS \xB7 LAST 30D",
    title: "Ingestion runs",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Segmented, {
      items: [{
        value: "all",
        label: "All"
      }, {
        value: "notion",
        label: "Notion"
      }, {
        value: "url",
        label: "URL"
      }, {
        value: "file",
        label: "File"
      }],
      value: "all",
      onChange: () => {}
    }), /*#__PURE__*/React.createElement(Btn, {
      variant: "ghost",
      icon: "arrows-clockwise"
    }, "Refresh"))
  }, /*#__PURE__*/React.createElement("table", {
    className: "lab-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: "12%"
    }
  }, "Run"), /*#__PURE__*/React.createElement("th", null, "Source"), /*#__PURE__*/React.createElement("th", null, "Provider"), /*#__PURE__*/React.createElement("th", {
    className: "r",
    style: {
      width: "10%"
    }
  }, "Chunks"), /*#__PURE__*/React.createElement("th", {
    className: "r",
    style: {
      width: "10%"
    }
  }, "Latency"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: "14%"
    }
  }, "At"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: "12%"
    }
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: "32px"
    }
  }))), /*#__PURE__*/React.createElement("tbody", null, RUNS.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "mono"
  }, r.id), /*#__PURE__*/React.createElement("td", {
    className: "src"
  }, r.source), /*#__PURE__*/React.createElement("td", {
    className: "mono muted"
  }, r.provider), /*#__PURE__*/React.createElement("td", {
    className: "r mono"
  }, r.chunks.toLocaleString()), /*#__PURE__*/React.createElement("td", {
    className: "r mono"
  }, r.latency), /*#__PURE__*/React.createElement("td", {
    className: "mono muted"
  }, r.at), /*#__PURE__*/React.createElement("td", null, r.status === "ok" && /*#__PURE__*/React.createElement(Pill, {
    tone: "ok"
  }, "Ingested"), r.status === "warn" && /*#__PURE__*/React.createElement(Pill, {
    tone: "warn"
  }, "Stale 7d"), r.status === "err" && /*#__PURE__*/React.createElement(Pill, {
    tone: "err"
  }, "Failed \xB7 401")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "lab-row-act"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "caret-right",
    size: 14
  })))))))), /*#__PURE__*/React.createElement("div", {
    className: "lab-grid-2",
    style: {
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    overline: "NEW RUN",
    title: "Run a new ingestion"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-form"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Source type"
  }, /*#__PURE__*/React.createElement(Segmented, {
    items: [{
      value: "notion",
      label: "Notion"
    }, {
      value: "url",
      label: "URL"
    }, {
      value: "file",
      label: "File"
    }],
    value: sourceType,
    onChange: setSourceType
  })), /*#__PURE__*/React.createElement(Field, {
    label: sourceType === "notion" ? "Notion page ID" : sourceType === "url" ? "URL" : "File",
    hint: "Comma-separate to batch multiple sources."
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input",
    placeholder: sourceType === "notion" ? "28299029c0b481ce8999d425287d3db6" : sourceType === "url" ? "https://…" : "Drop file or click to upload"
  })), /*#__PURE__*/React.createElement("div", {
    className: "lab-grid-2"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Embedding provider"
  }, /*#__PURE__*/React.createElement(Segmented, {
    items: [{
      value: "openai",
      label: "OpenAI"
    }, {
      value: "gemini",
      label: "Gemini"
    }],
    value: provider,
    onChange: setProvider
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Top-K"
  }, /*#__PURE__*/React.createElement("input", {
    className: "lab-input mono",
    value: topK,
    onChange: e => setTopK(e.target.value)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "lab-form__actions"
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    icon: "play"
  }, "Start run")))), /*#__PURE__*/React.createElement(Panel, {
    overline: "THIS WEEK",
    title: "Provider mix",
    dense: true
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-bars"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-bar__lbl"
  }, "OpenAI \xB7 te3s"), /*#__PURE__*/React.createElement("div", {
    className: "lab-bar__track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-bar__fill",
    style: {
      width: "72%",
      background: "var(--jp-cyan)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "lab-bar__val mono"
  }, "72%")), /*#__PURE__*/React.createElement("div", {
    className: "lab-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-bar__lbl"
  }, "Gemini \xB7 embed-001"), /*#__PURE__*/React.createElement("div", {
    className: "lab-bar__track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-bar__fill",
    style: {
      width: "21%",
      background: "var(--jp-coral)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "lab-bar__val mono"
  }, "21%")), /*#__PURE__*/React.createElement("div", {
    className: "lab-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-bar__lbl"
  }, "Ollama \xB7 mistral"), /*#__PURE__*/React.createElement("div", {
    className: "lab-bar__track"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-bar__fill",
    style: {
      width: "7%",
      background: "var(--ink-3)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "lab-bar__val mono"
  }, "7%"))), /*#__PURE__*/React.createElement("hr", {
    className: "lab-hr"
  }), /*#__PURE__*/React.createElement("div", {
    className: "lab-kv-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-kv"
  }, /*#__PURE__*/React.createElement("span", null, "Tokens this week"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, "4.2M")), /*#__PURE__*/React.createElement("div", {
    className: "lab-kv"
  }, /*#__PURE__*/React.createElement("span", null, "Avg chunk size"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, "512 tok")), /*#__PURE__*/React.createElement("div", {
    className: "lab-kv"
  }, /*#__PURE__*/React.createElement("span", null, "Cache hit (Redis)"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, "81%")), /*#__PURE__*/React.createElement("div", {
    className: "lab-kv"
  }, /*#__PURE__*/React.createElement("span", null, "Retries"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, "14"))))));
}
window.IngestionScreen = IngestionScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/lab/IngestionScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/lab/Primitives.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* global React */
const {
  useState
} = React;

/* ---------- Icon (inline Phosphor Regular SVGs) ----------
   Per Brand Guidelines §6.1 — outline icons, rounded line caps,
   24×24 grid. SVG library lives at ../PhosphorIcons.jsx. */
function Icon({
  name,
  size = 16,
  color = "currentColor",
  className
}) {
  const Phosphor = window.Phosphor;
  return /*#__PURE__*/React.createElement(Phosphor, {
    name: name,
    size: size,
    color: color,
    className: className
  });
}

/* ---------- Button ---------- */
function Btn({
  variant = "secondary",
  size = "md",
  icon,
  children,
  onClick,
  ...props
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    className: `lab-btn lab-btn--${variant} lab-btn--${size}`,
    onClick: onClick
  }, props), icon ? /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 14
  }) : null, children);
}

/* ---------- Pill ---------- */
function Pill({
  tone = "muted",
  dot = true,
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `lab-pill lab-pill--${tone}`
  }, dot ? /*#__PURE__*/React.createElement("span", {
    className: "lab-pill__dot"
  }) : null, children);
}

/* ---------- Overline ---------- */
function Overline({
  children,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-overline",
    style: color ? {
      color
    } : null
  }, children);
}

/* ---------- Stat ---------- */
function Stat({
  label,
  value,
  unit,
  delta,
  tone = "ok"
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-stat"
  }, /*#__PURE__*/React.createElement(Overline, null, label), /*#__PURE__*/React.createElement("div", {
    className: "lab-stat__value"
  }, value, unit ? /*#__PURE__*/React.createElement("span", {
    className: "lab-stat__unit"
  }, unit) : null), delta ? /*#__PURE__*/React.createElement("div", {
    className: `lab-stat__delta lab-stat__delta--${tone}`
  }, delta) : null);
}

/* ---------- Field ---------- */
function Field({
  label,
  hint,
  children
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: "lab-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-field__label"
  }, label), children, hint ? /*#__PURE__*/React.createElement("span", {
    className: "lab-field__hint"
  }, hint) : null);
}

/* ---------- Toggle ---------- */
function Toggle({
  checked,
  onChange,
  label,
  hint
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-toggle-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "lab-toggle" + (checked ? " is-on" : ""),
    onClick: () => onChange(!checked),
    type: "button",
    "aria-pressed": checked
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-toggle__thumb"
  })), /*#__PURE__*/React.createElement("div", {
    className: "lab-toggle-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-toggle__label"
  }, label), hint ? /*#__PURE__*/React.createElement("div", {
    className: "lab-toggle__hint"
  }, hint) : null));
}

/* ---------- Segmented ---------- */
function Segmented({
  items,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-seg"
  }, items.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.value,
    className: "lab-seg__item" + (value === it.value ? " is-on" : ""),
    onClick: () => onChange(it.value),
    type: "button"
  }, it.label)));
}

/* ---------- Panel ---------- */
function Panel({
  title,
  overline,
  actions,
  children,
  dense
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "lab-panel" + (dense ? " is-dense" : "")
  }, (title || overline || actions) && /*#__PURE__*/React.createElement("header", {
    className: "lab-panel__head"
  }, /*#__PURE__*/React.createElement("div", null, overline ? /*#__PURE__*/React.createElement(Overline, null, overline) : null, title ? /*#__PURE__*/React.createElement("h2", {
    className: "lab-panel__title"
  }, title) : null), actions ? /*#__PURE__*/React.createElement("div", {
    className: "lab-panel__actions"
  }, actions) : null), /*#__PURE__*/React.createElement("div", {
    className: "lab-panel__body"
  }, children));
}
Object.assign(window, {
  Icon,
  Btn,
  Pill,
  Overline,
  Stat,
  Field,
  Toggle,
  Segmented,
  Panel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/lab/Primitives.jsx", error: String((e && e.message) || e) }); }

// ui_kits/lab/Shell.jsx
try { (() => {
/* global React */
const {
  useState
} = React;
const {
  Icon,
  Pill,
  Btn
} = window;
function Shell({
  active,
  onNav,
  children
}) {
  const {
    BrandMark
  } = window;
  const nav = [{
    id: "ingestion",
    label: "Ingestion",
    icon: "database"
  }, {
    id: "documents",
    label: "Documents",
    icon: "file-text"
  }, {
    id: "chat-config",
    label: "Chat config",
    icon: "sliders-horizontal"
  }, {
    id: "chat",
    label: "Assistant",
    icon: "chat-circle-text"
  }];
  const meta = [{
    id: "workflows",
    label: "Workflows",
    icon: "git-branch"
  }, {
    id: "settings",
    label: "Settings",
    icon: "gear"
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "lab-shell"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "lab-side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-side__brand"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-side__mark"
  }, /*#__PURE__*/React.createElement(BrandMark, {
    variant: "filled-icon",
    size: 36
  })), /*#__PURE__*/React.createElement("div", {
    className: "lab-side__brand-text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-side__brand-name"
  }, "Jack H. Park"), /*#__PURE__*/React.createElement("div", {
    className: "lab-side__brand-tag"
  }, "STUDIO \xB7 LAB"))), /*#__PURE__*/React.createElement("div", {
    className: "lab-side__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-side__group-label"
  }, "Console"), nav.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.id,
    className: "lab-side__item" + (active === n.id ? " is-active" : ""),
    onClick: () => onNav(n.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n.icon,
    size: 15
  }), /*#__PURE__*/React.createElement("span", null, n.label)))), /*#__PURE__*/React.createElement("div", {
    className: "lab-side__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-side__group-label"
  }, "Operate"), meta.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.id,
    className: "lab-side__item",
    onClick: () => onNav(n.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n.icon,
    size: 15
  }), /*#__PURE__*/React.createElement("span", null, n.label)))), /*#__PURE__*/React.createElement("div", {
    className: "lab-side__footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-side__status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-side__dot"
  }), /*#__PURE__*/React.createElement("span", null, "Edge runtime \xB7 OK")), /*#__PURE__*/React.createElement("div", {
    className: "lab-side__meta"
  }, "openai_te3s_v1"))), /*#__PURE__*/React.createElement("div", {
    className: "lab-main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "lab-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab-top__crumbs"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lab-top__crumb"
  }, "Admin"), /*#__PURE__*/React.createElement("span", {
    className: "lab-top__sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "lab-top__crumb is-current"
  }, nav.concat(meta).find(n => n.id === active)?.label ?? "—")), /*#__PURE__*/React.createElement("div", {
    className: "lab-top__actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "lab-top__icon",
    title: "Search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "magnifying-glass",
    size: 15
  })), /*#__PURE__*/React.createElement("button", {
    className: "lab-top__icon",
    title: "Help"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "question",
    size: 15
  })), /*#__PURE__*/React.createElement("div", {
    className: "lab-top__user"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/avatar-jack.png",
    alt: ""
  })))), /*#__PURE__*/React.createElement("div", {
    className: "lab-content"
  }, children)));
}
window.Shell = Shell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/lab/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/studio/Article.jsx
try { (() => {
/* global React */
const StudioIcons = window.StudioIcons;
function Article({
  onBack
}) {
  return /*#__PURE__*/React.createElement("main", {
    className: "st-page st-page--article"
  }, /*#__PURE__*/React.createElement("button", {
    className: "st-back",
    onClick: onBack
  }, "\u2190 Back to studio"), /*#__PURE__*/React.createElement("header", {
    className: "st-art-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-overline"
  }, "PROJECT \xB7 2025"), /*#__PURE__*/React.createElement("h1", {
    className: "st-art-title"
  }, "Hybrid RAG pipeline & LangChain integration \u2014 system overview"), /*#__PURE__*/React.createElement("div", {
    className: "st-art-props"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-prop"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-prop__k"
  }, "Status"), /*#__PURE__*/React.createElement("span", {
    className: "st-prop__v"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-tag st-tag--green"
  }, "Shipped"))), /*#__PURE__*/React.createElement("div", {
    className: "st-prop"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-prop__k"
  }, "Role"), /*#__PURE__*/React.createElement("span", {
    className: "st-prop__v"
  }, "PM + builder")), /*#__PURE__*/React.createElement("div", {
    className: "st-prop"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-prop__k"
  }, "Stack"), /*#__PURE__*/React.createElement("span", {
    className: "st-prop__v"
  }, "Next.js \xB7 Supabase \xB7 pgvector")), /*#__PURE__*/React.createElement("div", {
    className: "st-prop"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-prop__k"
  }, "Updated"), /*#__PURE__*/React.createElement("span", {
    className: "st-prop__v mono"
  }, "2025-10-07")))), /*#__PURE__*/React.createElement("article", {
    className: "st-art-body"
  }, /*#__PURE__*/React.createElement("p", {
    className: "st-lede"
  }, "This project demonstrates how a modern Retrieval-Augmented Generation system works end-to-end \u2014 ingestion, embeddings, vector search, multi-model LLM reasoning, and two execution runtimes: a", " ", /*#__PURE__*/React.createElement("span", {
    className: "st-link"
  }, "Native Engine"), " and a", " ", /*#__PURE__*/React.createElement("span", {
    className: "st-link"
  }, "LangChain Engine"), "."), /*#__PURE__*/React.createElement("h2", {
    className: "st-art-h2"
  }, "Objectives"), /*#__PURE__*/React.createElement("p", null, "This project aims to provide a practical understanding of:"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, "How RAG pipelines ingest, chunk, vectorize, and retrieve knowledge."), /*#__PURE__*/React.createElement("li", null, "How semantic embeddings support accurate similarity search."), /*#__PURE__*/React.createElement("li", null, "The differences between custom pipelines and framework orchestration."), /*#__PURE__*/React.createElement("li", null, "Multi-provider LLM workflows, including ", /*#__PURE__*/React.createElement("span", {
    className: "st-mark st-mark--blue"
  }, "OpenAI"), ", ", /*#__PURE__*/React.createElement("span", {
    className: "st-mark st-mark--purple"
  }, "Gemini"), ", and local ", /*#__PURE__*/React.createElement("span", {
    className: "st-mark st-mark--orange"
  }, "Ollama"), ".")), /*#__PURE__*/React.createElement("blockquote", {
    className: "st-quote"
  }, "Native Engine includes advanced retrieval augmentations that LangChain does not perform by default."), /*#__PURE__*/React.createElement("h2", {
    className: "st-art-h2"
  }, "Two execution engines"), /*#__PURE__*/React.createElement("p", null, "A small inline-database table from the source Notion page, comparing the two engines that share the same retriever:"), /*#__PURE__*/React.createElement("div", {
    className: "st-inline-db"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-inline-db__head"
  }, /*#__PURE__*/React.createElement("span", null, "Engine"), /*#__PURE__*/React.createElement("span", null, "Runtime"), /*#__PURE__*/React.createElement("span", null, "Strength"), /*#__PURE__*/React.createElement("span", null, "Notes")), /*#__PURE__*/React.createElement("div", {
    className: "st-inline-db__row"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "st-page-icon"
  }, "\u26A1"), /*#__PURE__*/React.createElement("span", {
    className: "st-page-link"
  }, "Native Engine")), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, "Edge"), /*#__PURE__*/React.createElement("span", null, "Fastest, streaming-first"), /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, "Reverse RAG, HyDE, multi-stage rewriting")), /*#__PURE__*/React.createElement("div", {
    className: "st-inline-db__row"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "st-page-icon"
  }, "\uD83E\uDDE9"), /*#__PURE__*/React.createElement("span", {
    className: "st-page-link"
  }, "LangChain Engine")), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, "Node"), /*#__PURE__*/React.createElement("span", null, "Most modular, clearer orchestration"), /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, "Ideal for debugging, evaluation, chain composition"))), /*#__PURE__*/React.createElement("h2", {
    className: "st-art-h2"
  }, "Architecture snippet"), /*#__PURE__*/React.createElement("pre", {
    className: "st-code"
  }, /*#__PURE__*/React.createElement("code", null, `User → Retriever → Context Builder → Prompt → Reasoner → Parser → Citation Mapper`)), /*#__PURE__*/React.createElement("p", null, "The retriever is a thin wrapper over Supabase's", " ", /*#__PURE__*/React.createElement("span", {
    className: "st-code-inline"
  }, "match_chunks_openai_te3s_v1()"), " ", "RPC \u2014 same vectors, two pipelines.")));
}
window.StudioArticle = Article;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/studio/Article.jsx", error: String((e && e.message) || e) }); }

// ui_kits/studio/ChatWidget.jsx
try { (() => {
/* global React */
const {
  useState,
  useEffect,
  useRef
} = React;
const StudioIcons = window.StudioIcons;
const STARTERS = ["What does Jack work on?", "Explain the RAG pipeline", "What's the LangChain engine for?"];
function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread, busy]);
  function send(text) {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    setThread(t => [...t, {
      role: "user",
      text: q
    }]);
    setDraft("");
    setBusy(true);
    const reply = "I'd answer that for real on the live site — this widget is a static mock of how the assistant looks and feels in the studio chrome. The grounding, streaming, and citation pieces all run on the Edge runtime in production.";
    setThread(t => [...t, {
      role: "assistant",
      text: ""
    }]);
    let i = 0;
    const id = setInterval(() => {
      i += 5;
      setThread(t => {
        const next = t.slice();
        next[next.length - 1] = {
          role: "assistant",
          text: reply.slice(0, i)
        };
        return next;
      });
      if (i >= reply.length) {
        clearInterval(id);
        setBusy(false);
      }
    }, 28);
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "st-chat-fab" + (open ? " is-open" : ""),
    onClick: () => setOpen(!open),
    "aria-label": "Open Jack's assistant"
  }, open ? StudioIcons.close : StudioIcons.chat), open && /*#__PURE__*/React.createElement("div", {
    className: "st-chat-panel",
    role: "dialog",
    "aria-label": "Jack's AI Assistant"
  }, /*#__PURE__*/React.createElement("header", {
    className: "st-chat-panel__head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-chat-panel__avatar"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/avatar-jack.png",
    alt: ""
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "st-chat-panel__name"
  }, "Jack's AI Assistant"), /*#__PURE__*/React.createElement("div", {
    className: "st-chat-panel__sub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-status-dot"
  }), " Edge \xB7 ready")), /*#__PURE__*/React.createElement("button", {
    className: "st-chat-panel__close",
    onClick: () => setOpen(false)
  }, StudioIcons.close)), /*#__PURE__*/React.createElement("div", {
    className: "st-chat-panel__body",
    ref: bodyRef
  }, thread.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "st-chat-empty"
  }, /*#__PURE__*/React.createElement("p", {
    className: "st-chat-empty__hi"
  }, "Hi \u2014 I'm an AI assistant grounded in Jack's published work. Ask me anything about his projects, the RAG pipeline, or his career."), /*#__PURE__*/React.createElement("div", {
    className: "st-chat-starters"
  }, STARTERS.map((s, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "st-chat-starter",
    onClick: () => send(s)
  }, s)))) : thread.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `st-chat-msg st-chat-msg--${m.role}`
  }, m.role === "assistant" && /*#__PURE__*/React.createElement("div", {
    className: "st-chat-msg__av"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/avatar-jack.png",
    alt: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "st-chat-msg__bubble"
  }, m.text || /*#__PURE__*/React.createElement("span", {
    className: "st-chat-cursor"
  }))))), /*#__PURE__*/React.createElement("form", {
    className: "st-chat-panel__composer",
    onSubmit: e => {
      e.preventDefault();
      send();
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: draft,
    onChange: e => setDraft(e.target.value),
    placeholder: "Ask about Jack's work\u2026",
    disabled: busy
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: busy || !draft.trim()
  }, StudioIcons.send))));
}
window.StudioChatWidget = ChatWidget;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/studio/ChatWidget.jsx", error: String((e && e.message) || e) }); }

// ui_kits/studio/Footer.jsx
try { (() => {
/* global React */
const Icons = window.StudioIcons;
function Footer({
  theme,
  onToggleTheme
}) {
  const {
    BrandWordmark
  } = window;
  return /*#__PURE__*/React.createElement("footer", {
    className: "st-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-footer__inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-footer__copy"
  }, "\xA9 2026 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-primary)",
      fontWeight: 500
    }
  }, "Jack H. Park"), " \xB7 crafting products \u2014 sharing stories \u2014 exploring curiosity"), /*#__PURE__*/React.createElement("button", {
    className: "st-footer__theme",
    onClick: onToggleTheme,
    title: "Toggle dark mode"
  }, theme === "dark" ? Icons.sun : Icons.moon), /*#__PURE__*/React.createElement("div", {
    className: "st-footer__social"
  }, /*#__PURE__*/React.createElement("a", {
    className: "st-soc",
    href: "#",
    onClick: e => e.preventDefault(),
    title: "GitHub"
  }, Icons.github), /*#__PURE__*/React.createElement("a", {
    className: "st-soc",
    href: "#",
    onClick: e => e.preventDefault(),
    title: "LinkedIn"
  }, Icons.linkedin), /*#__PURE__*/React.createElement("a", {
    className: "st-soc",
    href: "#",
    onClick: e => e.preventDefault(),
    title: "YouTube"
  }, Icons.youtube), /*#__PURE__*/React.createElement("a", {
    className: "st-soc",
    href: "#",
    onClick: e => e.preventDefault(),
    title: "Instagram"
  }, Icons.instagram), /*#__PURE__*/React.createElement("a", {
    className: "st-soc",
    href: "#",
    onClick: e => e.preventDefault(),
    title: "Email"
  }, Icons.mail))));
}
window.StudioFooter = Footer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/studio/Footer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/studio/Header.jsx
try { (() => {
/* global React */
const {
  useState
} = React;
const Icons = window.StudioIcons;
function Header({
  route,
  onNav,
  theme,
  onToggleTheme
}) {
  const {
    BrandMark
  } = window;
  return /*#__PURE__*/React.createElement("header", {
    className: "st-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-header__inner"
  }, /*#__PURE__*/React.createElement("button", {
    className: "st-brand",
    onClick: () => onNav("home")
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-brand-mark"
  }, /*#__PURE__*/React.createElement(BrandMark, {
    variant: "filled-icon",
    size: 32
  })), /*#__PURE__*/React.createElement("div", {
    className: "st-brand__text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-brand__name"
  }, "Jack H. Park"), /*#__PURE__*/React.createElement("div", {
    className: "st-brand__tag"
  }, "STUDIO"))), /*#__PURE__*/React.createElement("nav", {
    className: "st-nav"
  }, /*#__PURE__*/React.createElement("button", {
    className: "st-nav__link" + (route === "home" ? " is-active" : ""),
    onClick: () => onNav("home")
  }, "Home"), /*#__PURE__*/React.createElement("button", {
    className: "st-nav__link" + (route === "personal" ? " is-active" : ""),
    onClick: () => onNav("personal")
  }, "Personal life"), /*#__PURE__*/React.createElement("button", {
    className: "st-nav__link",
    onClick: () => onNav("article")
  }, "Writing"), /*#__PURE__*/React.createElement("a", {
    className: "st-nav__link",
    href: "#",
    onClick: e => e.preventDefault()
  }, "Jack's AI Assistant ", /*#__PURE__*/React.createElement("span", {
    className: "st-nav__ext"
  }, Icons.ext))), /*#__PURE__*/React.createElement("div", {
    className: "st-header__rhs"
  }, /*#__PURE__*/React.createElement("button", {
    className: "st-header__icon",
    title: "Search"
  }, Icons.search), /*#__PURE__*/React.createElement("button", {
    className: "st-header__icon",
    title: "Theme",
    onClick: onToggleTheme
  }, theme === "dark" ? Icons.sun : Icons.moon))));
}
window.StudioHeader = Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/studio/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/studio/HomeIndex.jsx
try { (() => {
/* global React */
const Icons = window.StudioIcons;
const PROJECTS = [{
  id: "rag",
  title: "Hybrid RAG pipeline & LangChain integration",
  meta: "Project · Updated 2025-10-07",
  tag: "rag",
  cover: "linear-gradient(135deg, #DDEBF1 0%, #EAE4F2 50%, #FBE6EF 100%)",
  emoji: "🔁"
}, {
  id: "studio",
  title: "Personal studio · Notion + Next.js portfolio framework",
  meta: "Project · v0.1.0",
  tag: "framework",
  cover: "linear-gradient(135deg, #FBF3DB 0%, #FAEBDD 100%)",
  emoji: "🧱"
}, {
  id: "chat",
  title: "Edge-streaming chat assistant with grounded citations",
  meta: "Project · Live",
  tag: "ai",
  cover: "linear-gradient(135deg, #DCEFE5 0%, #DDEDEA 100%)",
  emoji: "💬"
}, {
  id: "photo",
  title: "Photography — analogue, mountain, city",
  meta: "Gallery · 24 frames",
  tag: "photo",
  cover: "linear-gradient(135deg, #E9E5E3 0%, #C2BDB0 100%)",
  emoji: "📷"
}];
const WRITING = [{
  title: "Architecting multi-provider LLM workflows",
  date: "Oct 7, 2025",
  read: "8 min"
}, {
  title: "Why HyDE made my RAG pipeline less wrong",
  date: "Sep 22, 2025",
  read: "5 min"
}, {
  title: "The PM case for shipping a hobby site",
  date: "Aug 04, 2025",
  read: "4 min"
}, {
  title: "Edge runtime, Node runtime, and your sanity",
  date: "Jul 18, 2025",
  read: "6 min"
}];
function HomeIndex({
  onOpenArticle
}) {
  return /*#__PURE__*/React.createElement("main", {
    className: "st-page st-page--index"
  }, /*#__PURE__*/React.createElement("header", {
    className: "st-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-hero__overline"
  }, "PERSONAL PORTFOLIO \xB7 2025"), /*#__PURE__*/React.createElement("h1", {
    className: "st-hero__title"
  }, "A studio of work, ideas, and experiments."), /*#__PURE__*/React.createElement("p", {
    className: "st-hero__lede"
  }, "I'm ", /*#__PURE__*/React.createElement("span", {
    className: "st-link"
  }, "Jack"), " \u2014 a PM who builds. This site collects the products I've shipped, the writing I do about them, and a live AI assistant that can answer questions about any of it.")), /*#__PURE__*/React.createElement("section", {
    className: "st-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-section__head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-overline"
  }, "SECTION 01 \xB7 PROJECTS"), /*#__PURE__*/React.createElement("h2", {
    className: "st-h2"
  }, "Recent work")), /*#__PURE__*/React.createElement("div", {
    className: "st-gallery"
  }, PROJECTS.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    className: "st-card",
    onClick: () => onOpenArticle(p.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-card__cover",
    style: {
      background: p.cover
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "st-card__emoji"
  }, p.emoji)), /*#__PURE__*/React.createElement("div", {
    className: "st-card__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-card__meta"
  }, p.meta), /*#__PURE__*/React.createElement("div", {
    className: "st-card__title"
  }, p.title)))))), /*#__PURE__*/React.createElement("section", {
    className: "st-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-section__head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st-overline"
  }, "SECTION 02 \xB7 WRITING"), /*#__PURE__*/React.createElement("h2", {
    className: "st-h2"
  }, "Recent writing")), /*#__PURE__*/React.createElement("ul", {
    className: "st-writing"
  }, WRITING.map((w, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    className: "st-writing__row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "st-writing__title",
    onClick: () => onOpenArticle("rag")
  }, w.title), /*#__PURE__*/React.createElement("span", {
    className: "st-writing__meta mono"
  }, w.date, " \xB7 ", w.read))))));
}
window.StudioHomeIndex = HomeIndex;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/studio/HomeIndex.jsx", error: String((e && e.message) || e) }); }

// ui_kits/studio/Icons.jsx
try { (() => {
/* global React */
/* Studio kit icon wrapper — pulls from the shared Phosphor SVG library
   (window.Phosphor in ../PhosphorIcons.jsx) per Brand Guidelines §6.1. */
const StudioIcons = {
  search: React.createElement(window.Phosphor, {
    name: "magnifying-glass",
    size: 16
  }),
  sun: React.createElement(window.Phosphor, {
    name: "sun",
    size: 16
  }),
  moon: React.createElement(window.Phosphor, {
    name: "moon",
    size: 16
  }),
  github: React.createElement(window.Phosphor, {
    name: "github-logo",
    size: 16
  }),
  linkedin: React.createElement(window.Phosphor, {
    name: "linkedin-logo",
    size: 16
  }),
  instagram: React.createElement(window.Phosphor, {
    name: "instagram-logo",
    size: 16
  }),
  youtube: React.createElement(window.Phosphor, {
    name: "youtube-logo",
    size: 16
  }),
  mail: React.createElement(window.Phosphor, {
    name: "envelope-simple",
    size: 16
  }),
  chat: React.createElement(window.Phosphor, {
    name: "chat-circle",
    size: 22,
    color: "#fff"
  }),
  close: React.createElement(window.Phosphor, {
    name: "x",
    size: 16
  }),
  send: React.createElement(window.Phosphor, {
    name: "paper-plane-tilt",
    size: 14,
    color: "#fff"
  }),
  ext: React.createElement(window.Phosphor, {
    name: "arrow-square-out",
    size: 12
  })
};
window.StudioIcons = StudioIcons;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/studio/Icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.JhpMark = __ds_scope.JhpMark;

})();
