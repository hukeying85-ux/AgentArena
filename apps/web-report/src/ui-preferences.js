import { elements } from "./app-elements.js";
import { syncLocationState } from "./app-helpers.js";
import { state } from "./app-state.js";
import { readStorage, writeStorage } from "./result-cache.js";

/**
 * Set up language-select change handler and theme-toggle click handler,
 * and apply the persisted theme on load.
 *
 * @param {object} deps
 * @param {() => void} deps.render
 * @param {() => void} deps.renderStaticText
 * @param {(key: string, ...args: unknown[]) => string} deps.t
 */
export function initUiPreferences({ render, renderStaticText, t }) {
  // Language select
  elements.languageSelect.addEventListener("change", (event) => {
    state.language = String(event.target.value ?? "en");
    document.documentElement.lang = state.language === "zh-CN" ? "zh-CN" : "en";
    writeStorage("agentarena.webReport.language", state.language);
    syncLocationState(state, "push");
    render();
  });

  // Theme toggle — apply persisted theme then wire the button
  const savedTheme = readStorage("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  if (elements.themeLabel) {
    elements.themeLabel.textContent =
      savedTheme === "dark" ? t("themeLabelLight") : t("themeLabelDark");
  }

  elements.themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    writeStorage("theme", next);
    renderStaticText();
  });
}
