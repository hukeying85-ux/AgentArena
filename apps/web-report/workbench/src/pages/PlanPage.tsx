import { useMemo } from "preact/hooks";
import { Field, Icon, Notice, PageHeader, Section, StatusPill, t } from "../components/ui";
import { useWorkbench } from "../hooks/useWorkbench";

export function PlanPage() {
  const { locale, environment, plan, updatePlan, preflight, runPreflight, startRun, runStatus, setPage } = useWorkbench();
  const blocked = preflight.some((item) => ["blocked", "missing", "error"].includes(String(item.status)));
  const selectedAdapters = useMemo(() => environment.adapters.filter((item) => plan.agentIds.includes(item.id)), [environment.adapters, plan.agentIds]);
  const canStart = Boolean(plan.repoPath && plan.taskPath && plan.agentIds.length > 0 && !blocked && runStatus.state !== "running");

  function toggleAgent(agentId: string) {
    updatePlan({ agentIds: plan.agentIds.includes(agentId) ? plan.agentIds.filter((id) => id !== agentId) : [...plan.agentIds, agentId] });
  }

  return <>
    <PageHeader eyebrow="PLAN" title={locale === "zh-CN" ? "创建一次可信评测" : "Create a trustworthy evaluation"} description={locale === "zh-CN" ? "启动前确认目标、参赛配置、安全条件和实际提交内容。" : "Confirm the target, participants, safety conditions, and exact submission before starting."} actions={<button class="button ghost" type="button" onClick={() => setPage("runs")}>{locale === "zh-CN" ? "返回运行" : "Back to runs"}</button>}/>
    {environment.error && <Notice kind="danger">{environment.error}</Notice>}
    <div class="plan-layout">
      <div class="plan-main">
        <Section title={locale === "zh-CN" ? "1. 目标" : "1. Target"} description={locale === "zh-CN" ? "选择真实仓库和任务包。" : "Choose the real repository and task pack."}>
          <div class="form-grid">
            <Field label={t(locale, "repo")} help={locale === "zh-CN" ? "本次运行将使用该目录的隔离工作副本。" : "The run will use an isolated workspace copied from this directory."}><input value={plan.repoPath} onInput={(event) => updatePlan({ repoPath: event.currentTarget.value })} placeholder="D:\project\example"/></Field>
            <Field label={t(locale, "task")}><select value={plan.taskPath} onChange={(event) => updatePlan({ taskPath: event.currentTarget.value })}><option value="">{locale === "zh-CN" ? "选择任务包" : "Select task pack"}</option>{environment.taskPacks.map((task) => <option value={task.path}>{task.title ?? task.id ?? task.path}</option>)}</select></Field>
          </div>
        </Section>

        <Section title={locale === "zh-CN" ? "2. 参赛配置" : "2. Participants"} description={`${t(locale, "selected")} ${plan.agentIds.length}`}>
          {environment.loading ? <div class="skeleton-lines"><span/><span/><span/></div> : <div class="agent-selector">{environment.adapters.map((adapter) => <label class={`agent-option ${plan.agentIds.includes(adapter.id) ? "selected" : ""}`}><input type="checkbox" checked={plan.agentIds.includes(adapter.id)} onChange={() => toggleAgent(adapter.id)}/><span class="agent-option-icon"><Icon name="agent"/></span><span><strong>{adapter.title}</strong><small>{adapter.kind ?? adapter.id}</small></span><StatusPill tone={adapter.kind === "demo" ? "info" : "neutral"}>{adapter.kind === "demo" ? t(locale, "demo") : t(locale, "localOfficial")}</StatusPill></label>)}</div>}
        </Section>

        <Section title={locale === "zh-CN" ? "3. 安全与运行" : "3. Safety and runtime"}>
          <div class="form-grid three">
            <Field label={locale === "zh-CN" ? "评分模式" : "Score mode"}><select value={plan.scoreMode} onChange={(event) => updatePlan({ scoreMode: event.currentTarget.value })}><option value="practical">Practical</option><option value="correctness">Correctness</option><option value="speed">Speed</option><option value="cost">Cost</option></select></Field>
            <Field label={locale === "zh-CN" ? "最大并发" : "Max concurrency"}><input type="number" min="1" max="8" value={plan.maxConcurrency} onInput={(event) => updatePlan({ maxConcurrency: Number(event.currentTarget.value) || 1 })}/></Field>
            <Field label={locale === "zh-CN" ? "认证探测" : "Auth probe"}><label class="switch-row"><input type="checkbox" checked={plan.probeAuth} onChange={(event) => updatePlan({ probeAuth: event.currentTarget.checked })}/><span>{locale === "zh-CN" ? "启动前检查登录状态" : "Check authentication before start"}</span></label></Field>
          </div>
          <button class="button secondary" type="button" onClick={() => void runPreflight()} disabled={plan.agentIds.length === 0}><Icon name="refresh"/>{t(locale, "runCheck")}</button>
          {preflight.length === 0 ? <p class="muted-line">{t(locale, "preflightEmpty")}</p> : <div class="preflight-list">{preflight.map((item) => { const status = String(item.status ?? "unknown"); const tone = ["ready", "pass", "success"].includes(status) ? "success" : ["blocked", "missing", "error"].includes(status) ? "danger" : "warning"; return <div class="preflight-row"><StatusPill tone={tone}>{status}</StatusPill><div><strong>{String(item.agentId)}</strong><span>{String(item.message ?? item.error ?? item.authStatus ?? (locale === "zh-CN" ? "检查完成" : "Check complete"))}</span></div></div>; })}</div>}
        </Section>
      </div>

      <aside class="plan-summary">
        <div class="sticky-panel"><div class="eyebrow">{locale === "zh-CN" ? "最终确认" : "FINAL REVIEW"}</div><h2>{locale === "zh-CN" ? "即将提交" : "Ready to submit"}</h2>
          <dl><div><dt>{t(locale, "repo")}</dt><dd>{plan.repoPath || t(locale, "missing")}</dd></div><div><dt>{t(locale, "task")}</dt><dd>{environment.taskPacks.find((item) => item.path === plan.taskPath)?.title ?? (plan.taskPath || t(locale, "missing"))}</dd></div><div><dt>{t(locale, "agents")}</dt><dd>{selectedAdapters.map((item) => item.title).join(", ") || t(locale, "missing")}</dd></div><div><dt>{locale === "zh-CN" ? "配置来源" : "Config source"}</dt><dd>{selectedAdapters.some((item) => item.id === "claude-code") && environment.providers.some((item) => item.kind !== "official") ? t(locale, "isolatedProvider") : t(locale, "localOfficial")}</dd></div></dl>
          {blocked && <Notice kind="danger">{locale === "zh-CN" ? "存在必须修复的运行前问题。" : "Preflight contains blocking issues."}</Notice>}
          <button class="button primary full" type="button" disabled={!canStart} onClick={() => void startRun()}><Icon name="live"/>{t(locale, "startRun")}</button>
          <p class="fine-print">{locale === "zh-CN" ? "启动后会创建独立 Run，不会覆盖历史结果。" : "Starting creates a new Run and never overwrites history."}</p>
        </div>
      </aside>
    </div>
  </>;
}

