"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Calendar,
  Clock,
  Droplets,
  HelpCircle,
  Info,
  Power,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader, Section } from "@/components/dashboard/page-header";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/dashboard/states";
import { RelayState, Chip } from "@/components/dashboard/status";
import { Button } from "@/components/ui/button";
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
import { deriveSessions, totalOnMs, intervalDurationMs } from "@/lib/analytics/irrigation";
import { gapThresholdMs } from "@/lib/analytics/stats";
import { formatDateTime, formatFullDateTime, formatDuration } from "@/lib/time";

export default function IrrigationHistoryPage() {
  const { settings, tz } = useSettings();
  const now = useNow(60_000);

  const [days, setDays] = useState<number>(7);
  const range = useMemo(() => {
    return {
      fromMs: now - days * 24 * 3600_000,
      toMs: now + 60_000,
    };
  }, [now, days]);

  const { data, isLoading, error, refetch, isFetching } = useRangeReadings(range);
  const readings = useMemo(() => data?.readings ?? [], [data?.readings]);

  const gap = useMemo(() => gapThresholdMs(readings), [readings]);
  const sessions = useMemo(() => deriveSessions(readings, gap), [readings, gap]);

  const totalPumpDuration = useMemo(
    () => totalOnMs(sessions.map((s) => s.interval), now),
    [sessions, now],
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Actuator Log"
        title="Irrigation History & Sessions"
        description="Chronological record of water pump and solenoid valve relay command cycles and observed soil moisture responses."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-card shadow-xs"
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${isFetching ? "animate-spin text-forest" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Critical hardware caution banner */}
      <div className="mb-6 panel p-4 bg-[#f8f6ee] border-[#dfd7c2] text-xs leading-relaxed text-muted-foreground flex items-start gap-3">
        <Info className="size-4 text-forest shrink-0 mt-0.5" />
        <div>
          <strong className="text-ink font-medium">Relay Command Reality:</strong>{" "}
          The database stores relay switch commands (<code className="font-mono text-xs">pump_on</code>, <code className="font-mono text-xs">valve_1_on</code>, <code className="font-mono text-xs">valve_2_on</code>) as commanded by the ESP32. It does not possess an independent inline flow meter or water pressure sensor. Therefore, a &ldquo;pump ON&rdquo; cycle reflects the electrical relay status, not physical water volume delivered. Always cross-reference the observed soil moisture rise.
        </div>
      </div>

      {/* Filter range tabs */}
      <div className="panel p-4 mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase mr-1">
            Window:
          </span>
          {[1, 3, 7, 14, 30].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
              className={days === d ? "bg-forest text-ivory" : "bg-card text-xs"}
            >
              {d === 1 ? "Last 24h" : `${d} Days`}
            </Button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {sessions.length} pump cycle{sessions.length === 1 ? "" : "s"} identified across {readings.length} readings
        </div>
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={refetch}
          className="mb-8"
          title="Could not load irrigation records"
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-4">
          <LoadingBlock lines={4} />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No Irrigation Sessions Detected"
          icon={<Droplets className="size-6 text-forest" />}
        >
          No pump ON commands were recorded in the database during the selected {days}-day window. If automatic irrigation has not triggered, your soil moisture may be safely above your dry thresholds ({settings.plant1DryBelow}% / {settings.plant2DryBelow}%).
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Summary metrics ribbon */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="panel p-4">
              <span className="eyebrow">Total Pump Activations</span>
              <p className="display-num text-3xl font-medium text-ink mt-2">
                {sessions.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Completed relay command intervals
              </p>
            </div>

            <div className="panel p-4">
              <span className="eyebrow">Cumulative Pump Runtime</span>
              <p className="display-num text-3xl font-medium text-ink mt-2">
                {formatDuration(totalPumpDuration.min)} – {formatDuration(totalPumpDuration.max)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Estimated bounds based on sampling intervals
              </p>
            </div>

            <div className="panel p-4">
              <span className="eyebrow">Moisture Rise Validation</span>
              <p className="display-num text-3xl font-medium text-forest mt-2">
                {
                  sessions.filter((s) => s.responses.some((r) => r.rose)).length
                }{" "}
                / {sessions.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cycles showing &ge;3% moisture rise within 30 min
              </p>
            </div>
          </div>

          {/* Sessions Detailed Table */}
          <div className="panel p-5">
            <h3 className="font-medium text-ink text-base mb-4 flex items-center gap-2">
              <Clock className="size-4 text-forest" />
              Irrigation Cycles & Observed Soil Responses
            </h3>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Start Time ({tz})</TableHead>
                    <TableHead className="text-xs font-semibold">Duration Range</TableHead>
                    <TableHead className="text-xs font-semibold">Active Valves</TableHead>
                    <TableHead className="text-xs font-semibold">{settings.plant1Name} Response</TableHead>
                    <TableHead className="text-xs font-semibold">{settings.plant2Name} Response</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...sessions].reverse().map((s, idx) => {
                    const dur = intervalDurationMs(s.interval, now);
                    const r1 = s.responses.find((r) => r.plant === 1);
                    const r2 = s.responses.find((r) => r.plant === 2);

                    return (
                      <TableRow key={idx} className="text-xs">
                        <TableCell className="font-mono text-ink whitespace-nowrap">
                          {formatFullDateTime(s.interval.start, tz)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {dur.min === dur.max
                            ? formatDuration(dur.min)
                            : `${formatDuration(dur.min)} – ${formatDuration(dur.max)}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {s.valve1Seen && <Chip tone="info">Valve 1</Chip>}
                            {s.valve2Seen && <Chip tone="watch">Valve 2</Chip>}
                            {!s.valve1Seen && !s.valve2Seen && (
                              <span className="text-muted-foreground italic">None logged</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r1 && r1.before !== null && r1.peak !== null ? (
                            <span className="flex items-center gap-1.5 font-mono">
                              <span>
                                {r1.before}% &rarr; {r1.peak}%
                              </span>
                              {r1.rose ? (
                                <span className="text-forest font-semibold">
                                  (+{r1.delta}%)
                                </span>
                              ) : (
                                <span className="text-muted-foreground">(no rise)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r2 && r2.before !== null && r2.peak !== null ? (
                            <span className="flex items-center gap-1.5 font-mono">
                              <span>
                                {r2.before}% &rarr; {r2.peak}%
                              </span>
                              {r2.rose ? (
                                <span className="text-forest font-semibold">
                                  (+{r2.delta}%)
                                </span>
                              ) : (
                                <span className="text-muted-foreground">(no rise)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.ongoing ? (
                            <Chip tone="action">Active Now</Chip>
                          ) : s.responses.some((r) => r.rose) ? (
                            <Chip tone="good">Watering Confirmed</Chip>
                          ) : (
                            <Chip tone="neutral">No Rise Seen</Chip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-[0.72rem] text-muted-foreground">
              * Note: A &ldquo;No Rise Seen&rdquo; label does not guarantee pump failure; short watering cycles or sensor placement away from direct dripper lines can delay soil absorption.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
