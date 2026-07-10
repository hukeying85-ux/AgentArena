export interface VersionInfo {
  version: string;
  buildNumber: number;
  buildTime: string;
  gitCommit: string;
}

export function readVersionInfo(): VersionInfo | null;
