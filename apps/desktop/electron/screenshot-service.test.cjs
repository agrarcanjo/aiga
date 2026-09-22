const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadScreenshotService() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: { getPath: () => "C:/tmp/aiga-test" },
        desktopCapturer: {},
        screen: {}
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("./screenshot-service.cjs")];
    return require("./screenshot-service.cjs");
  } finally {
    Module._load = originalLoad;
  }
}

test("normalizeCropRegion limita a região aos limites da imagem", () => {
  const { normalizeCropRegion } = loadScreenshotService();
  assert.deepEqual(
    normalizeCropRegion({ x: 0.8, y: 0.9, width: 0.8, height: 0.5 }),
    { x: 0.8, y: 0.9, width: 0.2, height: 0.1 }
  );
});

test("cropThumbnail converte percentuais em pixels antes de codificar", () => {
  const { cropThumbnail } = loadScreenshotService();
  let received;
  const cropped = { id: "cropped" };
  const thumbnail = {
    getSize: () => ({ width: 1920, height: 1080 }),
    crop: (bounds) => {
      received = bounds;
      return cropped;
    }
  };

  assert.equal(
    cropThumbnail(thumbnail, { x: 0.1, y: 0.08, width: 0.8, height: 0.87 }),
    cropped
  );
  assert.deepEqual(received, { x: 192, y: 86, width: 1536, height: 940 });
});
