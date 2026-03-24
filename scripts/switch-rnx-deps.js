// scripts/switch-rnx-deps.js
import fs from "node:fs";
import path from "node:path";

function main() {
  const mode = process.argv[2];
  const tag = process.argv[3];

  if (!["local", "remote"].includes(mode)) {
    throw new Error("Usage: node switch-rnx-deps.js [local|remote] [tag]");
  }

  if (mode === "remote" && !tag) {
    throw new Error(
      'Usage: node switch-rnx-deps.js remote <tag>  (e.g. "7.7.1-jp.4")',
    );
  }

  const pkgPath = path.resolve("./package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  if (mode === "local") {
    pkg.dependencies["react-notion-x"] =
      "file:../react-notion-x/packages/react-notion-x";
    pkg.dependencies["notion-utils"] =
      "link:../react-notion-x/packages/notion-utils";
    pkg.dependencies["notion-types"] =
      "link:../react-notion-x/packages/notion-types";
    pkg.dependencies["notion-client"] =
      "link:../react-notion-x/packages/notion-client";
    pkg.pnpm = pkg.pnpm ?? {};
    pkg.pnpm.overrides = pkg.pnpm.overrides ?? {};
    pkg.pnpm.overrides["react-notion-x"] =
      "link:../react-notion-x/packages/react-notion-x";
    pkg.pnpm.overrides["notion-utils"] =
      "link:../react-notion-x/packages/notion-utils";
    pkg.pnpm.overrides["notion-types"] =
      "link:../react-notion-x/packages/notion-types";
    pkg.pnpm.overrides["notion-client"] =
      "link:../react-notion-x/packages/notion-client";
    console.log("✅ Switched to LOCAL react-notion-x");
  }

  if (mode === "remote") {
    pkg.dependencies["react-notion-x"] =
      `github:jack-h-park/react-notion-x#${tag}`;
    pkg.dependencies["notion-utils"] = "7.7.1";
    pkg.dependencies["notion-types"] = "7.7.1";
    pkg.dependencies["notion-client"] = "7.7.1";
    pkg.pnpm = pkg.pnpm ?? {};
    pkg.pnpm.overrides = pkg.pnpm.overrides ?? {};
    delete pkg.pnpm.overrides["react-notion-x"];
    delete pkg.pnpm.overrides["notion-utils"];
    delete pkg.pnpm.overrides["notion-types"];
    delete pkg.pnpm.overrides["notion-client"];
    console.log(`✅ Switched to REMOTE react-notion-x @ ${tag}`);
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

main();
