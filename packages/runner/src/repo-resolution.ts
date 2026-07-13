import { promises as fs } from "node:fs";
import path from "node:path";
import type { TaskPack } from "@agentarena/core";
import { isPathInsideWorkspace, resolveRepoSource } from "@agentarena/core";
import { loadTaskPack } from "@agentarena/taskpacks";
export interface RepoResolution {
  repoPath: string;
  userRepoPath: string;
  task: TaskPack;
}

export interface RepoResolutionOptions {
  repoPath: string;
  taskPath: string;
  builtinReposRoot?: string;
  userRepoRoot?: string;
}

export async function resolveAndValidateRepo(
  options: RepoResolutionOptions
): Promise<RepoResolution> {
  const userRepoPath = path.resolve(options.repoPath);
  const task = await loadTaskPack(options.taskPath);
  const builtinReposRoot = options.builtinReposRoot ?? path.join(path.dirname(options.taskPath), "..", "repos");
  const repoResolution = resolveRepoSource(task.repoSource, userRepoPath, builtinReposRoot);
  const repoPath = path.resolve(repoResolution.repoPath);

  if (repoResolution.kind === "builtin") {
    if (options.builtinReposRoot && !(await isPathInsideWorkspace(options.builtinReposRoot, repoPath))) {
      throw new Error(`Builtin repository resolves outside the configured builtin repository root: "${repoPath}".`);
    }
    try {
      const stat = await fs.stat(repoPath);
      if (!stat.isDirectory()) {
        throw new Error(`Builtin repo path is not a directory: "${repoPath}"`);
      }
    } catch (error) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `Builtin repo not found: "${repoPath}". ` +
          `The task pack requires repoSource "${task.repoSource}" but the directory does not exist.`
        );
      }
      throw error;
    }
  }


  if (repoResolution.kind === "user") {
    if (options.userRepoRoot && !(await isPathInsideWorkspace(options.userRepoRoot, repoPath))) {
      throw new Error(`User repository resolves outside the allowed user repository root: "${repoPath}".`);
    }
    try {
      const stat = await fs.stat(repoPath);
      if (!stat.isDirectory()) {
        throw new Error(`User repo path is not a directory: "${repoPath}"`);
      }
    } catch (error) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`User repo not found: "${repoPath}". The specified repository path does not exist.`);
      }
      throw error;
    }
  }

  return { repoPath, userRepoPath, task };
}
