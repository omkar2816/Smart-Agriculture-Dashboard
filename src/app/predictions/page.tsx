"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Droplets,
  HelpCircle,
  Info,
  RefreshCw,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader, Section } from "@/components/dashboard/page-header";
import { EmptyState, ErrorState, LoadingBlock, ChartSkeleton } from "@/components/dashboard/states";
import { TimeSeriesChart, ChartLegend } from "@/components/dashboard/time-series-chart";
import { Chip, RelayState } from "@/components/dashboard/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNow, useRecentReadings } from "@/lib/data/hooks";
import { useSettings } from "@/lib/settings/context";
import { computeForecasts } from "@/lib/ai/payload";
import type { MetricForecast, ForecastPoint } from "@/lib/forecast/engine";
import { formatDateTime, formatFullDateTime, formatAge } from "@/lib/time";
import type { NumericMetric } from "@/lib/types";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { AiAnalysis } from "@/lib/ai/schema";
import type { WeatherForecast } from "@/lib/weather/openMeteo";

interface AiApiResponse {
  analysis: AiAnalysis;
  warnings: string[];
  meta: {
    provider: string;
    model: string;
    generatedAt: number;
    dataUntil: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    weatherIncluded: boolean;
  };
  cached?: boolean;
}

export default function PredictionsPage() {
  const { settings, tz } = useSettings();
  const now = useNow(60_000);

  const { data: readings = [], isLoading, error, refetch } = useRecentReadings();

  // Weather query for context
  const hasCoords = settings.latitude !== null && settings.longitude !== null;
  const weatherQuery = useQuery<WeatherForecast>({
    queryKey: ["weather", settings.latitude, settings.longitude],
    enabled: hasCoords,
    queryFn: async () => {
      const res = await fetch(`/api/weather?lat=${settings.latitude}&lon=${settings.longitude}`);
      if (!res.ok) throw new Error("Weather unavailable");
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  // Check if AI is enabled on the server
  const aiStatusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await fetch("/api/ai/analyze");
      if (!res.ok) return { enabled: false, provider: "none", model: null };
      return res.json();
    },
    staleTime: 60 * 60_000,
  });

  // Calculate transparent statistical forecasts for all 4 key metrics
  const forecasts = useMemo(() => {
    if (!readings.length) return null;
    return computeForecasts(readings, now);
  }, [readings, now]);

  const [activeMetric, setActiveMetric] = useState<NumericMetric>("soil1");

  // AI Interpretation mutation
  const [aiResult, setAiResult] = useState<AiApiResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const aiMutation = useMutation({
    mutationFn: async (force: boolean) => {
      setAiError(null);
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force,
          latitude: settings.latitude,
          longitude: settings.longitude,
          plant1Name: settings.plant1Name,
          plant2Name: settings.plant2Name,
          plant1DryBelow: settings.plant1DryBelow,
          plant2DryBelow: settings.plant2DryBelow,
          wetAbove: settings.wetAbove,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Failed to generate AI analysis");
      }
      return json as AiApiResponse;
    },
    onSuccess: (data) => {
      setAiResult(data);
    },
    onError: (err) => {
      setAiError(err instanceof Error ? err.message : "Error contacting AI service");
    },
  });

  const selectedForecast: MetricForecast | null = forecasts ? forecasts[activeMetric] : null;

  // Build combined history + forecast chart data
  const combinedChartData = useMemo(() => {
    if (!selectedForecast || selectedForecast.status !== "ok") return [];
    const historyPoints = selectedForecast.history.map((h) => ({
      t: h.t,
      actual: h.v,
      forecast: null as number | null,
      band: null as [number, number] | null,
    }));

    const lastObs = historyPoints[historyPoints.length - 1];
    const forecastPoints = selectedForecast.path.map((p) => ({
      t: p.targetTime,
      actual: null as number | null,
      forecast: p.value,
      band: p.lower !== null && p.upper !== null ? ([p.lower, p.upper] as [number, number]) : null,
    }));

    // Bridge the last historical point with the first forecast point
    if (lastObs && forecastPoints.length) {
      forecastPoints.unshift({
        t: lastObs.t,
        actual: null,
        forecast: lastObs.actual,
        band: null,
      });
    }

    return [...historyPoints, ...forecastPoints];
  }, [selectedForecast]);

  const forecastStartT = selectedForecast?.basedOnUntil ?? null;
  const forecastEndT = selectedForecast?.path.at(-1)?.targetTime ?? null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Predictive Agronomy & AI"
        title="AI Trends & Forecasting"
        description="Transparent mathematical time-series modeling (ETS & damped Holt baselines) paired with server-side LLM explanatory reasoning."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="bg-card shadow-xs"
            >
              <RefreshCw className="size-3.5 mr-1.5" />
              Recompute Models
            </Button>
          </div>
        }
      />

      {/* Critical methodology notice */}
      <div className="mb-6 panel p-4 bg-[#f8f6ee] border-[#dfd7c2] text-xs leading-relaxed text-muted-foreground flex items-start gap-3">
        <BrainCircuit className="size-4 text-forest shrink-0 mt-0.5" />
        <div>
          <strong className="text-ink font-medium">Methodology & Rigor:</strong>{" "}
          Numerical trajectories (6, 12, 24 h) are generated by deterministic time-series algorithms (Damped-trend exponential smoothing, 24h seasonal decomposition, and persistence baselines) trained on your real historical sensor readings. The LLM (Gemini / OpenAI) is used exclusively to explain trends, detect agronomic anomalies, and summarize advisory actions—it never fabricates synthetic numerical data.
        </div>
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={refetch}
          className="mb-8"
          title="Could not load sensor history for forecasting"
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-6">
          <ChartSkeleton height={320} />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="panel p-4 h-24 bg-muted/60 animate-pulse" />
            ))}
          </div>
        </div>
      ) : readings.length < 12 ? (
        <EmptyState
          title="Accumulating Training Data"
          icon={<Sparkles className="size-6 text-forest" />}
        >
          Numerical time-series forecasting requires at least 12 consecutive hours of valid telemetry to establish baselines without severe overfitting. You currently have{" "}
          <strong>{readings.length}</strong> recorded samples. Keep your ESP32 active and forecasts will unlock automatically.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Metric Selector Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase mr-1">
                Forecast Target:
              </span>
              <Button
                variant={activeMetric === "soil1" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveMetric("soil1")}
                className={activeMetric === "soil1" ? "bg-forest text-ivory" : "bg-card text-xs"}
              >
                <Droplets className="size-3.5 mr-1 text-[#2c6a47]" />
                {settings.plant1Name} Soil
              </Button>
              <Button
                variant={activeMetric === "soil2" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveMetric("soil2")}
                className={activeMetric === "soil2" ? "bg-forest text-ivory" : "bg-card text-xs"}
              >
                <Droplets className="size-3.5 mr-1 text-[#c0792b]" />
                {settings.plant2Name} Soil
              </Button>
              <Button
                variant={activeMetric === "temperature" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveMetric("temperature")}
                className={activeMetric === "temperature" ? "bg-forest text-ivory" : "bg-card text-xs"}
              >
                <Thermometer className="size-3.5 mr-1 text-[#b4552d]" />
                Temperature
              </Button>
              <Button
                variant={activeMetric === "humidity" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveMetric("humidity")}
                className={activeMetric === "humidity" ? "bg-forest text-ivory" : "bg-card text-xs"}
              >
                <Wind className="size-3.5 mr-1 text-[#4d6e86]" />
                Humidity
              </Button>
            </div>
          </div>

          {/* Active Metric Forecast Display */}
          {selectedForecast?.status === "ok" ? (
            <div className="space-y-6">
              {/* Headline Horizon Cards: 6h, 12h, 24h */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedForecast.points.map((pt, idx) => {
                  const sel = selectedForecast.selections[idx];
                  return (
                    <div key={pt.horizonHours} className="panel p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="eyebrow">Horizon: +{pt.horizonHours} Hours</span>
                          <Chip tone={pt.horizonHours <= 12 ? "info" : "neutral"}>
                            {formatDateTime(pt.targetTime, tz)}
                          </Chip>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="display-num text-4xl font-normal text-ink">
                            {pt.value.toFixed(1)}
                            <span className="text-xl text-muted-foreground ml-1">
                              {selectedForecast.unit}
                            </span>
                          </span>
                        </div>
                        {pt.lower !== null && pt.upper !== null ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            80% empirical interval:{" "}
                            <span className="font-mono text-ink font-medium">
                              {pt.lower.toFixed(1)} – {pt.upper.toFixed(1)} {selectedForecast.unit}
                            </span>
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground italic">
                            Interval not statistically justified
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/60 text-[0.7rem] text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>Selected Algorithm:</span>
                          <span className="font-medium text-ink">{sel.model}</span>
                        </div>
                        {sel.skill !== null && (
                          <div className="flex justify-between">
                            <span>Skill vs Persistence:</span>
                            <span
                              className={`font-mono font-medium ${
                                sel.skill > 0 ? "text-forest" : "text-muted-foreground"
                              }`}
                            >
                              {sel.skill > 0 ? `+${(sel.skill * 100).toFixed(0)}%` : "0% (Baseline)"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Forecast + Historical Visualization Chart */}
              <div className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-medium text-ink text-base">
                      {selectedForecast.label} Trajectory (History + 24h Horizon)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Green/solid indicates measured historical readings; dashed line indicates the statistical model projection with an 80% uncertainty band.
                    </p>
                  </div>
                  <ChartLegend
                    items={[
                      { label: "Measured Readings", color: "#2c6a47" },
                      { label: "Predicted Path", color: "#b8862a", dashed: true },
                      { label: "80% Confidence Band", color: "#e7ecd2" },
                    ]}
                  />
                </div>

                <TimeSeriesChart
                  data={combinedChartData}
                  tz={tz}
                  height={320}
                  leftUnit={selectedForecast.unit}
                  forecastFrom={forecastStartT}
                  forecastTo={forecastEndT}
                  ariaLabel="Forecast trajectory chart"
                  bands={[
                    {
                      key: "band",
                      color: "#b8862a",
                      label: "80% Confidence Interval",
                    },
                  ]}
                  series={[
                    {
                      key: "actual",
                      label: "Measured Telemetry",
                      color: "#2c6a47",
                      unit: selectedForecast.unit,
                      decimals: 1,
                    },
                    {
                      key: "forecast",
                      label: "Predicted Baseline",
                      color: "#b8862a",
                      unit: selectedForecast.unit,
                      dashed: true,
                      dots: true,
                      decimals: 1,
                    },
                  ]}
                />

                <div className="mt-4 pt-3 border-t border-border/60">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Empirical Modeling Factors:
                  </h4>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    {selectedForecast.factors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel p-6 bg-muted/40 text-center">
              <AlertTriangle className="size-5 text-amber-600 mx-auto mb-2" />
              <h4 className="font-medium text-ink">Cannot Forecast {activeMetric}</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {selectedForecast?.reason || "Insufficient contiguous readings available for this specific sensor channel."}
              </p>
            </div>
          )}

          {/* AI Agronomy Explanation Section */}
          <Section
            title="AI Agronomy Analysis & Recommendation"
            description="Request a generative interpretation of your multi-sensor telemetry, weather forecasts, and irrigation safety factors."
          >
            <div className="panel p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/60">
                <div>
                  <h4 className="font-medium text-ink flex items-center gap-2">
                    <Sparkles className="size-4 text-forest" />
                    Intelligent Telemetry Interpretation
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Analyzes current readings, statistical horizons, and Open-Meteo rain forecasts to synthesize actionable recommendations.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {aiResult?.cached && (
                    <span className="text-[0.7rem] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      Using cached response ({formatAge(now - aiResult.meta.generatedAt)})
                    </span>
                  )}
                  <Button
                    onClick={() => aiMutation.mutate(true)}
                    disabled={aiMutation.isPending || aiStatusQuery.data?.enabled === false}
                    className="bg-forest text-ivory hover:bg-forest/90"
                    size="sm"
                  >
                    <Sparkles className={`size-3.5 mr-1.5 ${aiMutation.isPending ? "animate-spin" : ""}`} />
                    {aiMutation.isPending
                      ? "Generating Analysis..."
                      : aiResult
                      ? "Re-analyze Now"
                      : "Generate AI Insights"}
                  </Button>
                </div>
              </div>

              {aiStatusQuery.data?.enabled === false && (
                <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                  AI features are currently disabled:{" "}
                  <strong>{aiStatusQuery.data.disabledReason || "No API key configured."}</strong> Core monitoring, mathematical forecasting, and charts function completely independently.
                </div>
              )}

              {aiError && (
                <div className="p-4 rounded-lg bg-[#f8e9e0] border border-[#e4bfa8] text-xs text-[#8a3b1c]">
                  <strong>AI Generation Failed:</strong> {aiError}
                </div>
              )}

              {aiResult ? (
                <div className="space-y-6">
                  {/* Summary */}
                  <div>
                    <h5 className="eyebrow mb-2">Executive Farm Summary</h5>
                    <p className="text-sm leading-relaxed text-ink font-normal bg-card p-4 rounded-lg border border-border/70">
                      {aiResult.analysis.summary}
                    </p>
                  </div>

                  {/* Specific Insights */}
                  {aiResult.analysis.insights.length > 0 && (
                    <div>
                      <h5 className="eyebrow mb-2">Key Observations</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {aiResult.analysis.insights.map((ins, i) => (
                          <div key={i} className="p-3.5 rounded-lg border border-border bg-card/60">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-ink font-sans">
                                {ins.title}
                              </span>
                              <Chip
                                tone={
                                  ins.severity === "action"
                                    ? "action"
                                    : ins.severity === "watch"
                                    ? "watch"
                                    : "info"
                                }
                              >
                                {ins.severity}
                              </Chip>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {ins.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Irrigation Advice */}
                  {aiResult.analysis.irrigation.length > 0 && (
                    <div>
                      <h5 className="eyebrow mb-2">Advisory Irrigation Guidance</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {aiResult.analysis.irrigation.map((ir, i) => (
                          <div key={i} className="p-3.5 rounded-lg bg-[#f2f6ea] border border-[#c9d6b0]">
                            <span className="text-xs font-semibold text-forest uppercase tracking-wider block mb-1">
                              {ir.plant === 1 ? settings.plant1Name : settings.plant2Name} (Zone {ir.plant})
                            </span>
                            <p className="text-xs text-ink/90 leading-relaxed">
                              {ir.advice}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Caveats */}
                  {aiResult.analysis.caveats.length > 0 && (
                    <div>
                      <h5 className="eyebrow mb-2">Assumptions & Caveats</h5>
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                        {aiResult.analysis.caveats.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Grounding warnings if any */}
                  {aiResult.warnings.length > 0 && (
                    <div className="p-3 bg-[#fdf8e6] border border-[#e8d594] rounded text-xs text-[#7d5a12]">
                      {aiResult.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  )}

                  {/* Metadata footer */}
                  <div className="pt-3 border-t border-border/50 text-[0.7rem] text-muted-foreground flex flex-wrap justify-between items-center">
                    <span>
                      Provider: <strong className="text-ink">{aiResult.meta.provider}</strong> ({aiResult.meta.model}) | Tokens: In {aiResult.meta.inputTokens ?? "—"} / Out {aiResult.meta.outputTokens ?? "—"}
                    </span>
                    <span>
                      Advisory only · ESP32 automated irrigation controls remain autonomous
                    </span>
                  </div>
                </div>
              ) : !aiMutation.isPending ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
                  Click &ldquo;Generate AI Insights&rdquo; to send the current mathematical trends and weather data to the AI model for synthesized advice.
                </div>
              ) : null}
            </div>
          </Section>
        </div>
      )}
    </AppShell>
  );
}
