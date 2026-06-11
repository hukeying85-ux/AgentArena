/**
 * Shared types and validation helpers for API route handlers.
 */

import type { ClaudeProviderProfile } from "@agentarena/core";

// ─── Types ───

export interface ApiResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export interface ProviderProfilePayload {
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
  secret?: string;
  _confirmBaseUrlRisk?: boolean;
}

// ─── Helpers ───

export function validateProviderProfilePayload(payload: ProviderProfilePayload): string | null {
  if (!payload.name?.trim()) return "name is required.";
  if (!payload.kind?.trim()) return "kind is required (e.g. 'official', 'anthropic-compatible', 'openai-proxy').";
  if (!payload.apiFormat?.trim()) return "apiFormat is required (e.g. 'anthropic-messages', 'openai-chat-via-proxy').";
  return null;
}

export function validateProfileId(profileId: string): string | null {
  if (!profileId || typeof profileId !== "string") return "Profile ID is required.";
  if (profileId.length > 128) return "Profile ID too long (max 128 characters).";
  if (!/^[a-zA-Z0-9_-]+$/.test(profileId)) return "Profile ID may only contain alphanumeric characters, hyphens, and underscores.";
  return null;
}

/**
 * Mask sensitive extraEnv values in profile list responses.
 */
export function maskProfileExtraEnv(profiles: ClaudeProviderProfile[]): unknown[] {
  return profiles.map(({ extraEnv, ...rest }: ClaudeProviderProfile) => ({
    ...rest,
    extraEnv: extraEnv ? Object.fromEntries(Object.keys(extraEnv as Record<string, unknown>).map(k => [k, "***"])) : undefined
  }));
}
