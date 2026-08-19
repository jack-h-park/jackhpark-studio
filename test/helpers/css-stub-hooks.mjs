// CSS modules resolve to an empty object; class names render as `undefined`
// in markup, which is acceptable for structural assertions in unit tests.
//
// `server-only` is stubbed for the same reason: it throws on import outside Next's
// react-server condition, which would otherwise make every server route untestable under
// `node --test`. The stub removes the import guard, not the behaviour being tested — a
// route's own logic is what the tests exercise.
export async function load(url, context, nextLoad) {
  if (url.split("?")[0].endsWith(".css")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default {};",
    };
  }
  if (/[/\\]node_modules[/\\]server-only[/\\]/.test(url)) {
    return { format: "module", shortCircuit: true, source: "export {};" };
  }
  return nextLoad(url, context);
}
