import { elements } from "./app-elements.js";
import { syncLocationState } from "./app-helpers.js";
import { state } from "./app-state.js";
import { readStorage, writeStorage } from "./result-cache.js";

/**
 * Set up language-select and theme-select change handlers,
 * and apply the persisted theme on load.
 *
 * @param {object} deps
 * @param {() => void} deps.render
 * @param {() => void} deps.renderStaticText
 */
export function initUiPreferences({ render, renderStaticText }) {
  // Language select
  elements.languageSelect.addEventListener("change", (event) => {
    state.language = String(event.target.value ?? "en");
    document.documentElement.lang = state.language === "zh-CN" ? "zh-CN" : "en";
    writeStorage("agentarena.webReport.language", state.language);
    syncLocationState(state, "push");
    render();
  });

  // Theme select — apply persisted theme then wire the select
  const savedTheme = readStorage("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  if (elements.themeSelect) {
    elements.themeSelect.value = savedTheme;
  }

  elements.themeSelect?.addEventListener("change", (event) => {
    const next = String(event.target.value ?? "dark");
    document.documentElement.setAttribute("data-theme", next);
    writeStorage("theme", next);
    renderStaticText();
  });
}
