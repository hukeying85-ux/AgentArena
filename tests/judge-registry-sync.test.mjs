import assert from "node:assert/strict";
import test from "node:test";
import { judgeTypeRegistry } from "../packages/core/dist/index.js";
import "../packages/judges/dist/index.js";
import { JUDGE_NORMALIZERS } from "../packages/taskpacks/dist/index.js";

// Expected types from the TaskJudge union in packages/core/src/types/judge.ts
// This list MUST be updated when adding a new judge type.
const EXPECTED_JUDGE_TYPES = [
  "command",
  "test-result",
  "lint-check",
  "file-exists",
  "file-contains",
  "json-value",
  "glob",
  "file-count",
  "snapshot",
  "json-schema",
  "patch-validation",
  "token-efficiency",
  "directory-exists",
  "regex-match",
  "compilation",
];

test("judgeTypeRegistry types match JUDGE_NORMALIZERS keys", () => {
  const registryTypes = new Set(judgeTypeRegistry.getAllTypes());
  const normalizerTypes = new Set(Object.keys(JUDGE_NORMALIZERS));

  const missingFromNormalizers = [...registryTypes].filter((t) => !normalizerTypes.has(t));
  const missingFromRegistry = [...normalizerTypes].filter((t) => !registryTypes.has(t));

  assert.deepEqual(
    missingFromNormalizers,
    [],
    `Types registered in judgeTypeRegistry but missing from JUDGE_NORMALIZERS: ${missingFromNormalizers.join(", ")}`
  );

  assert.deepEqual(
    missingFromRegistry,
    [],
    `Types in JUDGE_NORMALIZERS but not registered in judgeTypeRegistry: ${missingFromRegistry.join(", ")}`
  );

  assert.equal(registryTypes.size, normalizerTypes.size);
});

test("judgeTypeRegistry matches TaskJudge union type members", () => {
  const registryTypes = judgeTypeRegistry.getAllTypes().sort();
  const expected = [...EXPECTED_JUDGE_TYPES].sort();

  assert.deepEqual(
    registryTypes,
    expected,
    `Registry types (${registryTypes.join(", ")}) differ from TaskJudge union (${expected.join(", ")}). ` +
    `Update EXPECTED_JUDGE_TYPES in this test AND the TaskJudge union in packages/core/src/types/judge.ts.`
  );
});

test("all registered types have a corresponding judge runner in judges package", () => {
  // Verify that every registered type has a non-empty allowedFields set
  // (a proxy for "has been properly configured with a runner")
  for (const type of judgeTypeRegistry.getAllTypes()) {
    const desc = judgeTypeRegistry.get(type);
    assert.ok(desc, `Type "${type}" should have a descriptor`);
    assert.ok(desc.allowedFields.size > 0, `Type "${type}" should have allowedFields`);
  }
});
