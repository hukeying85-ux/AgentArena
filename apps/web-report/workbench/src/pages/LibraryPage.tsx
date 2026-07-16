import { EmptyState, Icon, PageHeader, Section, StatusPill, t } from "../components/ui";
import { useWorkbench } from "../hooks/useWorkbench";

export function LibraryPage() {
  const { locale, environment, setPage } = useWorkbench();
  return <>
    <PageHeader eyebrow="LIBRARY" title={locale === "zh-CN" ? "评测资源库" : "Evaluation library"} description={locale === "zh-CN" ? "浏览任务包、Agent 和 Provider；运行方案将在下一阶段接入保存。" : "Browse task packs, agents, and providers. Saved run plans will connect in the next phase."}/>
    <div class="library-stats"><div><Icon name="plan"/><strong>{environment.taskPacks.length}</strong><span>{locale === "zh-CN" ? "任务包" : "Task packs"}</span></div><div><Icon name="agent"/><strong>{environment.adapters.length}</strong><span>Agents</span></div><div><Icon name="environment"/><strong>{environment.providers.length}</strong><span>Providers</span></div></div>
    <Section title={locale === "zh-CN" ? "任务包" : "Task packs"} actions={<button class="button ghost" type="button" onClick={() => setPage("plan")}>{locale === "zh-CN" ? "用于新评测" : "Use in new evaluation"}<Icon name="chevron"/></button>}>
      {environment.taskPacks.length === 0 ? <EmptyState icon="library" title={locale === "zh-CN" ? "没有任务包" : "No task packs"} message={locale === "zh-CN" ? "连接本地服务后重新检查。" : "Reconnect the local service and check again."}/> : <div class="resource-grid">{environment.taskPacks.map((task) => <article class="resource-card"><div class="resource-icon"><Icon name="plan"/></div><div class="resource-content"><div class="resource-title"><h3>{task.title ?? task.id ?? task.path}</h3>{task.compatibility?.status && <StatusPill tone={task.compatibility.status === "compatible" ? "success" : task.compatibility.status === "incompatible" ? "danger" : "warning"}>{task.compatibility.status}</StatusPill>}</div><p>{task.description ?? task.compatibility?.summary ?? task.path}</p><code>{task.path}</code></div></article>)}</div>}
    </Section>
    <div class="two-column">
      <Section title="Agents"><div class="compact-list">{environment.adapters.map((adapter) => <div class="compact-row"><Icon name="agent"/><div><strong>{adapter.title}</strong><small>{adapter.id}</small></div><StatusPill tone={adapter.kind === "demo" ? "info" : "neutral"}>{adapter.kind ?? "local"}</StatusPill></div>)}</div></Section>
      <Section title="Providers"><div class="compact-list">{environment.providers.length === 0 ? <p class="muted-line">{t(locale, "missing")}</p> : environment.providers.map((provider) => <div class="compact-row"><Icon name="environment"/><div><strong>{provider.name}</strong><small>{provider.primaryModel ?? provider.apiFormat ?? provider.id}</small></div><StatusPill tone={provider.kind === "official" ? "success" : "info"}>{provider.kind === "official" ? t(locale, "localOfficial") : t(locale, "isolatedProvider")}</StatusPill></div>)}</div></Section>
    </div>
  </>;
}
