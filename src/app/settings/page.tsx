"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Globe,
  HelpCircle,
  KeyRound,
  MapPin,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader, Section } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Chip } from "@/components/dashboard/status";
import { useSettings } from "@/lib/settings/context";
import { checkSchema, type SchemaCheckResult } from "@/lib/data/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, publicEnv } from "@/lib/config";
import { useQuery } from "@tanstack/react-query";

interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
}

export default function SettingsPage() {
  const { settings, update, reset, tz } = useSettings();

  // Local form state
  const [form, setForm] = useState(() => ({ ...settings }));
  const [savedMessage, setSavedMessage] = useState(false);

  // Geocoding city search state
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([]);
  const [isSearchingGeo, setIsSearchingGeo] = useState(false);

  // Live Supabase Schema Check
  const [schemaChecking, setSchemaChecking] = useState(false);
  const [schemaResult, setSchemaResult] = useState<SchemaCheckResult | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    update(form);
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2500);
  };

  const handleReset = () => {
    if (confirm("Reset all settings to default values?")) {
      reset();
      setForm({ ...settings });
    }
  };

  const handleSearchCity = async () => {
    if (!geoQuery.trim() || geoQuery.length < 2) return;
    setIsSearchingGeo(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(geoQuery.trim())}`);
      if (res.ok) {
        const json = await res.json();
        setGeoResults(json.results ?? []);
      }
    } catch {
      setGeoResults([]);
    } finally {
      setIsSearchingGeo(false);
    }
  };

  const handleSelectCity = (c: GeocodeResult) => {
    setForm((prev) => ({
      ...prev,
      latitude: Math.round(c.latitude * 1000) / 1000,
      longitude: Math.round(c.longitude * 1000) / 1000,
      timezone: c.timezone || prev.timezone,
    }));
    setGeoResults([]);
    setGeoQuery(`${c.name}, ${c.country ?? ""}`);
  };

  const handleTestSchema = async () => {
    setSchemaChecking(true);
    setSchemaResult(null);
    try {
      const client = getSupabaseBrowserClient();
      const res = await checkSchema(client);
      setSchemaResult(res);
    } catch (e) {
      setSchemaResult({
        ok: false,
        messages: [e instanceof Error ? e.message : "Database connection failed."],
        rowVisible: null,
      });
    } finally {
      setSchemaChecking(false);
    }
  };

  // AI configuration inspection query
  const aiInfo = useQuery({
    queryKey: ["ai-info"],
    queryFn: async () => {
      const res = await fetch("/api/ai/analyze");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 60_000,
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="System Configuration"
        title="Settings & Integrations"
        description="Configure plant thresholds, meteorological farm coordinates, telemetry refresh intervals, and verify database schema compatibility."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="text-xs"
            >
              <RotateCcw className="size-3.5 mr-1" />
              Reset Defaults
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-forest text-ivory hover:bg-forest/90"
            >
              <Save className="size-3.5 mr-1.5" />
              Save Settings
            </Button>
          </div>
        }
      />

      {savedMessage && (
        <div className="mb-6 panel p-3.5 bg-[#e3ebd3] border-[#c9d6b0] text-xs text-[#2c5a3c] flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-4" />
          Settings saved successfully to browser storage.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Farm & Plant Zones Configuration */}
        <Section
          title="Agricultural Zones & Irrigation Thresholds"
          description="Name your zones and customize the soil moisture percentage thresholds that determine irrigation urgency."
        >
          <div className="panel p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="farmName" className="text-xs font-semibold uppercase text-muted-foreground">
                  Farm / Project Name
                </Label>
                <Input
                  id="farmName"
                  value={form.farmName}
                  onChange={(e) => setForm({ ...form, farmName: e.target.value })}
                  placeholder="e.g. Green Valley Hydroponics"
                  className="bg-card text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wetAbove" className="text-xs font-semibold uppercase text-muted-foreground">
                  Soil Saturation Level (%)
                </Label>
                <Input
                  id="wetAbove"
                  type="number"
                  min="0"
                  max="100"
                  value={form.wetAbove}
                  onChange={(e) => setForm({ ...form, wetAbove: Number(e.target.value) })}
                  className="bg-card text-sm font-mono"
                />
                <p className="text-[0.7rem] text-muted-foreground">
                  Moisture above this is deemed wet; irrigation avoided.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/60">
              {/* Plant 1 Zone */}
              <div className="p-4 rounded-lg border border-border bg-card/60 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-ink flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-forest" />
                    Zone 1 Channel (soil_1_moisture)
                  </h4>
                  <Chip tone="info">Valve 1</Chip>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="plant1Name" className="text-xs text-muted-foreground">
                      Crop / Plant 1 Label
                    </Label>
                    <Input
                      id="plant1Name"
                      value={form.plant1Name}
                      onChange={(e) => setForm({ ...form, plant1Name: e.target.value })}
                      placeholder="e.g. Tomatoes"
                      className="bg-card text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="plant1DryBelow" className="text-xs text-muted-foreground">
                      Dry Moisture Threshold (%)
                    </Label>
                    <Input
                      id="plant1DryBelow"
                      type="number"
                      min="0"
                      max="100"
                      value={form.plant1DryBelow}
                      onChange={(e) => setForm({ ...form, plant1DryBelow: Number(e.target.value) })}
                      className="bg-card text-sm font-mono mt-1"
                    />
                    <p className="text-[0.7rem] text-muted-foreground mt-1">
                      Readings below this trigger &ldquo;Needs Irrigation&rdquo; status.
                    </p>
                  </div>
                </div>
              </div>

              {/* Plant 2 Zone */}
              <div className="p-4 rounded-lg border border-border bg-card/60 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-ink flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#c0792b]" />
                    Zone 2 Channel (soil_2_moisture)
                  </h4>
                  <Chip tone="watch">Valve 2</Chip>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="plant2Name" className="text-xs text-muted-foreground">
                      Crop / Plant 2 Label
                    </Label>
                    <Input
                      id="plant2Name"
                      value={form.plant2Name}
                      onChange={(e) => setForm({ ...form, plant2Name: e.target.value })}
                      placeholder="e.g. Bell Peppers"
                      className="bg-card text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="plant2DryBelow" className="text-xs text-muted-foreground">
                      Dry Moisture Threshold (%)
                    </Label>
                    <Input
                      id="plant2DryBelow"
                      type="number"
                      min="0"
                      max="100"
                      value={form.plant2DryBelow}
                      onChange={(e) => setForm({ ...form, plant2DryBelow: Number(e.target.value) })}
                      className="bg-card text-sm font-mono mt-1"
                    />
                    <p className="text-[0.7rem] text-muted-foreground mt-1">
                      Readings below this trigger &ldquo;Needs Irrigation&rdquo; status.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Geographic Coordinates & Weather Location */}
        <Section
          title="Geographic Location & Open-Meteo Integration"
          description="Coordinates used to query real meteorological forecast endpoints. Search by city name or enter exact GPS coordinates."
        >
          <div className="panel p-6 space-y-6">
            {/* City search bar */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground block mb-1.5">
                City Search (Open-Meteo Geocoding)
              </Label>
              <div className="flex items-center gap-2 max-w-md">
                <Input
                  value={geoQuery}
                  onChange={(e) => setGeoQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchCity();
                    }
                  }}
                  placeholder="Enter city (e.g. Pune, Salinas, Almeria)..."
                  className="bg-card text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSearchCity}
                  disabled={isSearchingGeo}
                  className="bg-card text-xs"
                >
                  <Search className="size-3.5 mr-1" />
                  {isSearchingGeo ? "Searching..." : "Lookup"}
                </Button>
              </div>

              {geoResults.length > 0 && (
                <div className="mt-2 p-2 rounded-lg border border-border bg-card max-w-md divide-y divide-border/60 shadow-xs">
                  {geoResults.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectCity(c)}
                      className="w-full text-left py-2 px-2 hover:bg-muted/70 rounded text-xs flex justify-between items-center"
                    >
                      <span>
                        <strong className="text-ink">{c.name}</strong>, {c.admin1 ? `${c.admin1}, ` : ""}{c.country ?? ""}
                      </span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {c.latitude.toFixed(2)}, {c.longitude.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border/60">
              <div className="space-y-2">
                <Label htmlFor="latitude" className="text-xs text-muted-foreground">
                  Latitude (-90 to 90)
                </Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={form.latitude ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      latitude: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="e.g. 18.5204"
                  className="bg-card text-sm font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="longitude" className="text-xs text-muted-foreground">
                  Longitude (-180 to 180)
                </Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={form.longitude ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      longitude: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="e.g. 73.8567"
                  className="bg-card text-sm font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-xs text-muted-foreground">
                  Timezone Name (IANA)
                </Label>
                <Input
                  id="timezone"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  placeholder={`Default: ${tz}`}
                  className="bg-card text-sm font-mono"
                />
                <p className="text-[0.7rem] text-muted-foreground">
                  Leave blank to auto-detect browser timezone ({tz}).
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* Polling & Freshness Cadence */}
        <Section
          title="Telemetry Freshness & Polling Cadence"
          description="Adjust how frequently the dashboard queries Supabase and when hardware is flagged as stale or offline."
        >
          <div className="panel p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="refreshSeconds" className="text-xs font-semibold uppercase text-muted-foreground">
                  Dashboard Poll Interval (seconds)
                </Label>
                <Input
                  id="refreshSeconds"
                  type="number"
                  min="10"
                  max="600"
                  value={form.refreshSeconds}
                  onChange={(e) => setForm({ ...form, refreshSeconds: Number(e.target.value) })}
                  className="bg-card text-sm font-mono"
                />
                <p className="text-[0.7rem] text-muted-foreground">
                  Incremental fetch interval (10–600s). Default: 30s.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="staleAfterMinutes" className="text-xs font-semibold uppercase text-muted-foreground">
                  Stale Flag Threshold (minutes)
                </Label>
                <Input
                  id="staleAfterMinutes"
                  type="number"
                  min="1"
                  max="1440"
                  value={form.staleAfterMinutes}
                  onChange={(e) => setForm({ ...form, staleAfterMinutes: Number(e.target.value) })}
                  className="bg-card text-sm font-mono"
                />
                <p className="text-[0.7rem] text-muted-foreground">
                  Show &ldquo;Delayed&rdquo; badge if no row arrives in this window.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="offlineAfterMinutes" className="text-xs font-semibold uppercase text-muted-foreground">
                  Offline Threshold (minutes)
                </Label>
                <Input
                  id="offlineAfterMinutes"
                  type="number"
                  min="2"
                  max="10080"
                  value={form.offlineAfterMinutes}
                  onChange={(e) => setForm({ ...form, offlineAfterMinutes: Number(e.target.value) })}
                  className="bg-card text-sm font-mono"
                />
                <p className="text-[0.7rem] text-muted-foreground">
                  Flag as &ldquo;No recent data&rdquo; if telemetry halts.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </form>

      {/* Database Schema Verification Tool */}
      <div className="mt-8">
        <Section
          title="Telemetry Database Connection & Diagnostics"
          description="Verify database connectivity and telemetry data synchronization."
        >
          <div className="panel p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-ink flex items-center gap-2">
                  <Database className="size-4 text-forest" />
                  Telemetry Source: {isSupabaseConfigured() ? "Connected" : "Not Connected"}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifies that telemetry data streams can be retrieved without communication or permission errors.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestSchema}
                disabled={schemaChecking || !isSupabaseConfigured()}
                className="bg-card"
              >
                <RefreshCw className={`size-3.5 mr-1.5 ${schemaChecking ? "animate-spin" : ""}`} />
                {schemaChecking ? "Testing Connection..." : "Test Connection"}
              </Button>
            </div>

            {schemaResult && (
              <div
                className={`p-4 rounded-lg text-xs space-y-2 ${
                  schemaResult.ok
                    ? "bg-[#e3ebd3] border border-[#c9d6b0] text-[#2c5a3c]"
                    : "bg-[#f8e9e0] border border-[#e4bfa8] text-[#8a3b1c]"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {schemaResult.ok ? (
                    <>
                      <CheckCircle2 className="size-4" />
                      Connection & Telemetry Verified Successfully
                    </>
                  ) : (
                    <>
                      <XCircle className="size-4" />
                      Connection Issue Detected
                    </>
                  )}
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  {schemaResult.messages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                {schemaResult.ok && schemaResult.rowVisible === false && (
                  <div className="mt-3 p-3 rounded border border-amber-300 bg-amber-50/70 text-amber-900 text-xs space-y-1.5">
                    <p className="font-semibold">Enable Dashboard Public Read Access in Supabase:</p>
                    <p>If you have rows in the table but they do not appear, execute this in your <strong>Supabase SQL Editor</strong>:</p>
                    <pre className="p-2 bg-amber-100 rounded font-mono text-[0.72rem] overflow-x-auto select-all">
{`ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow dashboard read access"
ON public.sensor_readings
FOR SELECT
TO anon, authenticated
USING (true);`}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* AI Provider Status Panel */}
      <div className="mt-8">
        <Section
          title="AI Provider Architecture & Cost Controls"
          description="Server-side LLM gateway status and strict free-tier consumption limits."
        >
          <div className="panel p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-lg border border-border bg-card/60">
                <span className="eyebrow">Active Provider</span>
                <p className="text-base font-semibold text-ink mt-1 flex items-center gap-2">
                  <BrainCircuit className="size-4 text-forest" />
                  {aiInfo.data?.provider ? aiInfo.data.provider.toUpperCase() : "Checking..."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Model: <span className="font-mono">{aiInfo.data?.model ?? "Disabled"}</span>
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-border bg-card/60">
                <span className="eyebrow">Rate Limit Controls</span>
                <p className="text-base font-semibold text-ink mt-1">
                  {aiInfo.data?.limits?.perUserPerHour ?? "6"} req / hour
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Global day cap: {aiInfo.data?.limits?.perDay ?? "40"} calls/day
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-border bg-card/60">
                <span className="eyebrow">Server-Side Cache</span>
                <p className="text-base font-semibold text-ink mt-1">
                  {aiInfo.data?.limits?.cacheTtlMinutes ?? "180"} Minutes TTL
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Prevents redundant provider spend across refreshes
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed pt-2">
              Keys remain exclusively on the server. AI features can be completely toggled off or switched between Google Gemini and OpenAI simply by setting <code className="font-mono bg-muted px-1 rounded">AI_PROVIDER=none|gemini|openai</code> in your environment file.
            </p>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
