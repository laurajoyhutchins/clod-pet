import type { PanelStyle } from "./types";

function getSharedThemes() {
  const shared = window.clodPetSharedThemes;
  if (!shared) {
    throw new Error("shared theme data is not available");
  }
  return shared;
}

export function getPanelStyles(): readonly PanelStyle[] {
  return getSharedThemes().panelStyles;
}

export function getWindowsPanelStyles(): readonly PanelStyle[] {
  return getSharedThemes().windowsPanelStyles;
}

export function getMacPanelStyles(): readonly PanelStyle[] {
  return getSharedThemes().macPanelStyles;
}

export function getRoundedPanelStyles(): readonly PanelStyle[] {
  return getSharedThemes().roundedPanelStyles;
}

export function isPanelStyle(value: unknown): value is PanelStyle {
  return typeof value === "string" && getPanelStyles().includes(value as PanelStyle);
}

export function applyPanelStyle(style: PanelStyle) {
  const body = document.body;
  const styles = getPanelStyles();
  const macStyles = new Set(getMacPanelStyles());
  const roundedStyles = new Set(getRoundedPanelStyles());

  body.classList.remove(...styles.map((panelStyle) => `theme-${panelStyle}`));
  body.classList.add(`theme-${style}`);
  body.classList.toggle("theme-mac", macStyles.has(style));
  body.classList.toggle("theme-rounded", roundedStyles.has(style));
}

