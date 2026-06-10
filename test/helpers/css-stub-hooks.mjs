// CSS modules resolve to an empty object; class names render as `undefined`
// in markup, which is acceptable for structural assertions in unit tests.
export async function load(url, context, nextLoad) {
  if (url.split("?")[0].endsWith(".css")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default {};",
    };
  }
  return nextLoad(url, context);
}
