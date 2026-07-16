import { Icon, t } from "../components/ui";
import type { FileDiff } from "../domain/run";
import type { Locale } from "../types";

interface FileChangesProps {
  locale: Locale;
  files: string[];
  diffs?: FileDiff[];
  runId: string | null;
  variantId: string | null;
}

/** Split a unified-diff line into a tone class for coloring without inline style. */
function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "diff-add";
  if (line.startsWith("-") && !line.startsWith("---")) return "diff-del";
  if (line.startsWith("@@")) return "diff-hunk";
  return "diff-ctx";
}

function DiffBlock({ diff }: { diff: FileDiff }) {
  const body = diff.text ?? (diff.hunks ?? []).join("\n");
  return (
    <div class="file-diff-block">
      <div class="file-diff-head"><Icon name="file" /><code>{diff.path}</code></div>
      <pre class="file-diff">{body.split("\n").map((line, i) => (
        <span class={`file-diff-line ${diffLineClass(line)}`} key={i}>{line || " "}</span>
      ))}</pre>
    </div>
  );
}

/**
 * Lists changed files for the selected agent result.
 *
 * When the runner has persisted line-level diffs (future runs), they render as
 * read-only unified-diff blocks. Today the runner only stores file names, so
 * the component degrades to the file list + a link to the legacy view,
 * which still renders the complete run-to-run comparison. Neither path blocks
 * the other, keeping the evidence closed-loop honest.
 */
export function FileChanges({ locale, files, diffs, runId, variantId }: FileChangesProps) {
  if (files.length === 0 && (!diffs || diffs.length === 0)) {
    return <p class="muted-line">{t(locale, "missing")}</p>;
  }

  const legacyHref = `../?run=${encodeURIComponent(runId ?? "")}&agent=${encodeURIComponent(variantId ?? "")}#evidence`;
  const namedFiles = files.filter((file) => !diffs?.some((diff) => diff.path === file));

  return (
    <div class="file-changes">
      {diffs && diffs.length > 0 && (
        <div class="file-diff-list">
          <h3 class="file-diff-title">{t(locale, "fileDiffTitle")}</h3>
          {diffs.map((diff) => <DiffBlock diff={diff} key={diff.path} />)}
        </div>
      )}
      {namedFiles.length > 0 && (
        <ul class="file-list">
          {namedFiles.map((file) => (
            <li class="file-row" key={file}>
              <Icon name="file" />
              <code>{file}</code>
            </li>
          ))}
        </ul>
      )}
      <a class="button secondary file-diff-link" href={legacyHref}>
        <Icon name="external" />
        {t(locale, "openLegacyDiff")}
      </a>
    </div>
  );
}
