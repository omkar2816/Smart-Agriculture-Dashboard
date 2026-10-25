import { deriveSessions } from "@/lib/analytics/irrigation";
import { detectAnomalies } from "@/lib/analytics/anomalies";
import { gapThresholdMs, slopePerHour } from "@/lib/analytics/stats";
import { latestValue } from "@/lib/data/normalize";
import type { MetricForecast } from "@/lib/forecast/engine";
import type { Settings } from "@/lib/settings/schema";
import type { Reading } from "@/lib/types";
import type { RainOutlook } from "@/lib/weather/openMeteo";

export type InsightSeverity = "good" | "info" | "watch" | "action";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Always "rules": derived deterministically from recorded data, thresholds and weather. */
  source: "rules";
}

export type IrrigationStatus = "ok" | "watch" | "soon" | "now" | "unknown";

export interface IrrigationOutlook {
  plant: 1 | 2;
  status: IrrigationStatus;
  currentMoisture: number | null;
  threshold: number;
  /** Hours until the central forecast crosses the threshold, if it does within 24 h. */
  hoursToThreshold: number | null;
  /** Hours until the pessimistic (lower) bound crosses the threshold. */
  hoursToThresholdLower: number | null;
  summary: string;
  rainNote: string | null;
}

const fmt = (n: number, d = 0) => n.toFixed(d);

/**
 * Combine the soil-moisture forecast, configured thresholds and the provider's
 * rain forecast into an ADVISORY irrigation outlook. It never controls hardware.
 */
export function irrigationOutlook(
  plant: 1 | 2,
  readings: Reading[],
  forecast: MetricForecast | null,
  settings: Settings,
  rain: RainOutlook | null,
): IrrigationOutlook {
  const threshold = plant === 1 ? settings.plant1DryBelow : settings.plant2DryBelow;
  const key = plant === 1 ? "soil1" : "soil2";
  const current = latestValue(readings, key)?.value ?? null;
  const name = plant === 1 ? settings.plant1Name : settings.plant2Name;

  const rainLikely = !!rain && ((rain.maxProbability ?? 0) >= 60 || (rain.totalMm ?? 0) >= 2);
  const rainNote = rainLikely
    ? `Open-Meteo forecasts ${rain!.maxProbability !== null ? `up to ${fmt(rain!.maxProbability)}% precipitation probability` : "precipitation"}${rain!.totalMm !== null ? ` and about ${fmt(rain!.totalMm, 1)} mm` : ""} in the next 24 h. Check whether this plant is sheltered before changing irrigation timing; the forecast is not a guarantee of rain at the farm.`
    : null;

  if (current === null) {
    return { plant, status: "unknown", currentMoisture: null, threshold, hoursToThreshold: null, hoursToThresholdLower: null, summary: `No valid moisture reading for ${name} yet.`, rainNote };
  }
  if (current < threshold) {
    return {
      plant,
      status: "now",
      currentMoisture: current,
      threshold,
      hoursToThreshold: 0,
      hoursToThresholdLower: 0,
      summary: `${name} is at ${fmt(current)}%, below your dry threshold of ${fmt(threshold)}%.`,
      rainNote,
    };
  }

  let hCentral: number | null = null;
  let hLower: number | null = null;
  if (forecast?.status === "ok") {
    for (const p of forecast.path) {
      if (hCentral === null && p.value < threshold) hCentral = p.horizonHours;
      if (hLower === null && p.lower !== null && p.lower < threshold) hLower = p.horizonHours;
    }
  }

  if (hCentral !== null) {
    return {
      plant,
      status: hCentral <= 6 ? "soon" : "watch",
      currentMoisture: current,
      threshold,
      hoursToThreshold: hCentral,
      hoursToThresholdLower: hLower,
      summary: `${name} is at ${fmt(current)}%. The statistical forecast crosses ${fmt(threshold)}% in about ${hCentral} h, assuming no watering or rain.`,
      rainNote,
    };
  }
  if (hLower !== null) {
    return {
      plant,
      status: "watch",
      currentMoisture: current,
      threshold,
      hoursToThreshold: null,
      hoursToThresholdLower: hLower,
      summary: `${name} is at ${fmt(current)}%. The central forecast stays above ${fmt(threshold)}%, but the lower end of the uncertainty range reaches it in about ${hLower} h.`,
      rainNote,
    };
  }
  return {
    plant,
    status: forecast?.status === "ok" ? "ok" : "unknown",
    currentMoisture: current,
    threshold,
    hoursToThreshold: null,
    hoursToThresholdLower: null,
    summary:
      forecast?.status === "ok"
        ? `${name} is at ${fmt(current)}% and is not forecast to reach ${fmt(threshold)}% within 24 h (no irrigation/rain assumed).`
        : `${name} is at ${fmt(current)}% (above the ${fmt(threshold)}% threshold). Not enough history for a forecast yet.`,
    rainNote,
  };
}

