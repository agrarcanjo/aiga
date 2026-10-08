const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
// Signing changes PE bytes. Hash the final distributed files, after electron-builder signs them.
module.exports = async ({ appOutDir, electronPlatformName }) => {
  if (electronPlatformName !== "win32") return;
  const directory = path.join(appOutDir, "resources", "resources", "capture-compat", "x64");
  const manifestPath = path.join(directory, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
  for (const name of ["aiga-capture-helper.exe", "aiga-capture-compat.dll"]) {
    manifest.sha256[name] = createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex");
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
};
