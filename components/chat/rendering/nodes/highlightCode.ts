// Dependency-free lexical highlighter for chat code blocks. Intentionally
// coarse: it only distinguishes comments, strings, numbers, and keywords,
// which reads well at chat size without pulling in a highlighting library.

export type CodeToken = {
  type: "plain" | "keyword" | "string" | "comment" | "number";
  text: string;
};

const JS_KEYWORDS = new Set([
  "abstract",
  "any",
  "as",
  "async",
  "await",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "number",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "static",
  "string",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
]);

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

const SQL_KEYWORDS = new Set([
  "alter",
  "and",
  "as",
  "asc",
  "begin",
  "by",
  "case",
  "create",
  "delete",
  "desc",
  "distinct",
  "drop",
  "else",
  "end",
  "exists",
  "from",
  "group",
  "having",
  "in",
  "index",
  "inner",
  "insert",
  "into",
  "is",
  "join",
  "left",
  "like",
  "limit",
  "not",
  "null",
  "on",
  "or",
  "order",
  "outer",
  "primary",
  "right",
  "select",
  "set",
  "table",
  "then",
  "union",
  "update",
  "values",
  "when",
  "where",
  "with",
]);

const SHELL_KEYWORDS = new Set([
  "case",
  "do",
  "done",
  "echo",
  "elif",
  "else",
  "esac",
  "exit",
  "export",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "local",
  "return",
  "then",
  "while",
]);

type LangFamily = "js" | "python" | "sql" | "shell";

function resolveFamily(language?: string): LangFamily {
  const lang = (language ?? "").toLowerCase();
  if (["py", "python", "python3"].includes(lang)) return "python";
  if (["sql", "postgres", "postgresql", "plpgsql"].includes(lang)) return "sql";
  if (["sh", "bash", "shell", "zsh"].includes(lang)) return "shell";
  return "js";
}

const KEYWORDS: Record<LangFamily, Set<string>> = {
  js: JS_KEYWORDS,
  python: PYTHON_KEYWORDS,
  sql: SQL_KEYWORDS,
  shell: SHELL_KEYWORDS,
};

// Alternation order matters: comments swallow string-ish content and strings
// swallow comment markers, so both must win over numbers/words.
// The string sub-patterns are linear-time: `[^"\\\n]` and `\\.` are disjoint
// on their first char, so there is no backtracking ambiguity despite the
// linter's conservative detect-unsafe-regex heuristic.
/* eslint-disable security/detect-unsafe-regex */
const JS_PATTERN =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d[\d_]*(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g;
const HASH_PATTERN =
  /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(\d[\d_]*(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g;
const SQL_PATTERN =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|\b(\d[\d_]*(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g;
/* eslint-enable security/detect-unsafe-regex */

const PATTERNS: Record<LangFamily, RegExp> = {
  js: JS_PATTERN,
  python: HASH_PATTERN,
  shell: HASH_PATTERN,
  sql: SQL_PATTERN,
};

export function tokenizeCode(code: string, language?: string): CodeToken[] {
  const family = resolveFamily(language);
  const keywords = KEYWORDS[family];
  // Shared module-level regex: JS execution is single-threaded, so resetting
  // lastIndex before each run is enough to avoid state leaking between calls.
  const pattern = PATTERNS[family];
  pattern.lastIndex = 0;
  const caseInsensitiveKeywords = family === "sql";

  const tokens: CodeToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "plain", text: code.slice(lastIndex, match.index) });
    }
    const [, comment, str, num, word] = match;
    if (comment !== undefined) {
      tokens.push({ type: "comment", text: comment });
    } else if (str !== undefined) {
      tokens.push({ type: "string", text: str });
    } else if (num !== undefined) {
      tokens.push({ type: "number", text: num });
    } else if (word !== undefined) {
      const candidate = caseInsensitiveKeywords ? word.toLowerCase() : word;
      tokens.push({
        type: keywords.has(candidate) ? "keyword" : "plain",
        text: word,
      });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push({ type: "plain", text: code.slice(lastIndex) });
  }

  return tokens;
}
