import { Icon, t } from "../components/ui";
import type { Locale } from "../types";

interface FileChangesProps {
  locale: Locale;
  files: string[];
  runId: string | null;
  variantId: string | null;
}

/**
 * Lists changed files for the selected agent result.
 *
 * This phase wires the file-change *evidence list* into the new Evidence page.
 * Full line-level diff rendering is a later phase; for now each file links to
 * the legacy view, which already renders the complete diff. This keeps the
 * evidence closed-loop honest: the new page shows what changed, the legacy view
 * shows how, and neither blocks the other.
 */
export function FileChanges({ locale, files, runId, variantId }: FileChangesProps) {
  if (files.length === 0) {
    return <p class="muted-line">{t(locale, "missing")}</p>;
  }

  const legacyHref = `../?run=${encodeURIComponent(runId ?? "")}&agent=${encodeURIComponent(variantId ?? "")}#evidence`;

  return (
    <div class="file-changes">
      <ul class="file-list">
        {files.map((file) => (
          <li class="file-row" key={file}>
            <Icon name="file" />
            <code>{file}</code>
          </li>
        ))}
      </ul>
      <a class="button secondary file-diff-link" href={legacyHref}>
        <Icon name="external" />
        {t(locale, "openLegacyDiff")}
      </a>
    </div>
  );
}
