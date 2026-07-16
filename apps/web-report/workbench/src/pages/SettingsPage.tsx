import { PageHeader, Section, t } from "../components/ui";
import { useWorkbench } from "../hooks/useWorkbench";
import type { Density, Locale, Theme } from "../types";

export function SettingsPage() {
  const { locale, theme, density, setLocale, setTheme, setDensity } = useWorkbench();
  return <>
    <PageHeader eyebrow="SETTINGS" title={t(locale, "settings")} description={locale === "zh-CN" ? "调整语言、主题和信息密度。" : "Adjust language, theme, and information density."}/>
    <div class="settings-layout">
      <Section title={t(locale, "language")}><div class="choice-grid two">{(["zh-CN", "en"] as Locale[]).map((value) => <label class={`choice-card ${locale === value ? "selected" : ""}`}><input type="radio" name="language" checked={locale === value} onChange={() => setLocale(value)}/><span><strong>{value === "zh-CN" ? "简体中文" : "English"}</strong><small>{value}</small></span></label>)}</div></Section>
      <Section title={t(locale, "appearance")}><div class="choice-grid three">{(["system", "light", "dark"] as Theme[]).map((value) => <label class={`choice-card ${theme === value ? "selected" : ""}`}><input type="radio" name="theme" checked={theme === value} onChange={() => setTheme(value)}/><span><strong>{t(locale, value)}</strong><small>{value === "system" ? (locale === "zh-CN" ? "使用设备设置" : "Use device setting") : (locale === "zh-CN" ? "独立主题" : "Explicit theme")}</small></span></label>)}</div></Section>
      <Section title={t(locale, "density")}><div class="choice-grid two">{(["comfortable", "compact"] as Density[]).map((value) => <label class={`choice-card ${density === value ? "selected" : ""}`}><input type="radio" name="density" checked={density === value} onChange={() => setDensity(value)}/><span><strong>{t(locale, value)}</strong><small>{value === "comfortable" ? (locale === "zh-CN" ? "更适合阅读" : "Optimized for reading") : (locale === "zh-CN" ? "更适合高频使用" : "Optimized for frequent use")}</small></span></label>)}</div></Section>
      <p class="settings-note">{t(locale, "savedLocally")}</p>
    </div>
  </>;
}
