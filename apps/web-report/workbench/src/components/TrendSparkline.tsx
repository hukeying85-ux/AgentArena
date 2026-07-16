import { t } from "../components/ui";
import type { Locale } from "../types";

interface TrendSparklineProps {
  values: Array<number | null>;
  locale: Locale;
  tone?: "accent" | "success" | "danger" | "neutral";
  width?: number;
  height?: number;
  label?: string;
}

/**
 * Dependency-free inline SVG sparkline. Null values are treated as gaps so an
 * agent missing data in some runs doesn't get backfilled with a misleading zero.
 */
export function TrendSparkline({ values, locale, tone = "accent", width = 120, height = 32, label }: TrendSparklineProps) {
  const known = values.filter((value): value is number => value !== null);
  const hasData = known.length >= 2;

  if (!hasData) {
    return <span class="sparkline-empty" title={label}>{t(locale, "unknown")}</span>;
  }

  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      if (value === null) return "";
      const x = index * stepX;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <svg class={`sparkline tone-${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "trend"}>
      <polyline points={points} fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  );
}
