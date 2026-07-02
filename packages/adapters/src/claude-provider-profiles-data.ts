/**
 * Claude Code provider profile data definitions.
 *
 * Contains the built-in profile constant and related types/interfaces.
 * Separated from claude-provider-profiles.ts to keep data definitions
 * distinct from CRUD operations, secret storage, and workspace logic.
 */
import type { ClaudeProviderProfile, ClaudeProviderRiskFlag } from "@agentarena/core";

export interface ProfileRegistryFile {
  schemaVersion: 1;
  profiles: ClaudeProviderProfile[];
}

export interface ClaudeProviderProfileInput {
  id?: string;
  name: string;
  kind: ClaudeProviderProfile["kind"];
  homepage?: string;
  baseUrl?: string;
  apiFormat: ClaudeProviderProfile["apiFormat"];
  primaryModel?: string;
  thinkingModel?: string;
  defaultHaikuModel?: string;
  defaultSonnetModel?: string;
  defaultOpusModel?: string;
  extraEnv?: Record<string, string>;
  writeCommonConfig?: boolean;
  notes?: string;
  _confirmBaseUrlRisk?: boolean;
  riskFlags?: ClaudeProviderRiskFlag[];
}

export const BUILT_IN_OFFICIAL_PROFILE: ClaudeProviderProfile = {
  id: "claude-official",
  name: "Official",
  kind: "official",
  homepage: "https://www.anthropic.com/claude-code",
  apiFormat: "anthropic-messages",
  extraEnv: {},
  writeCommonConfig: true,
  riskFlags: [],
  isBuiltIn: true,
  secretStored: false
};

export function defaultRiskFlags(kind: ClaudeProviderProfile["kind"]): ClaudeProviderRiskFlag[] {
  if (kind === "official") {
    return [];
  }

  return ["third-party-provider", "compatibility-mode", "user-managed-secret"];
}