/** Deterministic, explainable recommendations from real data. */
export function buildInsights(args: {
  readings: Reading[];
  settings: Settings;
  rain: RainOutlook | null;
  now?: number;
}): Insight[] {
  const { readings, settings, rain } = args;
  const now = args.now ?? Date.now();
  const out: Insight[] = [];
  if (!readings.length) return out;
  const gap = gapThresholdMs(readings);
  const newest = readings[readings.length - 1];

  for (const plant of [1, 2] as const) {
    const key = plant === 1 ? "soil1" : "soil2";
    const name = plant === 1 ? settings.plant1Name : settings.plant2Name;
    const threshold = plant === 1 ? settings.plant1DryBelow : settings.plant2DryBelow;
    const cur = latestValue(readings, key);
    if (!cur) continue;

    if (cur.value < threshold) {
      out.push({
        id: `dry-${plant}`,
        severity: "action",
        title: `${name} is below the dry threshold`,
        detail: `Latest moisture is ${fmt(cur.value)}% (threshold ${fmt(threshold)}%). If automatic irrigation is enabled on the ESP32 it should respond; this dashboard cannot confirm that water was delivered.`,
        source: "rules",
      });
    } else if (cur.value > settings.wetAbove) {
      out.push({
        id: `wet-${plant}`,
        severity: "info",
        title: `${name} soil is very wet`,
        detail: `Latest moisture is ${fmt(cur.value)}%, above your saturation level of ${fmt(settings.wetAbove)}%. Irrigation is unlikely to be needed.`,
        source: "rules",
      });
    }

    const slope = slopePerHour(readings, key, 6 * 3_600_000);
    if (slope && slope.n >= 4 && slope.r2 >= 0.5 && slope.slope <= -0.5) {
      const hrs = cur.value > threshold ? (cur.value - threshold) / -slope.slope : 0;
      out.push({
        id: `falling-${plant}`,
        severity: hrs > 0 && hrs <= 12 ? "watch" : "info",
        title: `${name} moisture is decreasing steadily`,
        detail: `Falling about ${fmt(-slope.slope, 1)} percentage points per hour over the last 6 h (fit R² ${fmt(slope.r2, 2)}).${hrs > 0 && hrs <= 24 ? ` At that rate it would reach ${fmt(threshold)}% in roughly ${fmt(hrs, 0)} h; a straight-line estimate that ignores watering and rain.` : ""}`,
        source: "rules",
      });
    }
  }

  // Moisture response after a recent pump command
  const sessions = deriveSessions(readings, gap);
  const lastSession = sessions[sessions.length - 1];
  if (lastSession && !lastSession.ongoing) {
    const endT = lastSession.interval.end ?? lastSession.interval.lastOn;
    if (now - endT <= 3 * 3_600_000) {
      const risers = lastSession.responses.filter((r) => r.rose);
      if (risers.length) {
        out.push({
          id: "rise-after-pump",
          severity: "good",
          title: "Soil moisture rose after the last pump command",
          detail: risers
            .map((r) => `${r.plant === 1 ? settings.plant1Name : settings.plant2Name}: ${fmt(r.before ?? 0)}% → ${fmt(r.peak ?? 0)}% (+${fmt(r.delta ?? 0)} points)`)
            .join("; ")
            .concat(". This is consistent with watering but the database only records relay commands, not water flow."),
          source: "rules",
        });
      } else {
        out.push({
          id: "no-rise-after-pump",
          severity: "watch",
          title: "No clear moisture rise after the last pump command",
          detail: `The pump command ended ${fmt((now - endT) / 60000)} min ago and neither moisture sensor rose by ${3} points within 30 min. The run may have been short, the sensors slow to respond, or water may not have reached the soil. Inspect the hardware if this repeats.`,
          source: "rules",
        });
      }
    }
  }
  if (newest.pump === true) {
    out.push({
      id: "pump-on",
      severity: "info",
      title: "Pump command is ON in the latest reading",
      detail: "This is the recorded relay command state, not independent proof that water is flowing.",
      source: "rules",
    });
  }

  for (const a of detectAnomalies(readings, gap).slice(0, 4)) {
    out.push({ id: `anomaly-${a.kind}-${a.metric}`, severity: a.severity === "watch" ? "watch" : "info", title: "Sensor behaviour to check", detail: a.message, source: "rules" });
  }

  if (rain && ((rain.maxProbability ?? 0) >= 60 || (rain.totalMm ?? 0) >= 2)) {
    out.push({
      id: "rain-forecast",
      severity: "info",
      title: "Rain is forecast; irrigation timing may need review",
      detail: `Open-Meteo forecast for the next 24 h: ${rain.maxProbability !== null ? `precipitation probability up to ${fmt(rain.maxProbability)}%` : "precipitation probability not supplied"}${rain.totalMm !== null ? `, about ${fmt(rain.totalMm, 1)} mm expected` : ""}. This is a weather-provider forecast, not a guarantee of rain at your farm.`,
      source: "rules",
    });
  }

  const order: Record<InsightSeverity, number> = { action: 0, watch: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
