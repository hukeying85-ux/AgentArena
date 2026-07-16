import { formatTime, Icon, Notice, PageHeader, Section, StatusPill, t } from "../components/ui";
import { useWorkbench } from "../hooks/useWorkbench";

function detectionFor(items: Array<Record<string, unknown>>, id: string): Record<string, unknown> | undefined {
  return items.find((item) => item.id === id || item.agentId === id);
}

export function EnvironmentPage() {
  const { locale, environment, refreshEnvironment } = useWorkbench();
  const connected = !environment.error && environment.uiInfo !== null;
  const problems = environment.adapters.filter((adapter) => { const detection = detectionFor(environment.detectedAgents, adapter.id); return detection && detection.installed === false; });
  return <>
    <PageHeader eyebrow="ENVIRONMENT" title={locale === "zh-CN" ? "环境健康中心" : "Environment health"} description={locale === "zh-CN" ? "集中查看服务、安装、登录、Provider、隔离和存储状态。" : "Inspect service, installation, authentication, provider, isolation, and storage state."} actions={<button class="button secondary" type="button" onClick={() => void refreshEnvironment()} disabled={environment.loading}><Icon name="refresh"/>{t(locale, "refresh")}</button>}/>
    {environment.loading && <div class="skeleton-lines large"><span/><span/><span/><span/></div>}
    {environment.error && <Notice kind="danger"><strong>{t(locale, "environmentProblem")}</strong><span>{environment.error}</span></Notice>}
    {!environment.loading && <>
      <div class="health-hero"><div class={`health-symbol ${connected ? "healthy" : "unhealthy"}`}><Icon name={connected ? "check" : "danger"} size={30}/></div><div><div class="eyebrow">{t(locale, "status")}</div><h2>{connected ? t(locale, "environmentHealthy") : t(locale, "environmentProblem")}</h2><p>{connected ? `${environment.uiInfo?.host ?? "127.0.0.1"}:${environment.uiInfo?.port ?? ""}` : t(locale, "offline")}</p></div><StatusPill tone={connected ? "success" : "danger"}>{connected ? t(locale, "ready") : t(locale, "blocked")}</StatusPill></div>
      {environment.uiInfo?.riskNotice && <Notice kind="warning">{environment.uiInfo.riskNotice}</Notice>}
      <div class="health-grid">
        <Section title={locale === "zh-CN" ? "本地服务" : "Local service"}><dl class="detail-list"><div><dt>{t(locale, "status")}</dt><dd>{connected ? t(locale, "ready") : t(locale, "blocked")}</dd></div><div><dt>{t(locale, "version")}</dt><dd>{environment.uiInfo?.version?.version ?? t(locale, "unknown")}{environment.uiInfo?.version?.buildNumber ? ` #${environment.uiInfo.version.buildNumber}` : ""}</dd></div><div><dt>{t(locale, "repo")}</dt><dd><code>{environment.uiInfo?.repoPath ?? t(locale, "unknown")}</code></dd></div><div><dt>{t(locale, "lastChecked")}</dt><dd>{formatTime(environment.checkedAt, locale)}</dd></div></dl></Section>
        <Section title={t(locale, "agents")} description={`${environment.adapters.length - problems.length}/${environment.adapters.length} ${t(locale, "ready")}`}><div class="compact-list">{environment.adapters.slice(0, 12).map((adapter) => { const detection = detectionFor(environment.detectedAgents, adapter.id); const installed = detection?.installed !== false; return <div class="compact-row"><Icon name="agent"/><div><strong>{adapter.title}</strong><small>{String(detection?.version ?? adapter.id)}</small></div><StatusPill tone={installed ? "success" : "danger"}>{installed ? t(locale, "installed") : t(locale, "notInstalled")}</StatusPill></div>; })}</div></Section>
        <Section title={t(locale, "provider")} description={locale === "zh-CN" ? "官方配置与临时隔离明确分开。" : "Official configuration and temporary isolation stay explicit."}><div class="compact-list">{environment.providers.length === 0 ? <p class="muted-line">{t(locale, "missing")}</p> : environment.providers.map((provider) => <div class="compact-row"><Icon name="environment"/><div><strong>{provider.name}</strong><small>{provider.primaryModel ?? provider.apiFormat ?? provider.id}</small></div><StatusPill tone={provider.kind === "official" ? "success" : "info"}>{provider.kind === "official" ? t(locale, "localOfficial") : t(locale, "isolatedProvider")}</StatusPill></div>)}</div></Section>
        <Section title={locale === "zh-CN" ? "需要处理" : "Needs attention"}>{problems.length === 0 ? <div class="all-clear"><Icon name="check"/><span>{locale === "zh-CN" ? "没有发现安装阻断。" : "No installation blockers found."}</span></div> : <div class="compact-list">{problems.map((adapter) => <div class="compact-row problem"><Icon name="danger"/><div><strong>{adapter.title}</strong><small>{locale === "zh-CN" ? "未检测到本地命令，请安装后重新检查。" : "Local command not detected. Install it, then check again."}</small></div></div>)}</div>}</Section>
      </div>
    </>}
  </>;
}

