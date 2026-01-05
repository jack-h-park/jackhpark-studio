import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const aiDesignSystem = "styles/ai-design-system.css";
const featureCssFiles = [
  aiDesignSystem,
  "styles/admin-doc-preview.css",
  "styles/meta-card.css",
  "styles/diagnostics-display-card.css",
];

const forbiddenKeywords = [
  "admin",
  "diagnostics",
  "meta-card",
  "documents",
  "page-social",
  "history-preview",
  "preset-effects",
  "allowlist",
];

// Color literals are forbidden outside the token section in ai-design-system.css.
// We intentionally flag literals in feature CSS too (it should remain token-driven).
// Note: we later skip hash fragments inside url(...#...) to avoid false positives.
const colorLiteralRegex = /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/i;
const rawTokenRegex =
  /var\(--ai-(?:bg(?:-[^)]*)?|fg(?:-[^)]*)?|border(?:-[^)]*)?|surface(?:-[^)]*)?)/;

function isUrlHashFragment(line) {
  const lower = line.toLowerCase();
  const urlIdx = lower.indexOf("url(");
  if (urlIdx === -1) return false;
  const hashIdx = lower.indexOf("#", urlIdx);
  if (hashIdx === -1) return false;
  const closeIdx = lower.indexOf(")", urlIdx);
  return closeIdx !== -1 && hashIdx < closeIdx;
}

function isDirective(line) {
  const trimmed = line.trim();
  if (
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/") ||
    trimmed.startsWith("//")
  ) {
    return false;
  }
  // Skip Tailwind/layer directives; we still want to scan regular CSS.
  return (
    trimmed.startsWith("@tailwind") ||
    trimmed.includes("@apply") ||
    trimmed.includes("@layer")
  );
}

function report(errors, file, lineNum, rule, excerpt) {
  errors.push({
    file,
    line: lineNum,
    rule,
    excerpt: excerpt.trim(),
  });
}

async function checkFile(relativePath) {
  const filePath = path.resolve(projectRoot, relativePath);
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  const isAiFile = relativePath === aiDesignSystem;
  let tokenStart = -1;
  let tokenEnd = -1;

  if (isAiFile) {
    tokenStart = lines.findIndex((line) => line.includes("/* Design Tokens"));
    tokenEnd = lines.findIndex((line, index) => {
      return index > tokenStart && line.includes("/* Utilities");
    });
  }

  const errors = [];

  const inTokenSection = (index) =>
    isAiFile &&
    tokenStart >= 0 &&
    tokenEnd > tokenStart &&
    index >= tokenStart &&
    index < tokenEnd;

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    const lower = line.toLowerCase();
    if (isAiFile) {
      for (const keyword of forbiddenKeywords) {
        if (lower.includes(keyword)) {
          report(
            errors,
            relativePath,
            lineNum,
            "feature-keyword",
            `${line}  // Keyword "${keyword}" not allowed in ${relativePath}`,
          );
          break;
        }
      }
    }

    if (!isDirective(line)) {
      const skipColorCheck = isAiFile && inTokenSection(index) ? true : false;

      if (!skipColorCheck && colorLiteralRegex.test(line)) {
        // Avoid flagging url(...#...) fragments (e.g., SVG filters or in-page anchors).
        if (!isUrlHashFragment(line)) {
          report(errors, relativePath, lineNum, "color-literal", line);
        }
      }

      if (isAiFile && !inTokenSection(index) && rawTokenRegex.test(line)) {
        report(errors, relativePath, lineNum, "raw-token", line);
      }
    }
  });

  return errors;
}

async function main() {
  const allErrors = [];

  for (const relativePath of featureCssFiles) {
    const errors = await checkFile(relativePath);
    allErrors.push(...errors);
  }

  if (allErrors.length > 0) {
    console.error("CSS guardrail violations:");
    allErrors.forEach(({ file, line, rule, excerpt }) => {
      console.error(`${file}:${line} [${rule}] ${excerpt}`);
    });
    process.exitCode = 1;
  } else {
    console.log("CSS guardrails passed.");
  }
}

main().catch((err) => {
  console.error("Failed to run CSS guardrails:", err);
  process.exit(1);
});
