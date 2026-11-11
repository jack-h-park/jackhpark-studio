import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pageFile = /^pages\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.tsx$/;
const cssFile = /^pages\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.module\.css$/;
const reserved = new Set(["admin", "api", "index", "studio", "chat"]);
const configFields = new Set([
  "name",
  "author",
  "host",
  "linkedin",
  "description",
]);
const tags = new Set(
  "a article b blockquote br code div em footer h1 h2 h3 h4 h5 h6 header hr img li link main meta nav ol p pre section small span strong table tbody td th thead title tr ul".split(
    " ",
  ),
);

const sourceExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
];

// Graph traversal and ownership checks must identify the same committed path,
// including equivalent alias/baseUrl paths with dot segments.
function modulePath(importer, specifier) {
  const clean = specifier.split(/[?#]/)[0];
  const local = clean.startsWith("@/")
    ? clean.slice(2)
    : clean.startsWith(".")
      ? path.posix.join(path.posix.dirname(importer), clean)
      : clean;
  return path.posix.normalize(local).replace(/\/$/, "");
}

export function staticRoute(file) {
  const match = pageFile.exec(file) ?? cssFile.exec(file);
  return match && !reserved.has(match[1]) ? `/${match[1]}` : null;
}

// Deliberately recognize a small pure subset, rather than execute a page or infer
// safety from a .tsx suffix. Unsupported syntax keeps the full sitemap sweep.
function purePage(source, slug, ts) {
  const ast = ts.createSourceFile(
    `${slug}.tsx`,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (ast.parseDiagnostics.length) return false;
  const constants = new Set();
  const imports = new Set();
  let hasPage = false;
  let ownsCss = false;
  const expression = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNumericLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    )
      return true;
    if (
      [
        ts.SyntaxKind.TrueKeyword,
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword,
      ].includes(node.kind)
    )
      return true;
    if (ts.isIdentifier(node)) return constants.has(node.text);
    if (ts.isParenthesizedExpression(node)) return expression(node.expression);
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      return (
        (node.expression.text === "config" &&
          imports.has("config") &&
          configFields.has(node.name.text)) ||
        (node.expression.text === "styles" &&
          ownsCss &&
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(node.name.text))
      );
    }
    if (ts.isTemplateExpression(node))
      return node.templateSpans.every((span) => expression(span.expression));
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    )
      return jsx(node);
    return false;
  };
  const jsx = (node) => {
    if (ts.isJsxText(node)) return true;
    if (ts.isJsxExpression(node))
      return !node.expression || expression(node.expression);
    if (ts.isJsxFragment(node)) return node.children.every(jsx);
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (!ts.isIdentifier(opening.tagName)) return false;
    const name = opening.tagName.text;
    if (!(tags.has(name) || (name === "Head" && imports.has("Head"))))
      return false;
    if (
      !opening.attributes.properties.every((attr) => {
        if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name))
          return false;
        if (
          /^on/i.test(attr.name.text) ||
          ["ref", "dangerouslySetInnerHTML"].includes(attr.name.text)
        )
          return false;
        return (
          !attr.initializer ||
          ts.isStringLiteral(attr.initializer) ||
          (ts.isJsxExpression(attr.initializer) &&
            !!attr.initializer.expression &&
            expression(attr.initializer.expression))
        );
      })
    )
      return false;
    return !ts.isJsxElement(node) || node.children.every(jsx);
  };
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.attributes ||
        statement.importClause?.isTypeOnly
      )
        return false;
      const clause = statement.importClause;
      const from = statement.moduleSpecifier.text;
      if (
        from === "next/head" &&
        clause?.name?.text === "Head" &&
        !clause.namedBindings &&
        !imports.has("Head")
      )
        imports.add("Head");
      else if (
        from === "@/lib/config" &&
        !clause?.name &&
        clause?.namedBindings &&
        ts.isNamespaceImport(clause.namedBindings) &&
        clause.namedBindings.name.text === "config" &&
        !imports.has("config")
      )
        imports.add("config");
      else if (
        from === `./${slug}.module.css` &&
        clause?.name?.text === "styles" &&
        !clause.namedBindings &&
        !ownsCss
      )
        ownsCss = true;
      else return false;
    } else if (ts.isVariableStatement(statement)) {
      if (
        statement.modifiers?.length ||
        statement.declarationList.flags !== ts.NodeFlags.Const
      )
        return false;
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          !declaration.initializer ||
          ![
            ts.SyntaxKind.StringLiteral,
            ts.SyntaxKind.NumericLiteral,
            ts.SyntaxKind.TrueKeyword,
            ts.SyntaxKind.FalseKeyword,
            ts.SyntaxKind.NoSubstitutionTemplateLiteral,
          ].includes(declaration.initializer.kind)
        )
          return false;
        if (
          constants.has(declaration.name.text) ||
          ["styles", "config", "Head"].includes(declaration.name.text)
        )
          return false;
        constants.add(declaration.name.text);
      }
    } else if (ts.isFunctionDeclaration(statement)) {
      const modifiers = statement.modifiers?.map((m) => m.kind) ?? [];
      if (
        hasPage ||
        modifiers.length !== 2 ||
        !modifiers.includes(ts.SyntaxKind.ExportKeyword) ||
        !modifiers.includes(ts.SyntaxKind.DefaultKeyword) ||
        statement.asteriskToken ||
        statement.parameters.length ||
        statement.typeParameters?.length ||
        !statement.body ||
        statement.body.statements.length !== 1
      )
        return false;
      const returned = statement.body.statements[0];
      if (
        !ts.isReturnStatement(returned) ||
        !returned.expression ||
        !expression(returned.expression)
      )
        return false;
      hasPage = true;
    } else return false;
  }
  return hasPage ? { ownsCss } : false;
}

