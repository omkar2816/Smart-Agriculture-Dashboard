"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  LineChart,
  Search,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState, ErrorState, ChartSkeleton } from "@/components/dashboard/states";
import { TimeSeriesChart, ChartLegend } from "@/components/dashboard/time-series-chart";
import { RelayState, Chip } from "@/components/dashboard/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNow, useRangeReadings } from "@/lib/data/hooks";
import { useSettings } from "@/lib/settings/context";
import { buildChartSeries } from "@/lib/analytics/series";
import { computeStats, gapThresholdMs } from "@/lib/analytics/stats";
import { readingsToCsv, downloadCsv } from "@/lib/analytics/csv";
import { formatDateTime, formatFullDateTime, toLocalInputValue, fromLocalInputValue } from "@/lib/time";
import type { NumericMetric, Reading } from "@/lib/types";

type PresetRange = "1h" | "24h" | "7d" | "30d" | "custom";

const PRESETS: Record<Exclude<PresetRange, "custom">, { label: string; ms: number }> = {
  "1h": { label: "Last Hour", ms: 3600_000 },
  "24h": { label: "Last 24 Hours", ms: 24 * 3600_000 },
  "7d": { label: "Last 7 Days", ms: 7 * 24 * 3600_000 },
  "30d": { label: "Last 30 Days", ms: 30 * 24 * 3600_000 },
};

