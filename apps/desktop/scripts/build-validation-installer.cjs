const { build, Platform } = require("electron-builder");
const { version } = require("../package.json");
build({
  targets: Platform.WINDOWS.createTarget("nsis"),
  prepackaged: `release/${version}/win-unpacked`,
  publish: "never",
  config: { nsis: { installerIcon: null, uninstallerIcon: null, installerHeaderIcon: null } }
}).catch((error) => { console.error(error); process.exitCode = 1; });
