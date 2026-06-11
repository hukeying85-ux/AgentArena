import { elements } from "./app-elements.js";
import { state } from "./app-state.js";
import {
  buildPrTable,
  buildShareCard,
  buildShareCardSvg,
  findCommunityRank
} from "./view-model.js";

/**
 * Wire up the share/copy/export button event listeners in the dashboard toolbar.
 *
 * @param {object} deps
 * @param {() => string} deps.getScoreModeLabel
 * @param {(value: string, label: string) => Promise<void>} deps.copyToClipboard
 * @param {(filename: string, contents: string, mimeType: string) => void} deps.downloadTextFile
 * @param {(key: string, ...args: unknown[]) => string} deps.t
 */
export function initShareActions({ getScoreModeLabel, copyToClipboard, downloadTextFile, t }) {
  // Share menu dropdown toggle logic
  document.querySelectorAll(".share-menu-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.closest(".share-menu");
      document.querySelectorAll(".share-menu.open").forEach((m) => {
        if (m !== menu) m.classList.remove("open");
      });
      menu.classList.toggle("open");
    });
  });

  document.addEventListener("click", () => {
    for (const m of document.querySelectorAll(".share-menu.open")) {
      m.classList.remove("open");
    }
  });

  elements.copyShareCard.addEventListener("click", async () => {
    if (!state.run) {
      return;
    }

    await copyToClipboard(
      buildShareCard(state.run, {
        scoreWeights: state.scoreWeights,
        scoreModeLabel: getScoreModeLabel()
      }),
      t("copySummary")
    );
  });

  elements.copyPrTable.addEventListener("click", async () => {
    if (!state.run) {
      return;
    }

    await copyToClipboard(
      buildPrTable(state.run, {
        scoreWeights: state.scoreWeights,
        scoreModeLabel: getScoreModeLabel()
      }),
      t("copyPrTable")
    );
  });

  elements.downloadShareSvg.addEventListener("click", () => {
    if (!state.run) {
      return;
    }

    const communityRank = state.communityData
      ? findCommunityRank(state.run, state.communityData)
      : null;
    downloadTextFile(
      `agentarena-${state.run.runId}.svg`,
      buildShareCardSvg(state.run, {
        scoreWeights: state.scoreWeights,
        scoreModeLabel: getScoreModeLabel(),
        communityRank
      }),
      "image/svg+xml"
    );
    elements.clipboardStatus.textContent = t("svgDownloaded");
  });
}
