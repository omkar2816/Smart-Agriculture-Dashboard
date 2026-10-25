"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  ExternalLink,
  Info,
  MapPin,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader, Section } from "@/components/dashboard/page-header";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/dashboard/states";
import { TimeSeriesChart, ChartLegend } from "@/components/dashboard/time-series-chart";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings/context";
import { useNow, useLatestReading } from "@/lib/data/hooks";
import {
  rainOutlook,
  weatherCodeLabel,
  isWetCode,
  type WeatherForecast,
} from "@/lib/weather/openMeteo";
import { formatDateTime, formatDay, formatTime, formatAge } from "@/lib/time";
import { useQuery } from "@tanstack/react-query";

function WeatherIcon({ code, isDay = true, className = "size-5" }: { code: number | null; isDay?: boolean | null; className?: string }) {
  if (code === null) return <Cloud className={className} />;
  if (code === 0) return isDay ? <Sun className={`${className} text-amber-500`} /> : <Sun className={`${className} text-indigo-400`} />;
  if (code >= 1 && code <= 3) return <CloudSun className={`${className} text-amber-600/80`} />;
  if (code === 45 || code === 48) return <CloudFog className={`${className} text-slate-400`} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={`${className} text-sky-500`} />;
  if (code >= 61 && code <= 67) return <CloudRain className={`${className} text-blue-600`} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={`${className} text-sky-300`} />;
  if (code >= 80 && code <= 82) return <CloudRain className={`${className} text-blue-700`} />;
  if (code >= 95) return <CloudLightning className={`${className} text-purple-600`} />;
  return <Cloud className={className} />;
}

