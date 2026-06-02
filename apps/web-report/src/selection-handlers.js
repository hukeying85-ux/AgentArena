/**
 * Agent and run selection helpers.
 *
 * Collapses repetitive click-handler patterns where selecting an agent/run
 * triggers the same sequence of render calls.
 *
 * Extracted from app.js to reduce duplication.
 */

/**
 * Select an agent and update all dependent UI sections.
 *
 * @param {string} agentId - The agent ID to select
 * @param {object} state - Application state object
 * @param {object} deps - Render functions and utilities
 */
export function selectAgent(agentId, state, deps) {
  state.selectedAgentId = agentId;
  deps.syncLocationState(state, "push");
  deps.renderAgentList(state.run);
  deps.renderCompareTableV2(state.run);
  deps.renderAgentTrendTableV2(state.run);
  deps.renderSelectedAgentV2();
  deps.setHidden(
    deps.elements.agentTrendSection,
    !state.selectedAgentId || deps.getAgentTrendRows(state.runs, state.run, state.selectedAgentId).length <= 1
  );
}

/**
 * Select a run and trigger a full re-render.
 *
 * @param {string} runId - The run ID to select
 * @param {object} state - Application state object
 * @param {object} deps - Render functions and utilities
 */
export function selectRun(runId, state, deps) {
  state.selectedRunId = runId;
  deps.updateCurrentRun();
  deps.syncLocationState(state, "push");
  deps.render();
}
