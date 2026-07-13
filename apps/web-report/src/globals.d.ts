// Global type declarations for AgentArena web-report

interface Window {
  loadDemoData: () => void;
  applyRuns: (runs: unknown[]) => void;
  showToast: (message: string, type?: "info" | "success" | "warning" | "error", duration?: number) => string;
  __showAllCompare?: () => void;
  state: {
    runs: unknown[];
    run: unknown | null;
    [key: string]: unknown;
  };
}
