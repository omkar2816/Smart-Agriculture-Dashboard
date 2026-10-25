"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Cpu,
  Droplets,
  Gauge,
  Info,
  Layers,
  Power,
  RefreshCw,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader, Section } from "@/components/dashboard/page-header";
import { MetricBlock, MoistureMeter } from "@/components/dashboard/metric";
import { RelayState, FreshnessPill, Chip } from "@/components/dashboard/status";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/dashboard/states";
import { TimeSeriesChart, ChartLegend } from "@/components/dashboard/time-series-chart";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDashboardData } from "@/lib/data/useDashboard";
import { useSettings } from "@/lib/settings/context";
import { buildChartSeries } from "@/lib/analytics/series";
import { gapThresholdMs } from "@/lib/analytics/stats";
import { formatFullDateTime, formatAge, formatTime } from "@/lib/time";

export default function LiveMonitoringPage() {
  const { settings, tz } = useSettings();
  const {
    latest,
    recent,
    freshness,
    now,
    isLoading,
    isFetching,
    error,
    isEmpty,
    refetch,
    lastFetchedAt,
  } = useDashboardData();

  const [showRawAdc, setShowRawAdc] = useState(false);

  // Compute 2-hour high-res telemetry chart
  const twoHoursAgo = now - 2 * 3600_000;
  const recentTwoHours = useMemo(
    () => recent.filter((r) => r.t >= twoHoursAgo),
    [recent, twoHoursAgo],
  );

  const gap = useMemo(() => gapThresholdMs(recentTwoHours, 5 * 60_000), [recentTwoHours]);

  const liveSeries = useMemo(() => {
    return buildChartSeries(
      recentTwoHours,
      ["soil1", "soil2", "temperature", "humidity"],
      { gapMs: gap, maxPoints: 100 },
    );
  }, [recentTwoHours, gap]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Real-Time Telemetry"
        title="Live Monitoring"
        description="Near real-time view of field sensors, actuator states, and device telemetry."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border">
              <Switch
                id="raw-adc-switch"
                checked={showRawAdc}
                onCheckedChange={setShowRawAdc}
              />
              <Label htmlFor="raw-adc-switch" className="text-xs cursor-pointer">
                Show Raw ADC (0–4095)
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-card shadow-xs"
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${isFetching ? "animate-spin text-forest" : ""}`}
              />
              {isFetching ? "Polling DB..." : `Poll now (${settings.refreshSeconds}s)`}
            </Button>
          </div>
        }
      />

      {/* Critical telemetry latency & connection disclaimer */}
      <div className="mb-6 panel p-4 bg-[#f8f6ee] border-[#dfd7c2] text-xs leading-relaxed text-muted-foreground flex items-start gap-3">
        <Info className="size-4 text-forest shrink-0 mt-0.5" />
        <div>
          <strong className="text-ink font-medium">Important Telemetry Distinction:</strong>{" "}
          This dashboard queries the Supabase database periodically every {settings.refreshSeconds} seconds. The values shown reflect the latest row recorded by your ESP32. It does not establish a continuous WebSocket or direct Wi-Fi tunnel to the microcontroller. If the ESP32 is powered off, the last database reading remains visible with a &ldquo;stale&rdquo; or &ldquo;offline&rdquo; status indicator.
        </div>
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={refetch}
          className="mb-8"
          title="Telemetry Polling Error"
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel p-5">
                <LoadingBlock lines={3} />
              </div>
            ))}
          </div>
        </div>
      ) : isEmpty ? (
        <EmptyState
          title="No Telemetry Received Yet"
          icon={<Cpu className="size-6 text-forest" />}
          action={
            <Button asChild variant="outline">
              <Link href="/settings">Check Connection Settings</Link>
            </Button>
          }
        >
          No readings are found in the database. Ensure your ESP32 hardware is powered on, connected to the network, and actively transmitting sensor telemetry.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Main live meters grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Plant 1 Live Moisture */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="eyebrow flex items-center gap-1.5">
                    <Droplets className="size-3.5 text-forest" />
                    {settings.plant1Name}
                  </span>
                  <Chip tone="info">Zone 1</Chip>
                </div>
                <MetricBlock
                  label="Soil Moisture"
                  value={latest?.soil1 ?? null}
                  unit="%"
                  tone={
                    latest?.soil1 !== null && latest?.soil1 !== undefined && latest.soil1 < settings.plant1DryBelow
                      ? "action"
                      : "good"
                  }
                  sub={
                    latest?.soil1 !== null && latest?.soil1 !== undefined && latest.soil1 < settings.plant1DryBelow
                      ? "Needs Irrigation"
                      : "Adequate Moisture"
                  }
                >
                  <MoistureMeter
                    value={latest?.soil1 ?? null}
                    dryBelow={settings.plant1DryBelow}
                    wetAbove={settings.wetAbove}
                  />
                  {showRawAdc && (
                    <div className="mt-3 pt-2 border-t border-border/60 text-xs font-mono text-muted-foreground flex justify-between">
                      <span>ADC Raw (soil_1_raw):</span>
                      <strong className="text-ink">{latest?.soil1Raw ?? "null"}</strong>
                    </div>
                  )}
                </MetricBlock>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-[0.7rem] text-muted-foreground flex justify-between">
                <span>Associated Valve:</span>
                <RelayState value={latest?.valve1 ?? null} label="Valve 1" />
              </div>
            </div>

            {/* Plant 2 Live Moisture */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="eyebrow flex items-center gap-1.5">
                    <Droplets className="size-3.5 text-[#c0792b]" />
                    {settings.plant2Name}
                  </span>
                  <Chip tone="watch">Zone 2</Chip>
                </div>
                <MetricBlock
                  label="Soil Moisture"
                  value={latest?.soil2 ?? null}
                  unit="%"
                  tone={
                    latest?.soil2 !== null && latest?.soil2 !== undefined && latest.soil2 < settings.plant2DryBelow
                      ? "action"
                      : "good"
                  }
                  sub={
                    latest?.soil2 !== null && latest?.soil2 !== undefined && latest.soil2 < settings.plant2DryBelow
                      ? "Needs Irrigation"
                      : "Adequate Moisture"
                  }
                >
                  <MoistureMeter
                    value={latest?.soil2 ?? null}
                    dryBelow={settings.plant2DryBelow}
                    wetAbove={settings.wetAbove}
                  />
                  {showRawAdc && (
                    <div className="mt-3 pt-2 border-t border-border/60 text-xs font-mono text-muted-foreground flex justify-between">
                      <span>ADC Raw (soil_2_raw):</span>
                      <strong className="text-ink">{latest?.soil2Raw ?? "null"}</strong>
                    </div>
                  )}
                </MetricBlock>
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-[0.7rem] text-muted-foreground flex justify-between">
                <span>Associated Valve:</span>
                <RelayState value={latest?.valve2 ?? null} label="Valve 2" />
              </div>
            </div>

            {/* DHT11 Temperature */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="eyebrow flex items-center gap-1.5">
                    <Thermometer className="size-3.5 text-[#b4552d]" />
                    Ambient Temp
                  </span>
                  <span className="text-[0.7rem] text-muted-foreground">DHT11</span>
                </div>
                <MetricBlock
                  label="Temperature"
                  value={latest?.temperature ?? null}
                  unit="°C"
                  decimals={1}
                  sub="Canopy Microclimate"
                />
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground flex justify-between items-center">
                <span>Main Pump Relay:</span>
                <RelayState value={latest?.pump ?? null} label="Pump" />
              </div>
            </div>

            {/* DHT11 Humidity */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="eyebrow flex items-center gap-1.5">
                    <Wind className="size-3.5 text-[#4d6e86]" />
                    Air Humidity
                  </span>
                  <span className="text-[0.7rem] text-muted-foreground">DHT11</span>
                </div>
                <MetricBlock
                  label="Relative Humidity"
                  value={latest?.humidity ?? null}
                  unit="%"
                  decimals={0}
                  sub="Evapotranspiration indicator"
                />
              </div>
              <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground flex justify-between items-center">
                <span>Connection status:</span>
                <FreshnessPill freshness={freshness} />
              </div>
            </div>
          </div>

          {/* Actuator & Microcontroller Hardware Panel */}
          <div className="panel p-6">
            <h3 className="font-medium text-ink text-base mb-4 flex items-center gap-2">
              <Power className="size-4 text-forest" />
              Actuator & Relay Command Diagnostics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-lg border border-border p-4 bg-card/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Water Pump Relay (pump_on)
                  </span>
                  <RelayState value={latest?.pump ?? null} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Controls the primary 12V/5V DC water pump. When triggered by the ESP32 logic or irrigation routine, this relay activates main water flow.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4 bg-card/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Valve 1 Relay (valve_1_on)
                  </span>
                  <RelayState value={latest?.valve1 ?? null} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Solenoid valve directing water specifically to {settings.plant1Name} (Zone 1). Operates in tandem with the water pump.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4 bg-card/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    Valve 2 Relay (valve_2_on)
                  </span>
                  <RelayState value={latest?.valve2 ?? null} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Solenoid valve directing water specifically to {settings.plant2Name} (Zone 2). Independent channel for multi-plant balancing.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border/60 text-xs text-muted-foreground">
              <div>
                {latest?.deviceId ? (
                  <>
                    Device ID:{" "}
                    <span className="font-mono text-ink font-medium">
                      {latest.deviceId}
                    </span>{" "}
                    |{" "}
                  </>
                ) : null}
                Telemetry Timestamp:{" "}
                <span className="font-medium text-ink">
                  {latest ? formatFullDateTime(latest.t, tz) : "N/A"}
                </span>
              </div>
              <div>
                Auto-irrigation logic is executed on the ESP32 hardware to ensure safety if network connectivity drops.
              </div>
            </div>
          </div>

          {/* High resolution live charts */}
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-medium text-ink text-base">
                  Recent Telemetry Stream (Last 2 Hours)
                </h3>
                <p className="text-xs text-muted-foreground">
                  High-frequency inspection of soil moisture, ambient temperature, and humidity.
                </p>
              </div>
              <ChartLegend
                items={[
                  { label: `${settings.plant1Name} Moisture`, color: "#2c6a47" },
                  { label: `${settings.plant2Name} Moisture`, color: "#c0792b" },
                  { label: "Temperature (°C)", color: "#b4552d" },
                  { label: "Humidity (%)", color: "#4d6e86" },
                ]}
              />
            </div>

            {liveSeries.length > 1 ? (
              <TimeSeriesChart
                data={liveSeries}
                tz={tz}
                height={300}
                leftUnit="%"
                rightUnit="°C"
                ariaLabel="Live sensor telemetry chart over the last 2 hours"
                series={[
                  {
                    key: "soil1",
                    label: `${settings.plant1Name} Moisture`,
                    color: "#2c6a47",
                    unit: "%",
                    decimals: 0,
                  },
                  {
                    key: "soil2",
                    label: `${settings.plant2Name} Moisture`,
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
            ) : (
              <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
                Waiting for additional telemetry points to populate the high-resolution stream...
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
