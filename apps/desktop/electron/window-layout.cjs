// Chat vs settings/expanded window dimensions (settings & expanded ~2× chat)

const CHAT_WINDOW = {
  width: 520,
  height: 420,
  minWidth: 480,
  minHeight: 320
};

const SETTINGS_WINDOW = {
  width: 1040,
  height: 840,
  minWidth: 960,
  minHeight: 680
};

/** Same footprint as settings — used by chat maximize (and interview focus). */
const EXPANDED_WINDOW = { ...SETTINGS_WINDOW };

function resolveLayoutSpec(layout) {
  if (layout === "settings" || layout === "expanded") {
    return SETTINGS_WINDOW;
  }
  return CHAT_WINDOW;
}

function applyWindowLayout(windowRef, layout) {
  if (!windowRef || windowRef.isDestroyed()) {
    return { layout, applied: false };
  }

  const spec = resolveLayoutSpec(layout);
  windowRef.setMinimumSize(spec.minWidth, spec.minHeight);
  windowRef.setSize(spec.width, spec.height, true);
  windowRef.center();
  return {
    layout,
    applied: true,
    width: spec.width,
    height: spec.height
  };
}

module.exports = {
  CHAT_WINDOW,
  SETTINGS_WINDOW,
  EXPANDED_WINDOW,
  applyWindowLayout
};
