const { ipcRenderer } = require("electron");

const requestId = new URLSearchParams(globalThis.location.search).get("requestId") || "";

globalThis.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; user-select: none; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; cursor: crosshair; }
    body { background: #111 center / 100% 100% no-repeat; font-family: Segoe UI, sans-serif; }
    #shade { position: fixed; inset: 0; background: rgba(0,0,0,.52); }
    #selection { position: fixed; display: none; border: 2px solid #22c55e;
      box-shadow: 0 0 0 99999px rgba(0,0,0,.52); background: transparent; }
    #size { position: fixed; display: none; padding: 4px 7px; border-radius: 4px;
      color: #fff; background: rgba(15,15,15,.9); font-size: 12px; }
    #hint { position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
      padding: 8px 14px; border-radius: 7px; color: #fff; background: rgba(15,15,15,.88);
      font-size: 13px; pointer-events: none; }
  `;
  document.head.append(style);

  const shade = document.createElement("div");
  shade.id = "shade";
  const selection = document.createElement("div");
  selection.id = "selection";
  const size = document.createElement("div");
  size.id = "size";
  const hint = document.createElement("div");
  hint.id = "hint";
  hint.textContent = "Arraste para selecionar a área · Esc para cancelar";
  document.body.append(shade, selection, size, hint);

  let start = null;

  function draw(x, y) {
    if (!start) return null;
    const left = Math.max(0, Math.min(start.x, x));
    const top = Math.max(0, Math.min(start.y, y));
    const right = Math.min(globalThis.innerWidth, Math.max(start.x, x));
    const bottom = Math.min(globalThis.innerHeight, Math.max(start.y, y));
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    selection.style.display = "block";
    selection.style.left = `${left}px`;
    selection.style.top = `${top}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
    size.style.display = "block";
    size.style.left = `${Math.min(globalThis.innerWidth - 100, left + 6)}px`;
    size.style.top = `${Math.min(globalThis.innerHeight - 28, top + height + 6)}px`;
    size.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    return { left, top, width, height };
  }

  globalThis.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    shade.style.display = "none";
    hint.style.display = "none";
    draw(event.clientX, event.clientY);
  });

  globalThis.addEventListener("mousemove", (event) => {
    if (start) draw(event.clientX, event.clientY);
  });

  globalThis.addEventListener("mouseup", (event) => {
    if (!start || event.button !== 0) return;
    const bounds = draw(event.clientX, event.clientY);
    start = null;
    if (!bounds || bounds.width < 8 || bounds.height < 8) {
      selection.style.display = "none";
      size.style.display = "none";
      shade.style.display = "block";
      hint.style.display = "block";
      return;
    }
    ipcRenderer.send("region-selection:complete", {
      requestId,
      region: {
        x: bounds.left / globalThis.innerWidth,
        y: bounds.top / globalThis.innerHeight,
        width: bounds.width / globalThis.innerWidth,
        height: bounds.height / globalThis.innerHeight,
      },
    });
  });

  globalThis.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ipcRenderer.send("region-selection:cancel", { requestId });
    }
  });

  ipcRenderer.on("region-selection:background", (_event, dataUrl) => {
    document.body.style.backgroundImage = `url(${JSON.stringify(String(dataUrl)).slice(1, -1)})`;
  });
  ipcRenderer.send("region-selection:ready", { requestId });
});
