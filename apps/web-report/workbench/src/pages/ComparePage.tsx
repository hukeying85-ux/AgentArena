import { useMemo, useState } from "preact/hooks";
import { EmptyState, formatCost, formatDuration, Icon, PageHeader, Section, StatusPill, t } from "../components/ui";
import { comparisonExclusionReasons, deriveRunOutcome } from "../domain/run";
import { useWorkbench } from "../hooks/useWorkbench";

export function ComparePage() {
  const { locale, runs, selectedRun, setSelectedRunId, setPage } = useWorkbench();
  const [baseId, setBaseId] = useState<string>(selectedRun?.runId ?? runs[0]?.runId ?? "");
  const base = runs.find((item) => item.runId === baseId) ?? runs[0] ?? null;
  const rows = useMemo(() => base ? runs.filter((item) => item.runId !== base.runId).map((run) => ({ run, reasons: comparisonExclusionReasons(base, run) })) : [], [base, runs]);

  return <>
    <PageHeader eyebrow="COMPARE" title={locale === "zh-CN" ? "公平比较工作区" : "Fair comparison workspace"} description={locale === "zh-CN" ? "先检查共同条件，再比较结果和证据。" : "Check shared conditions before comparing outcomes and evidence."}/>
    {runs.length < 2 || !base ? <EmptyState icon="compare" title={locale === "zh-CN" ? "结果不足" : "Not enough results"} message={t(locale, "compareEmpty")} actions={<button class="button primary" type="button" onClick={() => setPage("runs")}>{t(locale, "runs")}</button>}/>
    : <>
      <Section title={locale === "zh-CN" ? "比较基准" : "Comparison base"}><label class="inline-field"><span>{locale === "zh-CN" ? "基准运行" : "Base run"}</span><select value={base.runId} onChange={(event) => setBaseId(event.currentTarget.value)}>{runs.map((run) => <option value={run.runId}>{run.task.title} · {run.runId}</option>)}</select></label><div class="base-identity"><div><small>{t(locale, "repo")}</small><strong>{base.repository.path ?? t(locale, "unknown")}</strong></div><div><small>{t(locale, "task")}</small><strong>{base.task.id ?? base.task.title}</strong></div><div><small>{locale === "zh-CN" ? "提交" : "Revision"}</small><strong>{base.repository.revision ?? t(locale, "unknown")}</strong></div><div><small>{locale === "zh-CN" ? "评分模式" : "Score mode"}</small><strong>{base.scoreMode}</strong></div></div></Section>
      <Section title={locale === "zh-CN" ? "候选运行" : "Candidate runs"} description={locale === "zh-CN" ? "不同任务、提交或评分模式会被排除。" : "Different tasks, revisions, or score modes are excluded."}><div class="comparison-list">{rows.map(({ run, reasons }) => { const outcome = deriveRunOutcome(run); return <div class={`comparison-row ${reasons.length ? "excluded" : "fair"}`}><div class="comparison-identity"><Icon name={reasons.length ? "warning" : "check"}/><div><strong>{run.task.title}</strong><span>{run.runId} · {run.source.label}</span></div></div><div>{reasons.length === 0 ? <StatusPill tone="success">{t(locale, "fair")}</StatusPill> : <div class="reason-pills">{reasons.map((reason) => <StatusPill tone="warning">{reason}</StatusPill>)}</div>}</div><div class="comparison-summary"><span>{t(locale, outcome.evaluation)}</span><span>{outcome.winner?.displayLabel ?? t(locale, "noWinner")}</span></div><button class="button ghost compact-button" type="button" onClick={() => { setSelectedRunId(run.runId); setPage("outcome"); }}>{locale === "zh-CN" ? "查看" : "View"}<Icon name="chevron"/></button></div>; })}</div></Section>
      <Section title={locale === "zh-CN" ? "基准 Agent" : "Base agents"}><div class="results-table compare-table"><table><thead><tr class="results-head"><th>Agent</th><th>{t(locale, "status")}</th><th>Score</th><th>{t(locale, "duration")}</th><th>{t(locale, "cost")}</th><th>{t(locale, "files")}</th></tr></thead><tbody>{base.results.map((item) => { const outcome = deriveRunOutcome(base); const qualified = outcome.qualifiedResults.includes(item); return <tr class="results-row static"><td><span class="identity-cell"><span class="agent-avatar"><Icon name="agent"/></span><strong>{item.displayLabel}</strong></span></td><td><StatusPill tone={qualified ? "success" : "danger"}>{qualified ? t(locale, "pass") : t(locale, "fail")}</StatusPill></td><td class="number-cell">{qualified && item.compositeScore !== null ? item.compositeScore.toFixed(1) : "—"}</td><td>{formatDuration(item.durationMs, locale)}</td><td>{formatCost(item.estimatedCostUsd, locale)}</td><td>{item.changedFiles.length}</td></tr>; })}</tbody></table></div></Section>
    </>}
  </>;
}

