import type { Reading } from "@/lib/types";

export type StateKey = "pump" | "valve1" | "valve2";

export interface StateInterval {
  key: StateKey;
  /** First reading at which the state was ON. */
  start: number;
  /** Last reading that was still ON (lower bound of the true ON end). */
  lastOn: number;
  /**
   * First reading that was OFF after the interval (upper bound of the true ON
   * end), or null if the state is still ON in the newest reading.
   */
  end: number | null;
  /** True if two consecutive ON readings were separated by more than the gap threshold. */
  hasGap: boolean;
}

/**
 * Build ON intervals from a boolean state column.
 *
 * Readings are samples, not events: the true switch times lie between samples.
 * We therefore keep both a lower bound (`lastOn - start`) and upper bound
 * (`end - start`) on the duration instead of pretending to know it exactly.
 * A reading with a null state ends nothing and starts nothing (unknown).
 */
export function stateIntervals(readings: Reading[], key: StateKey, gapMs: number): StateInterval[] {
  const out: StateInterval[] = [];
  let cur: StateInterval | null = null;
  let lastT = 0;
  for (const r of readings) {
    const v = r[key];
    if (v === true) {
      if (!cur) {
        cur = { key, start: r.t, lastOn: r.t, end: null, hasGap: false };
      } else {
        if (r.t - lastT > gapMs) cur.hasGap = true;
        cur.lastOn = r.t;
      }
      lastT = r.t;
    } else if (v === false && cur) {
      cur.end = r.t;
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function intervalDurationMs(i: StateInterval, now: number): { min: number; max: number } {
  return { min: i.lastOn - i.start, max: (i.end ?? now) - i.start };
}

export interface MoistureResponse {
  plant: 1 | 2;
  /** Last valid moisture at or before the start of the command. */
  before: number | null;
  /** Highest moisture in [start, end + window]. */
  peak: number | null;
  delta: number | null;
  /** True when delta >= noise threshold. This is an OBSERVATION, not proof of water flow. */
  rose: boolean;
}

export interface IrrigationSession {
  interval: StateInterval;
  valve1Seen: boolean;
  valve2Seen: boolean;
  responses: MoistureResponse[];
  ongoing: boolean;
}

export const RESPONSE_WINDOW_MS = 30 * 60_000;
export const MOISTURE_RISE_NOISE = 3; // percentage points

/**
 * Derive pump command sessions and the moisture change observed afterwards.
 *
 * IMPORTANT: the database stores relay *commands* (pump_on / valve_x_on). A
 * moisture rise after a command is consistent with watering but a missing rise
 * does not prove failure and a rise does not prove flow; both can also be
 * caused by rain, sensor noise or manual watering.
 */
export function deriveSessions(readings: Reading[], gapMs: number): IrrigationSession[] {
  const intervals = stateIntervals(readings, "pump", gapMs);
  return intervals.map((interval) => {
    const endBound = interval.end ?? interval.lastOn;
    let valve1Seen = false;
    let valve2Seen = false;
    for (const r of readings) {
      if (r.t < interval.start) continue;
      if (r.t > endBound) break;
      if (r.valve1) valve1Seen = true;
      if (r.valve2) valve2Seen = true;
    }
    const responses = ([1, 2] as const).map((plant): MoistureResponse => {
      const key = plant === 1 ? "soil1" : "soil2";
      let before: number | null = null;
      let peak: number | null = null;
      for (const r of readings) {
        const v = r[key];
        if (v === null) continue;
        if (r.t <= interval.start) before = v;
        else if (r.t <= endBound + RESPONSE_WINDOW_MS) peak = peak === null ? v : Math.max(peak, v);
        else break;
      }
      const delta = before !== null && peak !== null ? peak - before : null;
      return { plant, before, peak, delta, rose: delta !== null && delta >= MOISTURE_RISE_NOISE };
    });
    return { interval, valve1Seen, valve2Seen, responses, ongoing: interval.end === null };
  });
}

export function totalOnMs(intervals: StateInterval[], now: number): { min: number; max: number } {
  return intervals.reduce(
    (acc, i) => {
      const d = intervalDurationMs(i, now);
      return { min: acc.min + d.min, max: acc.max + d.max };
    },
    { min: 0, max: 0 },
  );
}