export default function WeatherForecastPage() {
  const { settings, tz } = useSettings();
  const now = useNow(60_000);
  const latestTelemetry = useLatestReading().data ?? null;

  const hasCoords = settings.latitude !== null && settings.longitude !== null;

  const weatherQuery = useQuery<WeatherForecast>({
    queryKey: ["weather-full", settings.latitude, settings.longitude],
    enabled: hasCoords,
    queryFn: async () => {
      const res = await fetch(`/api/weather?lat=${settings.latitude}&lon=${settings.longitude}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || "Failed to load meteorological data");
      }
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  const weather = weatherQuery.data ?? null;
  const rain = useMemo(() => (weather ? rainOutlook(weather, now) : null), [weather, now]);

  // Next 48 hours for chart
  const hourlyData = useMemo(() => {
    if (!weather?.hourly?.length) return [];
    const cutoff = now - 3600_000;
    const limit = now + 48 * 3600_000;
    return weather.hourly
      .filter((h) => h.t >= cutoff && h.t <= limit)
      .map((h) => ({
        t: h.t,
        temp: h.temperature,
        humidity: h.humidity,
        precipProb: h.precipitationProbability,
        precipMm: h.precipitation,
      }));
  }, [weather, now]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Meteorological Forecasting"
        title="Weather & Precipitation Outlook"
        description="Atmospheric conditions and precipitation forecasts powered by Open-Meteo meteorological models to inform farm irrigation schedules."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => weatherQuery.refetch()}
              disabled={weatherQuery.isFetching || !hasCoords}
              className="bg-card shadow-xs"
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${weatherQuery.isFetching ? "animate-spin text-forest" : ""}`}
              />
              Update Weather
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings">
                <MapPin className="size-3.5 mr-1.5" />
                Change Coordinates
              </Link>
            </Button>
          </div>
        }
      />

      {/* Critical rain forecast provenance note */}
      <div className="mb-6 panel p-4 bg-[#f8f6ee] border-[#dfd7c2] text-xs leading-relaxed text-muted-foreground flex items-start gap-3">
        <Info className="size-4 text-forest shrink-0 mt-0.5" />
        <div>
          <strong className="text-ink font-medium">Provider Disclaimer:</strong>{" "}
          Precipitation probabilities and expected rain quantities are supplied directly by Open-Meteo&apos;s meteorological forecasting model based on your configured GPS coordinates ({settings.latitude ?? "—"}, {settings.longitude ?? "—"}). They are neither an LLM conjecture nor a microclimate guarantee at your specific plant bed. Use this data as guidance, not an automated switch.
        </div>
      </div>

      {!hasCoords ? (
        <EmptyState
          title="Farm Location Not Configured"
          icon={<MapPin className="size-6 text-forest" />}
          action={
            <Button asChild className="bg-forest text-ivory hover:bg-forest/90">
              <Link href="/settings">Set Latitude & Longitude</Link>
            </Button>
          }
        >
          To display hyper-local temperature, humidity, and rain forecasts, configure your farm&apos;s geographic coordinates in Settings (or search by city name).
        </EmptyState>
      ) : weatherQuery.isError ? (
        <ErrorState
          error={weatherQuery.error}
          onRetry={() => weatherQuery.refetch()}
          title="Could not load weather forecast"
        />
      ) : weatherQuery.isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel p-5">
                <LoadingBlock lines={3} />
              </div>
            ))}
          </div>
        </div>
      ) : weather ? (
        <div className="space-y-8">
          {/* Current atmospheric snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Condition */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <span className="eyebrow flex items-center justify-between">
                  <span>Current Sky</span>
                  <WeatherIcon
                    code={weather.current?.weatherCode ?? null}
                    isDay={weather.current?.isDay}
                    className="size-4"
                  />
                </span>
                <p className="mt-3 text-2xl font-medium text-ink font-heading">
                  {weatherCodeLabel(weather.current?.weatherCode ?? null)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Apparent feel: {weather.current?.apparentTemperature?.toFixed(1) ?? "—"}°C
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                Station Timezone: <span className="font-mono text-ink">{weather.timezone}</span>
              </div>
            </div>

            {/* Outside Temp */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <span className="eyebrow flex items-center gap-1.5">
                  <Thermometer className="size-3.5 text-[#b4552d]" />
                  Ambient Outside
                </span>
                <p className="display-num mt-2 text-4xl font-normal text-ink">
                  {weather.current?.temperature?.toFixed(1) ?? "—"}
                  <span className="text-xl text-muted-foreground ml-1">°C</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Farm DHT11:{" "}
                  <strong className="text-ink">
                    {latestTelemetry?.temperature !== null && latestTelemetry?.temperature !== undefined
                      ? `${latestTelemetry.temperature.toFixed(1)}°C`
                      : "No reading"}
                  </strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                Elevation: {weather.elevation ?? "—"} m MSL
              </div>
            </div>

            {/* Outside Humidity & Wind */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <span className="eyebrow flex items-center gap-1.5">
                  <Wind className="size-3.5 text-[#4d6e86]" />
                  Humidity & Wind
                </span>
                <p className="display-num mt-2 text-4xl font-normal text-ink">
                  {weather.current?.humidity ?? "—"}
                  <span className="text-xl text-muted-foreground ml-1">%</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Wind Speed: <strong className="text-ink">{weather.current?.windSpeedKmh ?? "—"} km/h</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                Farm DHT11 Air: {latestTelemetry?.humidity ?? "—"}%
              </div>
            </div>

            {/* 24-Hour Rain Probability */}
            <div className="panel p-5 flex flex-col justify-between">
              <div>
                <span className="eyebrow flex items-center gap-1.5">
                  <Droplets className="size-3.5 text-blue-600" />
                  Next 24h Rain Risk
                </span>
                <p className="display-num mt-2 text-4xl font-normal text-ink">
                  {rain?.maxProbability !== null && rain?.maxProbability !== undefined
                    ? `${rain.maxProbability}%`
                    : "0%"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expected accumulation:{" "}
                  <strong className="text-ink">{rain?.totalMm?.toFixed(1) ?? "0.0"} mm</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 text-xs">
                {rain?.firstWetHour ? (
                  <span className="text-blue-700 font-medium">
                    Showers expected around {formatTime(rain.firstWetHour, tz)}
                  </span>
                ) : (
                  <span className="text-forest font-medium">No significant rainfall expected</span>
                )}
              </div>
            </div>
          </div>

          {/* Irrigation Recommendation Combined Card */}
          <div className="panel p-5 bg-[#f6f8ef] border-[#c9d6b0]">
            <h3 className="font-medium text-ink text-base mb-2 flex items-center gap-2">
              <Droplets className="size-4 text-forest" />
              Agronomic Irrigation Guidance
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {rain && ((rain.maxProbability ?? 0) >= 60 || (rain.totalMm ?? 0) >= 2.0) ? (
                <span>
                  <strong>Rain forecasted:</strong> Open-Meteo models predict up to{" "}
                  <strong>{rain.maxProbability}% chance</strong> of precipitation with ~{rain.totalMm?.toFixed(1)} mm volume in the next 24 hours. If your plants are situated outdoors or in an unroofed bed, consider delaying manual or supplemental pump runs to save water and prevent soil saturation.
                </span>
              ) : (
                <span>
                  <strong>Dry outlook:</strong> Low probability of precipitation (&lt;40%) over the next 24 hours. Irrigation should be governed purely by soil moisture thresholds ({settings.plant1Name}: {settings.plant1DryBelow}%, {settings.plant2Name}: {settings.plant2DryBelow}%).
                </span>
              )}
            </p>
          </div>

          {/* Hourly 48-Hour Weather Trajectory */}
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-medium text-ink text-base">
                  48-Hour Hourly Weather Trajectory
                </h3>
                <p className="text-xs text-muted-foreground">
                  Temperature, relative humidity, and precipitation probability forecast.
                </p>
              </div>
              <ChartLegend
                items={[
                  { label: "Precipitation Probability (%)", color: "#3b82f6", dashed: true },
                  { label: "Temperature (°C)", color: "#b4552d" },
                  { label: "Relative Humidity (%)", color: "#4d6e86" },
                ]}
              />
            </div>

            <TimeSeriesChart
              data={hourlyData}
              tz={tz}
              height={300}
              leftUnit="%"
              rightUnit="°C"
              ariaLabel="48-hour hourly weather forecast chart"
              series={[
                {
                  key: "precipProb",
                  label: "Precipitation Probability",
                  color: "#3b82f6",
                  unit: "%",
                  decimals: 0,
                  dashed: true,
                },
                {
                  key: "humidity",
                  label: "Relative Humidity",
                  color: "#4d6e86",
                  unit: "%",
                  decimals: 0,
                },
                {
                  key: "temp",
                  label: "Temperature",
                  color: "#b4552d",
                  unit: "°C",
                  decimals: 1,
                  yAxisId: "right",
                },
              ]}
            />
          </div>

          {/* 7-Day Daily Weather Cards */}
          <Section
            title="7-Day Synoptic Outlook"
            description="Daily high/low temperatures, sunrise/sunset, and expected precipitation sums."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {weather.daily.map((d, i) => (
                <div key={d.t} className="panel p-3.5 flex flex-col justify-between text-center bg-card/70">
                  <div>
                    <span className="text-xs font-semibold text-ink block">
                      {i === 0 ? "Today" : formatDay(d.t, tz)}
                    </span>
                    <span className="text-[0.68rem] text-muted-foreground block mb-2">
                      {formatDateTime(d.t, tz).split(",")[0]}
                    </span>
                    <WeatherIcon
                      code={d.weatherCode}
                      className="size-7 mx-auto my-2"
                    />
                    <span className="text-xs text-muted-foreground line-clamp-1 mb-2">
                      {weatherCodeLabel(d.weatherCode)}
                    </span>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between text-ink">
                      <span className="text-muted-foreground">High:</span>
                      <strong className="font-mono">{d.temperatureMax?.toFixed(0)}°C</strong>
                    </div>
                    <div className="flex justify-between text-ink">
                      <span className="text-muted-foreground">Low:</span>
                      <span className="font-mono">{d.temperatureMin?.toFixed(0)}°C</span>
                    </div>
                    <div className="flex justify-between text-blue-700 font-medium">
                      <span>Rain:</span>
                      <span>{d.precipitationProbabilityMax ?? 0}%</span>
                    </div>
                    {d.precipitationSum !== null && d.precipitationSum > 0 && (
                      <div className="flex justify-between text-blue-600 text-[0.7rem]">
                        <span>Volume:</span>
                        <span>{d.precipitationSum.toFixed(1)} mm</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      ) : null}
    </AppShell>
  );
}
