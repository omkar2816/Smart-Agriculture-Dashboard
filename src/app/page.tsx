"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CloudSun,
  Droplets,
  Gauge,
  LineChart,
  RefreshCw,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader, Section } from "@/components/dashboard/page-header";
import { MetricBlock, MoistureMeter } from "@/components/dashboard/metric";
import { RelayState, FreshnessPill } from "@/components/dashboard/status";
import { InsightList } from "@/components/dashboard/insight-list";
import { EmptyState, ErrorState, LoadingBlock, ChartSkeleton } from "@/components/dashboard/states";
import { TimeSeriesChart, ChartLegend } from "@/components/dashboard/time-series-chart";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/lib/data/useDashboard";
import { useSettings } from "@/lib/settings/context";
import { buildInsights, irrigationOutlook } from "@/lib/insights";
import { latestValue } from "@/lib/data/normalize";
import { buildChartSeries } from "@/lib/analytics/series";
import { gapThresholdMs } from "@/lib/analytics/stats";
import { formatFullDateTime, formatAge } from "@/lib/time";
import { useQuery } from "@tanstack/react-query";
import type { WeatherForecast } from "@/lib/weather/openMeteo";
import { rainOutlook } from "@/lib/weather/openMeteo";

export default function OverviewPage() {
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
  } = useDashboardData();

  // Weather query for farm location (if coordinates provided)
  const hasCoords = settings.latitude !== null && settings.longitude !== null;
  const weatherQuery = useQuery<WeatherForecast>({
    queryKey: ["weather", settings.latitude, settings.longitude],
    enabled: hasCoords,
    queryFn: async () => {
      const res = await fetch(
        `/api/weather?lat=${settings.latitude}&lon=${settings.longitude}`,
      );
      if (!res.ok) throw new Error("Weather unavailable");
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  const weather = weatherQuery.data ?? null;
  const rain = useMemo(() => (weather ? rainOutlook(weather, now) : null), [weather, now]);

  // Insights derived deterministically
  const insights = useMemo(
    () => buildInsights({ readings: recent, settings, rain, now }),
    [recent, settings, rain, now],
  );

  const plant1Moisture = latest ? latest.soil1 : null;
  const plant2Moisture = latest ? latest.soil2 : null;
  const temperature = latest ? latest.temperature : null;
  const humidity = latest ? latest.humidity : null;

  // Chart data for 24h soil moisture trends
  const chartData = useMemo(() => {
    if (!recent.length) return [];
    const gap = gapThresholdMs(recent);
    return buildChartSeries(recent, ["soil1", "soil2"], {
      gapMs: gap,
      maxPoints: 120,
    });
  }, [recent]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Agricultural Operations"
        title={settings.farmName || "Farm Overview"}
        description={
          latest ? (
            <span>
              Latest reading received{" "}
              <strong className="font-medium text-ink">
                {formatFullDateTime(latest.t, tz)}
              </strong>{" "}
              ({formatAge(now - latest.t)}).
            </span>
          ) : (
            "Connecting to your Supabase telemetry feed..."
          )
        }
        actions={
          <div className="flex items-center gap-2">
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
              {isFetching ? "Refreshing" : "Refresh"}
            </Button>
            <Button asChild size="sm" className="bg-forest text-ivory hover:bg-forest/90">
              <Link href="/live">
                <Activity className="size-3.5 mr-1.5" />
                Live Feed
              </Link>
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorState
          error={error}
          onRetry={refetch}
          className="mb-8"
          title="Could not load sensor telemetry"
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel p-5">
                <LoadingBlock lines={3} />
              </div>
            ))}
          </div>
          <ChartSkeleton height={320} />
        </div>
      ) : isEmpty ? (
        <EmptyState
          title="No Sensor Readings Found"
          icon={<Gauge className="size-6 text-forest" />}
          action={
            <Button asChild variant="outline">
              <Link href="/settings">Configure Database & Settings</Link>
            </Button>
          }
        >
          Your database connection is active, but no sensor telemetry rows have been found in the database yet. As soon as records are inserted into your database, telemetry cards and trend analytics will appear here automatically.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Top Status & Weather Highlights */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Soil Moisture 1 */}
            <div className="panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="eyebrow flex items-center gap-1.5">
                  <Droplets className="size-3.5 text-forest" />
                  {settings.plant1Name}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  Zone 1
                </span>
              </div>
              <MetricBlock
                label="Soil Moisture"
                value={plant1Moisture}
                unit="%"
                tone={
                  plant1Moisture !== null && plant1Moisture < settings.plant1DryBelow
                    ? "action"
                    : plant1Moisture !== null && plant1Moisture > settings.wetAbove
                    ? "info"
                    : "good"
                }
                sub={
                  plant1Moisture !== null && plant1Moisture < settings.plant1DryBelow
                    ? `Below dry threshold (${settings.plant1DryBelow}%)`
                    : "Within optimal soil range"
                }
              >
                <MoistureMeter
                  value={plant1Moisture}
                  dryBelow={settings.plant1DryBelow}
                  wetAbove={settings.wetAbove}
                />
              </MetricBlock>
            </div>

            {/* Soil Moisture 2 */}
            <div className="panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="eyebrow flex items-center gap-1.5">
                  <Droplets className="size-3.5 text-[#c0792b]" />
                  {settings.plant2Name}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  Zone 2
                </span>
              </div>
              <MetricBlock
                label="Soil Moisture"
                value={plant2Moisture}
                unit="%"
                tone={
                  plant2Moisture !== null && plant2Moisture < settings.plant2DryBelow
                    ? "action"
                    : plant2Moisture !== null && plant2Moisture > settings.wetAbove
                    ? "info"
                    : "good"
                }
                sub={
                  plant2Moisture !== null && plant2Moisture < settings.plant2DryBelow
                    ? `Below dry threshold (${settings.plant2DryBelow}%)`
                    : "Within optimal soil range"
                }
              >
                <MoistureMeter
                  value={plant2Moisture}
                  dryBelow={settings.plant2DryBelow}
                  wetAbove={settings.wetAbove}
                />
              </MetricBlock>
            </div>

            {/* Temperature */}
            <div className="panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="eyebrow flex items-center gap-1.5">
                  <Thermometer className="size-3.5 text-[#b4552d]" />
                  Ambient Air
                </span>
                <span className="text-xs text-muted-foreground">DHT11</span>
              </div>
              <MetricBlock
                label="Temperature"
                value={temperature}
                unit="°C"
                decimals={1}
                sub="Canopy air temperature"
              />
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground flex justify-between">
                <span>Relay 1:</span>
                <RelayState value={latest?.valve1 ?? null} label="Valve 1" />
              </div>
            </div>

            {/* Humidity & Pump Status */}
            <div className="panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="eyebrow flex items-center gap-1.5">
                  <Wind className="size-3.5 text-[#4d6e86]" />
                  Relative Humidity
                </span>
                <span className="text-xs text-muted-foreground">DHT11</span>
              </div>
              <MetricBlock
                label="Relative Humidity"
                value={humidity}
                unit="%"
                decimals={0}
                sub="Moisture in air"
              />
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground flex justify-between">
                <span>Relay 2:</span>
                <RelayState value={latest?.valve2 ?? null} label="Valve 2" />
              </div>
            </div>
          </div>

          {/* Actuator & Connectivity Summary Ribbon */}
          <div className="panel p-4 flex flex-wrap items-center justify-between gap-4 bg-muted/40">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Water Pump:
                </span>
                <RelayState value={latest?.pump ?? null} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Valve 1:
                </span>
                <RelayState value={latest?.valve1 ?? null} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Valve 2:
                </span>
                <RelayState value={latest?.valve2 ?? null} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Device State:
                </span>
                <FreshnessPill freshness={freshness} />
              </div>
            </div>
            <p className="text-[0.75rem] text-muted-foreground italic">
              * Note: States reflect recorded relay commands in database, not independent water flow proof.
            </p>
          </div>

          {/* Weather integration notice if available */}
          {hasCoords && weather ? (
            <div className="panel p-4 bg-[#f4f7ee] border-[#c9d6b0] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-forest text-ivory flex items-center justify-center">
                  <CloudSun className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-ink">
                    Local Open-Meteo Weather Outlook ({weather.timezone})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Current: {weather.current?.temperature ?? "—"}°C, Humidity:{" "}
                    {weather.current?.humidity ?? "—"}%. Wind:{" "}
                    {weather.current?.windSpeedKmh ?? "—"} km/h.
                    {rain?.maxProbability !== null && rain?.maxProbability !== undefined ? (
                      <span className="ml-1 font-medium text-forest">
                        Next 24h precipitation probability up to {rain.maxProbability}%.
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="bg-white/80">
                <Link href="/weather">View 7-Day Forecast</Link>
              </Button>
            </div>
          ) : !hasCoords ? (
            <div className="panel p-4 bg-[#fbf8f0] border-dashed border-[#d3cbb3] flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Want real meteorological rain forecasts? Configure your farm coordinates in Settings.
              </span>
              <Button asChild variant="link" size="sm" className="text-forest">
                <Link href="/settings">Add Location</Link>
              </Button>
            </div>
          ) : null}

          {/* Trends and Insights Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 24-Hour Moisture Trend Chart */}
            <div className="panel p-5 lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-medium text-ink text-base">
                      24-Hour Soil Moisture Trend
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Comparing {settings.plant1Name} and {settings.plant2Name} moisture levels
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="text-xs text-forest">
                    <Link href="/analytics">
                      Full Analytics <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>

                {chartData.length > 1 ? (
                  <TimeSeriesChart
                    data={chartData}
                    tz={tz}
                    height={260}
                    leftUnit="%"
                    leftDomain={[0, 100]}
                    ariaLabel="24-hour soil moisture comparison chart"
                    series={[
                      {
                        key: "soil1",
                        label: settings.plant1Name,
                        color: "#2c6a47",
                        unit: "%",
                        decimals: 0,
                      },
                      {
                        key: "soil2",
                        label: settings.plant2Name,
                        color: "#c0792b",
                        unit: "%",
                        decimals: 0,
                      },
                    ]}
                    thresholds={[
                      {
                        value: settings.plant1DryBelow,
                        label: "Dry Threshold",
                        color: "#b4552d",
                      },
                    ]}
                  />
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
                    Collecting historical points to draw trend chart...
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/60">
                <ChartLegend
                  items={[
                    { label: settings.plant1Name, color: "#2c6a47" },
                    { label: settings.plant2Name, color: "#c0792b" },
                    { label: `Dry (${settings.plant1DryBelow}%)`, color: "#b4552d", dashed: true },
                  ]}
                />
              </div>
            </div>

            {/* Actionable Agricultural Insights */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-ink text-base">
                    Smart Insights
                  </h3>
                  <Button asChild variant="ghost" size="sm" className="text-xs text-forest">
                    <Link href="/predictions">
                      AI & Forecasts <Sparkles className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
                <InsightList
                  insights={insights.slice(0, 4)}
                  empty="All sensor readings are currently balanced and within safe thresholds."
                />
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                Insights are calculated transparently from telemetry trends and configured thresholds.
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
