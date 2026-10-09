const { app, globalShortcut } = require("electron");
const path = require("node:path");
app.setPath("userData", process.argv[2] || path.join(__dirname, "../out/shortcut-blocker"));
app.whenReady().then(() => {
  if (!globalShortcut.register("Ctrl+E", () => {})) throw new Error("Ctrl+E is already occupied; close the conflicting test application before running this test.");
  console.log("AIGA_SHORTCUT_BLOCKER_READY");
  // Electron GUI binaries may expose stdin as EOF even when spawned with a pipe.
  // Hold the reservation until the test controller terminates this owned process.
  setTimeout(() => app.quit(), 60000);
}).catch((error) => { console.error(error); app.exit(1); });
app.on("will-quit", () => globalShortcut.unregisterAll());