function regularText(git, revision, file) {
  const tree = git("ls-tree", revision, "--", file);
  if (!tree) return null;
  if (!tree.startsWith("100644 blob "))
    throw new Error("non-regular static page input");
  return git("show", `${revision}:${file}`);
}

function checkCss(git, revision, file) {
  const css = regularText(git, revision, file);
  if (css === null || /@|:global|composes\s*:|\\/i.test(css)) return false;
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let end = 0;
  for (const rule of plain.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    if (plain.slice(end, rule.index).trim()) return false;
    // Every selector must remain below a locally scoped module class. Global
    // element selectors and sibling combinators can affect unrelated pages.
    if (
      !rule[1]
        .split(",")
        .every(
          (selector) =>
            /^\.[a-zA-Z_][\w-]*(?=[\s.:#>[\]]|$)/.test(selector.trim()) &&
            !/[+~]/.test(selector),
        )
    )
      return false;
    end = rule.index + rule[0].length;
  }
  if (plain.slice(end).trim()) return false;
  return true;
}

// Analyze committed snapshots, never the worktree or executable page modules.
// Unknown dynamic module loading prevents an independence proof.
function runtimeImports(git, revision, ts) {
  const allNames = git("ls-tree", "-r", "--name-only", revision)
    .trim()
    .split("\n");
  const names = allNames
    .filter(
      (file) =>
        !/^(test|tests|scripts|docs|__checks__|playwright)\//.test(file),
    )
    .filter((file) => /\.(?:[cm]?[jt]sx?|mdx|scss|sass|less|css)$/.test(file));
  if (names.length > 1500)
    throw new Error("runtime graph exceeds analysis bound");
  const imports = [];
  const queued = new Set(names);
  let bytes = 0;
  for (const file of names) {
    const source = regularText(git, revision, file);
    bytes += source.length;
    if (bytes > 20 * 1024 * 1024)
      throw new Error("runtime graph exceeds byte bound");
    if (/\.(?:mdx|scss|sass|less)$/.test(file))
      throw new Error("unsupported runtime source format");
    if (file.endsWith(".css")) {
      // CSS imports can also share a module without a JavaScript consumer.
      for (const match of source.matchAll(/(?:@import|composes\s*:)[^;{}]*/g))
        imports.push({ file, raw: match[0] });
      continue;
    }
    const kind = /\.[cm]?tsx$/.test(file)
      ? ts.ScriptKind.TSX
      : file.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : /\.[cm]?ts$/.test(file)
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    if (ast.parseDiagnostics.length)
      throw new Error(`unparseable runtime source: ${file}`);
    let checker;
    const declarationOf = (node) => {
      // Resolve the actual lexical binding, not a same-named string elsewhere.
      // This accepts the existing immutable external Mermaid URL, while an
      // unresolved/shadowed/computed local import still retains full coverage.
      if (!checker) {
        const options = {
          noLib: true,
          noResolve: true,
          types: [],
          typeRoots: [],
          allowJs: true,
          jsx: ts.JsxEmit.Preserve,
        };
        const host = ts.createCompilerHost(options);
        host.getSourceFile = (name) => (name === file ? ast : undefined);
        host.fileExists = () => false;
        host.readFile = () => undefined;
        host.getDirectories = () => [];
        host.readDirectory = () => [];
        checker = ts.createProgram([file], options, host).getTypeChecker();
      }
      const symbol = checker.getSymbolAtLocation(node);
      return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    };
    const moduleString = (node) => {
      if (ts.isStringLiteralLike(node)) return node.text;
      if (ts.isIdentifier(node)) {
        const declaration = declarationOf(node);
        if (
          declaration &&
          ts.isVariableDeclaration(declaration) &&
          declaration.parent.flags & ts.NodeFlags.Const &&
          declaration.initializer &&
          ts.isStringLiteralLike(declaration.initializer)
        )
          return declaration.initializer.text;
      }
      throw new Error(`computed runtime import: ${file}`);
    };
    const unparen = (node) => {
      while (ts.isParenthesizedExpression(node)) node = node.expression;
      return node;
    };
    const factoryNames = new Set(
      ast.statements.flatMap((statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        ["module", "node:module"].includes(statement.moduleSpecifier.text) &&
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)
          ? statement.importClause.namedBindings.elements
              .filter(
                (item) =>
                  (item.propertyName ?? item.name).text === "createRequire",
              )
              .map((item) => item.name.text)
          : [],
      ),
    );
    const loaderNames = new Set();
    const findLoaders = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const init = unparen(node.initializer);
        if (
          ts.isCallExpression(init) &&
          ts.isIdentifier(unparen(init.expression)) &&
          factoryNames.has(unparen(init.expression).text)
        )
          loaderNames.add(node.name.text);
      }
      ts.forEachChild(node, findLoaders);
    };
    if (factoryNames.size) findLoaders(ast);
    const isFactory = (node) => {
      if (!ts.isIdentifier(node) || !factoryNames.has(node.text)) return false;
      const declaration = declarationOf(node);
      if (
        !declaration ||
        !ts.isImportSpecifier(declaration) ||
        (declaration.propertyName ?? declaration.name).text !== "createRequire"
      )
        return false;
      const from = declaration.parent.parent.parent.moduleSpecifier;
      return (
        from &&
        ts.isStringLiteral(from) &&
        ["node:module", "module"].includes(from.text)
      );
    };
    const isLoader = (node) => {
      if (!ts.isIdentifier(node) || !loaderNames.has(node.text)) return false;
      const declaration = declarationOf(node);
      if (
        !declaration ||
        !ts.isVariableDeclaration(declaration) ||
        !(declaration.parent.flags & ts.NodeFlags.Const) ||
        !declaration.initializer
      )
        return false;
      const init = unparen(declaration.initializer);
      return ts.isCallExpression(init) && isFactory(unparen(init.expression));
    };
    const directCall = (node) => {
      let outer = node;
      while (ts.isParenthesizedExpression(outer.parent)) outer = outer.parent;
      return (
        ts.isCallExpression(outer.parent) && outer.parent.expression === outer
      );
    };
    function moduleReference(node) {
      // Unanalysed loader aliases and code generation can conceal inbound page
      // dependencies. Recognize direct literal loaders; otherwise fail closed.
      if (ts.isIdentifier(node)) {
        const isDeclarationName =
          (ts.isVariableDeclaration(node.parent) ||
            ts.isParameter(node.parent) ||
            ts.isImportSpecifier(node.parent)) &&
          node.parent.name === node;
        const propertyName =
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.name === node;
        if (["eval", "Function"].includes(node.text) && !isDeclarationName)
          throw new Error("runtime code generation");
        if (
          (node.text === "require" && !propertyName) ||
          isFactory(node) ||
          isLoader(node)
        ) {
          if (!isDeclarationName && !directCall(node))
            throw new Error("escaped module loader");
        }
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        ["require", "createRequire", "_load"].includes(
          node.argumentExpression.text,
        )
      )
        throw new Error("computed module loader");
      if (
        ts.isPropertyAccessExpression(node) &&
        ["require", "createRequire", "_load"].includes(node.name.text) &&
        !directCall(node)
      )
        throw new Error("escaped module loader");
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        specifier = node.moduleSpecifier;
      else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        specifier = node.moduleReference.expression;
      else if (ts.isCallExpression(node)) {
        const callee = unparen(node.expression);
        if (
          ts.isPropertyAccessExpression(callee) &&
          ["glob", "globEager"].includes(callee.name.text) &&
          ts.isMetaProperty(callee.expression)
        )
          throw new Error("runtime glob import");
        if (isFactory(callee)) {
          const arg = node.arguments[0];
          if (
            node.arguments.length !== 1 ||
            !arg ||
            !ts.isPropertyAccessExpression(arg) ||
            !ts.isMetaProperty(arg.expression) ||
            arg.expression.keywordToken !== ts.SyntaxKind.ImportKeyword ||
            arg.name.text !== "url" ||
            !ts.isVariableDeclaration(node.parent) ||
            !(node.parent.parent.flags & ts.NodeFlags.Const) ||
            !ts.isIdentifier(node.parent.name)
          )
            throw new Error("unsupported require factory");
        } else if (
          ts.isPropertyAccessExpression(callee) &&
          ["createRequire", "_load"].includes(callee.name.text)
        )
          throw new Error("unsupported module loader");
        if (
          callee.kind === ts.SyntaxKind.ImportKeyword ||
          isLoader(callee) ||
          (ts.isIdentifier(callee) && callee.text === "require") ||
          (ts.isPropertyAccessExpression(callee) &&
            (callee.name.text === "require" ||
              (ts.isIdentifier(callee.expression) &&
                callee.expression.text === "require")))
        ) {
          if (node.arguments.length !== 1)
            throw new Error(`computed runtime import: ${file}`);
          specifier = node.arguments[0];
        }
      }
      if (specifier) {
        const value = moduleString(specifier);
        if (["vm", "node:vm", "module", "node:module"].includes(value)) {
          if (
            !ts.isImportDeclaration(node) ||
            !node.importClause ||
            node.importClause.name ||
            !node.importClause.namedBindings ||
            !ts.isNamedImports(node.importClause.namedBindings) ||
            !node.importClause.namedBindings.elements.every(
              (item) =>
                (item.propertyName ?? item.name).text === "createRequire",
            )
          )
            throw new Error("unsupported runtime module facility");
        }
        imports.push({ file, specifier: value });
        const local = modulePath(file, value);
        // A package main/exports entry can win over an otherwise valid index
        // candidate. Unsupported package metadata must not hide that edge.
        if (allNames.includes(`${local}/package.json`))
          throw new Error("unsupported local package entry");
        const candidates = [
          local,
          ...sourceExtensions.flatMap((extension) => [
            local + extension,
            `${local}/index${extension}`,
          ]),
        ];
        const explicitLocal = value.startsWith(".") || value.startsWith("@/");
        const projectRoot = local.split("/")[0];
        const baseUrlLocal = allNames.some((name) =>
          name.startsWith(`${projectRoot}/`),
        );
        if (
          (explicitLocal || baseUrlLocal) &&
          !candidates.some((candidate) => allNames.includes(candidate))
        )
          throw new Error("unresolved local runtime import");
        for (const candidate of candidates) {
          if (
            allNames.includes(candidate) &&
            !queued.has(candidate) &&
            /\.(?:[cm]?[jt]sx?|mdx|scss|sass|less|css)$/.test(candidate)
          ) {
            if (queued.size >= 1500)
              throw new Error("runtime graph exceeds analysis bound");
            queued.add(candidate);
            names.push(candidate);
          }
        }
      }
      ts.forEachChild(node, moduleReference);
    }
    moduleReference(ast);
  }
  return imports;
}

