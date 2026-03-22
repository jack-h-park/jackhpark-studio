// scripts/switch-rnx-deps.js
import fs from "node:fs";
import path from "node:path";

function main() {
  const mode = process.argv[2];

  if (!["local", "remote"].includes(mode)) {
    throw new Error("Usage: node switch-rnx-deps.js [local|remote]");
  }

  const pkgPath = path.resolve("./package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  if (mode === "local") {
    pkg.dependencies["react-notion-x"] =
      "file:../react-notion-x/packages/react-notion-x";
    console.log("✅ Switched to LOCAL react-notion-x");
  }

  if (mode === "remote") {
    pkg.dependencies["react-notion-x"] =
      "github:jack-h-park/react-notion-x#7.7.1-jp.2";
    console.log("✅ Switched to REMOTE react-notion-x");
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

main();