export default function HistoricalAnalyticsPage() {
  const { settings, tz } = useSettings();
  const now = useNow(60_000);

  const [preset, setPreset] = useState<PresetRange>("24h");
  const [customStart, setCustomStart] = useState<string>(() =>
    toLocalInputValue(now - 24 * 3600_000, tz),
  );
  const [customEnd, setCustomEnd] = useState<string>(() =>
    toLocalInputValue(now, tz),
  );

  // Active time range in epoch ms
  const range = useMemo(() => {
    if (preset !== "custom") {
      const ms = PRESETS[preset].ms;
      return { fromMs: now - ms, toMs: now + 60_000 };
    }
    const from = fromLocalInputValue(customStart, tz);
    const to = fromLocalInputValue(customEnd, tz);
    if (from && to && from <= to) return { fromMs: from, toMs: to };
    return { fromMs: now - 24 * 3600_000, toMs: now };
  }, [preset, now, customStart, customEnd, tz]);

  const { data, isLoading, isFetching, error, refetch } = useRangeReadings(range);
  const readings = useMemo(() => data?.readings ?? [], [data?.readings]);
  const isTruncated = data?.truncated ?? false;

  // Table search & pagination state
  const [tableSearch, setTableSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filteredReadings = useMemo(() => {
    if (!tableSearch.trim()) return readings;
    const term = tableSearch.toLowerCase();
    return readings.filter(
      (r) =>
        r.recordedAt.toLowerCase().includes(term) ||
        (r.deviceId && r.deviceId.toLowerCase().includes(term)),
    );
  }, [readings, tableSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredReadings.length / pageSize));
  const paginatedRows = useMemo(() => {
    // Newest first in table view
    const reversed = [...filteredReadings].reverse();
    const start = (page - 1) * pageSize;
    return reversed.slice(start, start + pageSize);
  }, [filteredReadings, page, pageSize]);

  // Compute stats for metrics
  const soil1Stats = useMemo(() => computeStats(readings, "soil1"), [readings]);
  const soil2Stats = useMemo(() => computeStats(readings, "soil2"), [readings]);
  const tempStats = useMemo(() => computeStats(readings, "temperature"), [readings]);
  const humStats = useMemo(() => computeStats(readings, "humidity"), [readings]);

  // Chart data
  const gap = useMemo(() => gapThresholdMs(readings), [readings]);
  const chartPoints = useMemo(() => {
    return buildChartSeries(
      readings,
      ["soil1", "soil2", "temperature", "humidity"],
      { gapMs: gap, maxPoints: 250 },
    );
  }, [readings, gap]);

  // Actuator activations
  const pumpActivations = useMemo(
    () => readings.filter((r) => r.pump === true).length,
    [readings],
  );
  const valve1Activations = useMemo(
    () => readings.filter((r) => r.valve1 === true).length,
    [readings],
  );
  const valve2Activations = useMemo(
    () => readings.filter((r) => r.valve2 === true).length,
    [readings],
  );

  const handleExportCsv = () => {
    if (!readings.length) return;
    const csv = readingsToCsv(readings);
    const filename = `agriculture_telemetry_${preset}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, csv);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Historical Analytics"
        title="Telemetry Data & Trends"
        description="Filter by time window, review statistical aggregations, compare plant zones, and export historical CSV logs."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!readings.length}
              className="bg-card shadow-xs"
            >
              <Download className="size-3.5 mr-1.5" />
              Export CSV ({readings.length})
            </Button>
          </div>
        }
      />

      {/* Range Selection Bar */}
      <div className="panel p-4 mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase mr-1 flex items-center gap-1.5">
            <Calendar className="size-3.5" /> Window:
          </span>
          {(["1h", "24h", "7d", "30d", "custom"] as const).map((p) => (
            <Button
              key={p}
              variant={preset === p ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPreset(p);
                setPage(1);
              }}
              className={
                preset === p
                  ? "bg-forest text-ivory hover:bg-forest/90"
                  : "bg-card text-xs"
              }
            >
              {p === "custom" ? "Custom Range" : PRESETS[p].label}
            </Button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 w-full pt-3 border-t border-border sm:w-auto sm:pt-0 sm:border-t-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">From:</span>
              <Input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 text-xs bg-card w-44"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">To:</span>
              <Input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 text-xs bg-card w-44"
              />
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {isFetching ? "Querying Supabase..." : `${readings.length} records retrieved`}
        </div>
      </div>

      {isTruncated && (
        <div className="mb-6 panel p-3.5 bg-[#f4e8cc] border-[#e6d3a1] text-xs text-[#7d5a12] flex items-center justify-between">
          <span>
            This query returned over 20,000 readings. For chart responsiveness and network optimization, the most recent 20,000 points were retained.
          </span>
        </div>
      )}

      {error ? (
        <ErrorState
          error={error}
          onRetry={refetch}
          className="mb-8"
          title="Could not load historical records"
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-6">
          <ChartSkeleton height={320} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel p-4 h-28 animate-pulse bg-muted/60" />
            ))}
          </div>
        </div>
      ) : readings.length === 0 ? (
        <EmptyState
          title="No Readings for Selected Period"
          icon={<LineChart className="size-6 text-forest" />}
        >
          No records were recorded between{" "}
          <strong>{formatDateTime(range.fromMs, tz)}</strong> and{" "}
          <strong>{formatDateTime(range.toMs, tz)}</strong>. Try widening your time window or selecting a different device.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Statistical Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Plant 1 Stats */}
            <div className="panel p-4">
              <p className="eyebrow flex items-center justify-between">
                <span>{settings.plant1Name} Moisture</span>
                <span className="text-forest font-semibold">Zone 1</span>
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="display-num text-3xl font-medium text-ink">
                  {soil1Stats.mean !== null ? `${soil1Stats.mean.toFixed(1)}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">arithmetic mean</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Min / Max:</span>
                  <span className="font-medium text-ink font-mono">
                    {soil1Stats.min !== null ? `${soil1Stats.min}%` : "—"} / {soil1Stats.max !== null ? `${soil1Stats.max}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Net Change:</span>
                  <span className="font-medium text-ink font-mono">
                    {soil1Stats.change !== null
                      ? `${soil1Stats.change > 0 ? "+" : ""}${soil1Stats.change.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between" title="Time-weighted mean accounts for irregular sampling intervals">
                  <span>Time-Weighted Avg:</span>
                  <span className="font-medium text-ink font-mono">
                    {soil1Stats.timeWeightedMean !== null
                      ? `${soil1Stats.timeWeightedMean.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Plant 2 Stats */}
            <div className="panel p-4">
              <p className="eyebrow flex items-center justify-between">
                <span>{settings.plant2Name} Moisture</span>
                <span className="text-[#c0792b] font-semibold">Zone 2</span>
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="display-num text-3xl font-medium text-ink">
                  {soil2Stats.mean !== null ? `${soil2Stats.mean.toFixed(1)}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">arithmetic mean</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Min / Max:</span>
                  <span className="font-medium text-ink font-mono">
                    {soil2Stats.min !== null ? `${soil2Stats.min}%` : "—"} / {soil2Stats.max !== null ? `${soil2Stats.max}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Net Change:</span>
                  <span className="font-medium text-ink font-mono">
                    {soil2Stats.change !== null
                      ? `${soil2Stats.change > 0 ? "+" : ""}${soil2Stats.change.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between" title="Time-weighted mean accounts for irregular sampling intervals">
                  <span>Time-Weighted Avg:</span>
                  <span className="font-medium text-ink font-mono">
                    {soil2Stats.timeWeightedMean !== null
                      ? `${soil2Stats.timeWeightedMean.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Temperature Stats */}
            <div className="panel p-4">
              <p className="eyebrow flex items-center justify-between">
                <span>Temperature</span>
                <span className="text-[#b4552d]">DHT11</span>
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="display-num text-3xl font-medium text-ink">
                  {tempStats.mean !== null ? `${tempStats.mean.toFixed(1)}°C` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">mean temp</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Min / Max:</span>
                  <span className="font-medium text-ink font-mono">
                    {tempStats.min !== null ? `${tempStats.min.toFixed(1)}°` : "—"} / {tempStats.max !== null ? `${tempStats.max.toFixed(1)}°` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Net Temp Change:</span>
                  <span className="font-medium text-ink font-mono">
                    {tempStats.change !== null
                      ? `${tempStats.change > 0 ? "+" : ""}${tempStats.change.toFixed(1)}°C`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Missing/Null Rows:</span>
                  <span className="font-medium text-ink font-mono">
                    {tempStats.missing} of {readings.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Actuation & Humidity Stats */}
            <div className="panel p-4">
              <p className="eyebrow flex items-center justify-between">
                <span>Humidity & Actuation</span>
                <span className="text-[#4d6e86]">Summary</span>
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="display-num text-3xl font-medium text-ink">
                  {humStats.mean !== null ? `${humStats.mean.toFixed(0)}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">mean RH</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Pump ON Readings:</span>
                  <span className="font-medium text-forest font-mono">
                    {pumpActivations}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Valve 1 / Valve 2 ON:</span>
                  <span className="font-medium text-ink font-mono">
                    {valve1Activations} / {valve2Activations}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Humidity Min / Max:</span>
                  <span className="font-medium text-ink font-mono">
                    {humStats.min ?? "—"}% / {humStats.max ?? "—"}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Multi-Series Historical Chart */}
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-medium text-ink text-base">
                  Multi-Sensor Historical Profile
                </h3>
                <p className="text-xs text-muted-foreground">
                  Gaps between samples greater than 3x the median interval break the trend line instead of drawing misleading linear extrapolations.
                </p>
              </div>
              <ChartLegend
                items={[
                  { label: `${settings.plant1Name} Soil`, color: "#2c6a47" },
                  { label: `${settings.plant2Name} Soil`, color: "#c0792b" },
                  { label: "Humidity (%)", color: "#4d6e86" },
                  { label: "Temperature (°C)", color: "#b4552d" },
                  { label: "Dry Threshold", color: "#b4552d", dashed: true },
                ]}
              />
            </div>

            <TimeSeriesChart
              data={chartPoints}
              tz={tz}
              height={320}
              leftUnit="%"
              rightUnit="°C"
              ariaLabel="Historical sensor data comparison chart"
              thresholds={[
                {
                  value: settings.plant1DryBelow,
                  label: "Dry",
                  color: "#b4552d",
                },
              ]}
              series={[
                {
                  key: "soil1",
                  label: `${settings.plant1Name} Soil`,
                  color: "#2c6a47",
                  unit: "%",
                  decimals: 0,
                },
                {
                  key: "soil2",
                  label: `${settings.plant2Name} Soil`,
                  color: "#c0792b",
                  unit: "%",
                  decimals: 0,
                },
                {
                  key: "humidity",
                  label: "Humidity",
                  color: "#4d6e86",
                  unit: "%",
                  decimals: 0,
                },
                {
                  key: "temperature",
                  label: "Temperature",
                  color: "#b4552d",
                  unit: "°C",
                  decimals: 1,
                  yAxisId: "right",
                },
              ]}
            />
          </div>

          {/* Paginated, Searchable Table of Readings */}
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-medium text-ink text-base flex items-center gap-2">
                  <TableIcon className="size-4 text-forest" />
                  Telemetry Log Table
                </h3>
                <p className="text-xs text-muted-foreground">
                  Inspecting {filteredReadings.length} records (showing newest first).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search timestamp / device..."
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-8 h-8 text-xs w-56 bg-card"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Timestamp ({tz})</TableHead>
                    <TableHead className="text-xs font-semibold">{settings.plant1Name} (%)</TableHead>
                    <TableHead className="text-xs font-semibold">{settings.plant2Name} (%)</TableHead>
                    <TableHead className="text-xs font-semibold">Temp (°C)</TableHead>
                    <TableHead className="text-xs font-semibold">Humidity (%)</TableHead>
                    <TableHead className="text-xs font-semibold">Pump</TableHead>
                    <TableHead className="text-xs font-semibold">Valve 1</TableHead>
                    <TableHead className="text-xs font-semibold">Valve 2</TableHead>
                    <TableHead className="text-xs font-semibold">Device ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-6 text-xs text-muted-foreground">
                        No matching readings found for query.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((r, i) => (
                      <TableRow key={`${r.t}-${i}`} className="text-xs">
                        <TableCell className="font-mono text-ink whitespace-nowrap">
                          {formatFullDateTime(r.t, tz)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {r.soil1 !== null ? `${r.soil1}%` : <span className="text-muted-foreground italic">null</span>}
                        </TableCell>
                        <TableCell className="font-mono">
                          {r.soil2 !== null ? `${r.soil2}%` : <span className="text-muted-foreground italic">null</span>}
                        </TableCell>
                        <TableCell className="font-mono">
                          {r.temperature !== null ? `${r.temperature.toFixed(1)}°` : <span className="text-muted-foreground italic">null</span>}
                        </TableCell>
                        <TableCell className="font-mono">
                          {r.humidity !== null ? `${r.humidity}%` : <span className="text-muted-foreground italic">null</span>}
                        </TableCell>
                        <TableCell>
                          <RelayState value={r.pump} />
                        </TableCell>
                        <TableCell>
                          <RelayState value={r.valve1} />
                        </TableCell>
                        <TableCell>
                          <RelayState value={r.valve2} />
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {r.deviceId ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <span>
                Page {page} of {totalPages} ({filteredReadings.length} total rows)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 px-2"
                >
                  <ChevronLeft className="size-3.5" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 px-2"
                >
                  Next <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
