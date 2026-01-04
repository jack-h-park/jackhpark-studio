import type { BlockNode, InlineNode } from "./types";

export type ParserOptions = {
  allowCodeBlocks?: boolean;
};

function parseInlines(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let currentText = "";
  let i = 0;

  const pushText = () => {
    if (currentText) {
      nodes.push({ type: "text", text: currentText });
      currentText = "";
    }
  };

  while (i < text.length) {
    // Check for inline code `...`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        pushText();
        nodes.push({
          type: "inlineCode",
          code: text.slice(i + 1, end),
        });
        i = end + 1;
        continue;
      }
    }

    // Check for strong **...**
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        pushText();
        nodes.push({
          type: "strong",
          children: parseInlines(text.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    // Check for em *...*
    // Note: This is a very simple check and might match * in valid text, but "Lite" constraint accepts this tradeoff for simplicity/safety.
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        pushText();
        nodes.push({
          type: "em",
          children: parseInlines(text.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }

    // Check for link [label](href)
    if (text[i] === "[") {
      const labelEnd = text.indexOf("]", i + 1);
      if (labelEnd !== -1 && text[labelEnd + 1] === "(") {
        const hrefEnd = text.indexOf(")", labelEnd + 2);
        if (hrefEnd !== -1) {
          pushText();
          nodes.push({
            type: "link",
            label: text.slice(i + 1, labelEnd),
            href: text.slice(labelEnd + 2, hrefEnd),
          });
          i = hrefEnd + 1;
          continue;
        }
      }
    }

    currentText += text[i];
    i++;
  }

  pushText();
  return nodes;
}

export function parseMarkdownLite(
  text: string,
  options: ParserOptions = {},
): BlockNode[] {
  if (!text) return [];

  // Normalize line endings and trim
  const cleanText = text.replaceAll("\r\n", "\n").trim();
  const lines = cleanText.split("\n");
  const blocks: BlockNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code Block
    if (options.allowCodeBlocks && trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      let code = "";
      let j = i + 1;
      let foundEnd = false;

      while (j < lines.length) {
        if (lines[j].trim().startsWith("```")) {
          foundEnd = true;
          break;
        }
        code += (code ? "\n" : "") + lines[j];
        j++;
      }

      if (foundEnd) {
        blocks.push({
          type: "codeblock",
          language: lang || undefined,
          code,
        });
        i = j + 1;
        continue;
      }
      // If no end block found, treat opening line as paragraph
    }

    // Lists
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const unorderedMatch = line.match(/^(\s*)([-*])\s+(.*)$/);

    if (orderedMatch || unorderedMatch) {
      const isOrdered = !!orderedMatch;
      const items: InlineNode[][] = [];

      // Process first item
      const content = isOrdered ? orderedMatch![3] : unorderedMatch![3];
      items.push(parseInlines(content));

      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        const nextOrdered = nextLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
        const nextUnordered = nextLine.match(/^(\s*)([-*])\s+(.*)$/);

        if (isOrdered && nextOrdered) {
          items.push(parseInlines(nextOrdered[3]));
          j++;
        } else if (!isOrdered && nextUnordered) {
          items.push(parseInlines(nextUnordered[3]));
          j++;
        } else {
          break;
        }
      }

      blocks.push({
        type: "list",
        ordered: isOrdered,
        items,
      });
      i = j;
      continue;
    }

    // Paragraph
    // Group consecutive non-empty lines essentially (or treating single lines as paragraphs? usually markdown groups them).
    // Let's implement simple paragraph grouping until a blank line.
    let paragraphText = line; // Maintain original whitespace? Typically markdown condenses.
    // For "Lite" parser, let's keep it simple: consume lines until we hit a special block start or blank line.
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      const nextTrimmed = nextLine.trim();

      // Break on blank line
      if (!nextTrimmed) break;

      // Break on code block start
      if (options.allowCodeBlocks && nextTrimmed.startsWith("```")) break;

      // Break on list item start
      if (
        /^(\s*)(\d+)\.\s+(.*)$/.test(nextLine) ||
        /^(\s*)([-*])\s+(.*)$/.test(nextLine)
      )
        break;

      paragraphText += " " + nextLine.trim(); // Fold lines with space
      j++;
    }

    blocks.push({
      type: "paragraph",
      children: parseInlines(paragraphText.trim()),
    });
    i = j;
  }

  return blocks;
}
