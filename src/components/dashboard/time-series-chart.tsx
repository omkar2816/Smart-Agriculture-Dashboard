"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTime, formatTick } from "@/lib/time";

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  unit?: string;
  dashed?: boolean;
  yAxisId?: "left" | "right";
  decimals?: number;
  step?: boolean;
  /** Draw dots (useful for sparse data and forecast points). */
  dots?: boolean;
}

export interface BandDef {
  key: string; // data key holding [lower, upper] | null
  color: string;
  label?: string;
}

export interface ThresholdDef {
  value: number;
  label: string;
  color: string;
  yAxisId?: "left" | "right";
}

export type ChartRow = { t: number } & Record<string, number | null | [number, number] | undefined>;

interface Props {
  data: ChartRow[];
  series: SeriesDef[];
  tz: string;
  height?: number;
  leftUnit?: string;
  rightUnit?: string;
  leftDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  rightDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  thresholds?: ThresholdDef[];
  bands?: BandDef[];
  /** Vertical line + shaded region marking "forecast starts here". */
  forecastFrom?: number | null;
  forecastTo?: number | null;
  ariaLabel: string;
  xDomain?: [number, number];
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: unknown;
}

export function TimeSeriesChart({
  data,
  series,
  tz,
  height = 280,
  leftUnit,
  rightUnit,
  leftDomain = ["auto", "auto"],
  rightDomain = ["auto", "auto"],
  thresholds = [],
  bands = [],
  forecastFrom,
  forecastTo,
  ariaLabel,
  xDomain,
}: Props) {
  const span = useMemo(() => {
    if (xDomain) return xDomain[1] - xDomain[0];
    if (!data.length) return 0;
    return data[data.length - 1].t - data[0].t;
  }, [data, xDomain]);
  const hasRight = series.some((s) => s.yAxisId === "right");
  const domainX: [number | string, number | string] = xDomain ?? ["dataMin", "dataMax"];

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: hasRight ? 4 : 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e7e0cd" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={domainX}
            tickFormatter={(v: number) => formatTick(v, tz, span)}
            tickLine={false}
            axisLine={{ stroke: "#d9d1bb" }}
            minTickGap={48}
            tickMargin={8}
          />
          <YAxis
            yAxisId="left"
            domain={leftDomain}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${Math.round(v * 10) / 10}${leftUnit ?? ""}`}
          />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={rightDomain}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${Math.round(v * 10) / 10}${rightUnit ?? ""}`}
            />
          )}
          <Tooltip
            cursor={{ stroke: "#9aa293", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const entries = payload as unknown as TooltipEntry[];
              const rows = series
                .map((s) => {
                  const e = entries.find((p) => p.dataKey === s.key);
                  const v = e?.value;
                  return typeof v === "number" ? { s, v } : null;
                })
                .filter(Boolean) as Array<{ s: SeriesDef; v: number }>;
              const bandRows = bands
                .map((b) => {
                  const e = entries.find((p) => p.dataKey === b.key);
                  return Array.isArray(e?.value) ? { b, v: e!.value as [number, number] } : null;
                })
                .filter(Boolean) as Array<{ b: BandDef; v: [number, number] }>;
              if (!rows.length && !bandRows.length) return null;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 font-medium text-ink">{formatDateTime(Number(label), tz)}</p>
                  {rows.map(({ s, v }) => (
                    <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
                      <span className="size-2 rounded-full" style={{ background: s.color }} />
                      {s.label}
                      <span className="num ml-auto pl-4 font-medium text-ink">
                        {v.toFixed(s.decimals ?? 1)}
                        {s.unit ?? ""}
                      </span>
                    </p>
                  ))}
                  {bandRows.map(({ b, v }) => (
                    <p key={b.key} className="flex items-center gap-2 text-muted-foreground">
                      <span className="size-2 rounded-full opacity-40" style={{ background: b.color }} />
                      {b.label ?? "80% range"}
                      <span className="num ml-auto pl-4 text-ink">
                        {v[0].toFixed(1)} – {v[1].toFixed(1)}
                      </span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {forecastFrom != null && forecastTo != null && (
            <ReferenceArea yAxisId="left" x1={forecastFrom} x2={forecastTo} fill="#e7ecd2" fillOpacity={0.45} stroke="none" ifOverflow="hidden" />
          )}
          {forecastFrom != null && (
            <ReferenceLine
              yAxisId="left"
              x={forecastFrom}
              stroke="#6d7a3a"
              strokeDasharray="4 3"
              label={{ value: "forecast →", position: "insideTopLeft", fill: "#6d7a3a", fontSize: 11 }}
            />
          )}
          {thresholds.map((t) => (
            <ReferenceLine
              key={t.label}
              yAxisId={t.yAxisId ?? "left"}
              y={t.value}
              stroke={t.color}
              strokeDasharray="5 4"
              label={{ value: t.label, position: "insideBottomRight", fill: t.color, fontSize: 11 }}
            />
          ))}
          {bands.map((b) => (
            <Area
              key={b.key}
              yAxisId="left"
              dataKey={b.key}
              stroke="none"
              fill={b.color}
              fillOpacity={0.18}
              isAnimationActive={false}
              connectNulls={false}
              activeDot={false}
              legendType="none"
            />
          ))}
          {series.map((s) => (
            <Line
              key={s.key}
              yAxisId={s.yAxisId ?? "left"}
              type={s.step ? "stepAfter" : "monotone"}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.dashed ? 2 : 2.2}
              strokeDasharray={s.dashed ? "6 4" : undefined}
              dot={s.dots ? { r: 3, strokeWidth: 0, fill: s.color } : false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span
            className="inline-block h-0 w-5 border-t-2"
            style={{ borderColor: i.color, borderTopStyle: i.dashed ? "dashed" : "solid" }}
            aria-hidden
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
