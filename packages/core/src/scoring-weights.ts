/**
 * Score weight presets for AgentArena benchmark scoring.
 *
 * These constants are the single source of truth for default weight values.
 * The frontend (view-model/scoring.js) mirrors these values in
 * SCORE_WEIGHT_PRESETS for display and dynamic re-scoring.
 *
 * Consistency is guarded by automated tests in tests/scoring.test.mjs
 * ("frontend SCORE_WEIGHT_PRESETS match backend getDefaultWeights for all modes").
 * If you change a preset here, the test will catch any frontend drift.
 *
 * WEIGHT DERIVATION RATIONALE:
 *
 * The weights were established through iterative tuning against real benchmark
 * runs, informed by these principles:
 *
 * - "practical" mode (default): Prioritizes correctness (tests 26%, status 24%,
 *   criticalJudges 20%) over efficiency. Lint is low (3%) because lint warnings
 *   are common in agent output and rarely indicate real failures. Duration/cost
 *   are secondary (8%/6%) because speed matters less than correctness for most
 *   users. Precision (5%) is low because not all tasks have expectedChangedPaths.
 *
 * - "balanced": Equal emphasis on correctness and efficiency. Status gets 30%
 *   because it's the ultimate pass/fail signal. Tests drop to 25% to make room
 *   for duration (10%) and cost (10%).
 *
 * - "issue-resolution": Modeled after SWE-Bench. resolutionRate gets 45% because
 *   the primary metric is whether the agent fixed the issue. Status drops to 15%
 *   because a failed build is acceptable if the issue is resolved (tests may fail
 *   for unrelated reasons). This is intentional.
 *
 * - "efficiency-first": For cost-sensitive teams. tokenEfficiency gets 30% and
 *   cost gets 20%. Tests still matter (20%) because a cheap wrong answer is worse
 *   than an expensive correct one.
 *
 * - "rotating-tasks": Modeled after LiveBench. resolutionRate (25%) and
 *   acceptanceRate (20%) are primary to prevent score inflation from task
 *   familiarity. Status (15%) is deliberately low.
 *
 * - "comprehensive": Equal weight across all dimensions for users who want
 *   maximum signal. No single component dominates.
 *
 * SENSITIVITY NOTE: Changing a weight by 0.01 can shift rankings in close races.
 * Always re-run the scoring.test.mjs frontend-backend consistency tests after
 * weight changes. The normalizeApplicableWeights pipeline silently redistributes
 * weight from inapplicable components (e.g., precision when no expectedChangedPaths),
 * so effective weights differ per-result within the same run.
 */

/**
 * Closed enumeration of every valid scoring mode.
 *
 * Adding a new score mode:
 *   1. Add the literal here.
 *   2. Add a `case` branch in `getDefaultWeights`. TypeScript's exhaustiveness
 *      check (the `never` default fallthrough) will refuse to compile if you forget.
 *   3. Update the CLI validator in packages/cli/src/args.ts.
 *
 * Previously this was `string` end-to-end, so a typo in a CLI arg or stored
 * config silently fell through to PRACTICAL_WEIGHTS — scoring the run with
 * the wrong preset without any error.
 */
export type ScoreMode =
  | "practical"
  | "balanced"
  | "issue-resolution"
  | "efficiency-first"
  | "rotating-tasks"
  | "comprehensive";

export const SCORE_MODES: readonly ScoreMode[] = [
  "practical",
  "balanced",
  "issue-resolution",
  "efficiency-first",
  "rotating-tasks",
  "comprehensive",
];

export function isScoreMode(value: unknown): value is ScoreMode {
  return typeof value === "string" && (SCORE_MODES as readonly string[]).includes(value);
}

const PRACTICAL_WEIGHTS = {
  status: 0.24,
  tests: 0.26,
  criticalJudges: 0.20,
  nonCriticalJudges: 0.08,
  precision: 0.05,
  lint: 0.03,
  duration: 0.08,
  cost: 0.06
} as const;

const BALANCED_WEIGHTS = {
  status: 0.30,
  tests: 0.25,
  criticalJudges: 0.10,
  nonCriticalJudges: 0.05,
  lint: 0.10,
  precision: 0.10,
  duration: 0.06,
  cost: 0.04
} as const;

const ISSUE_RESOLUTION_WEIGHTS = {
  status: 0.15,
  resolutionRate: 0.45,
  failToPassTests: 0.20,
  passToPassTests: 0.15,
  duration: 0.05
} as const;

const EFFICIENCY_FIRST_WEIGHTS = {
  status: 0.20,
  tests: 0.15,
  criticalJudges: 0.15,
  tokenEfficiency: 0.25,
  acceptanceRate: 0.10,
  duration: 0.10,
  cost: 0.05
} as const;

const ROTATING_TASKS_WEIGHTS = {
  status: 0.20,
  tests: 0.20,
  criticalJudges: 0.20,
  categoryScore: 0.20,
  duration: 0.10,
  cost: 0.10
} as const;

const COMPREHENSIVE_WEIGHTS = {
  status: 0.12,
  tests: 0.15,
  criticalJudges: 0.10,
  nonCriticalJudges: 0.05,
  resolutionRate: 0.12,
  tokenEfficiency: 0.08,
  categoryScore: 0.08,
  duration: 0.15,
  cost: 0.15,
  precision: 0.05,
  lint: 0.05
} as const;

/**
 * Return a fresh copy of the weights for the given score mode.
 *
 * Returns a shallow copy of the preset object so downstream mutation
 * cannot corrupt the canonical preset for the rest of the process. The
 * exhaustive switch + `never` default makes the compiler enforce that every
 * `ScoreMode` member has a branch.
 */
export function getDefaultWeights(scoreMode: ScoreMode): Record<string, number> {
  switch (scoreMode) {
    case "practical":
      return { ...PRACTICAL_WEIGHTS };
    case "balanced":
      return { ...BALANCED_WEIGHTS };
    case "issue-resolution":
      return { ...ISSUE_RESOLUTION_WEIGHTS };
    case "efficiency-first":
      return { ...EFFICIENCY_FIRST_WEIGHTS };
    case "rotating-tasks":
      return { ...ROTATING_TASKS_WEIGHTS };
    case "comprehensive":
      return { ...COMPREHENSIVE_WEIGHTS };
    default: {
      const _exhaustive: never = scoreMode;
      void _exhaustive;
      return { ...PRACTICAL_WEIGHTS };
    }
  }
}
