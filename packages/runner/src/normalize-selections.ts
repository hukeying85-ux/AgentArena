/**
 * Agent selection normalization and deduplication.
 *
 * Extracted from agent-lifecycle.ts for independent testability.
 */

import { getAdapter } from "@agentarena/adapters";
import { type AgentSelection, createAgentSelection } from "@agentarena/core";

/**
 * Normalize agent selections: convert agentIds to full AgentSelection objects,
 * and deduplicate variant IDs by appending occurrence counters.
 *
 * Example: two agents with variantId "default" become "default" and "default-2".
 */
export function normalizeSelections(options: { agents?: AgentSelection[]; agentIds: string[] }): AgentSelection[] {
  const rawSelections =
    options.agents && options.agents.length > 0
      ? options.agents
      : options.agentIds.map((agentId) =>
          createAgentSelection({
            baseAgentId: agentId,
            displayLabel: getAdapter(agentId).title
          })
        );

  const seenVariantIds = new Map<string, number>();
  return rawSelections.map((selection) => {
    const occurrence = (seenVariantIds.get(selection.variantId) ?? 0) + 1;
    seenVariantIds.set(selection.variantId, occurrence);
    if (occurrence === 1) {
      return selection;
    }

    return {
      ...selection,
      variantId: `${selection.variantId}-${occurrence}`,
      displayLabel: `${selection.displayLabel} #${occurrence}`
    };
  });
}