function exclusiveOwner(imports, owner, css) {
  const pageBase = owner.replace(/\.tsx$/, "");
  return imports.every(({ file, specifier, raw }) => {
    if (raw)
      return !raw.includes("\\") && !raw.includes(path.posix.basename(css));
    const resolved = modulePath(file, specifier);
    if (resolved.replace(/\.[cm]?[jt]sx?$/, "") === pageBase) return false;
    return resolved !== css || file === owner;
  });
}

export function verifyStaticPages(git, baseline, current, files) {
  const ts = require(process.env.STATIC_PAGE_TYPESCRIPT_PATH || "typescript");
  const routes = [...new Set(files.map(staticRoute))];
  if (routes.includes(null) || routes.length > 20) return null;
  const graphs = new Map(
    [baseline, current].map((revision) => [
      revision,
      runtimeImports(git, revision, ts),
    ]),
  );
  for (const route of routes) {
    const slug = route.slice(1);
    const owner = `pages/${slug}.tsx`;
    const css = `pages/${slug}.module.css`;
    for (const revision of [baseline, current]) {
      const source = regularText(git, revision, owner);
      if (source === null) {
        if (revision === current || regularText(git, revision, css) !== null)
          return null;
        continue;
      }
      if (!exclusiveOwner(graphs.get(revision), owner, css)) return null;
      const proof = purePage(source, slug, ts);
      if (!proof || (proof.ownsCss && !checkCss(git, revision, css)))
        return null;
      if (files.includes(css) && !proof.ownsCss) return null;
    }
  }
  return routes;
}
