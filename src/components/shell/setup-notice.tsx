import { KeyRound } from "lucide-react";
import { supabaseConfigStatus } from "@/lib/config";

/** Shown instead of telemetry when the database connection is not yet configured. */
export function SetupNotice() {
  const status = supabaseConfigStatus();
  return (
    <div className="animate-rise mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8">
      <div className="mb-5 flex size-11 items-center justify-center rounded-full bg-moss text-forest">
        <KeyRound className="size-5" aria-hidden />
      </div>
      <h1 className="text-3xl font-medium text-ink">Connect Telemetry Database</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        The monitoring interface is active, but your telemetry database is not connected yet. Once connected, live sensor feeds, trends, and forecasts will update here automatically.
      </p>
      {!status.ok && (
        <p role="alert" className="mt-4 rounded-lg border border-[#e4bfa8] bg-[#f8e9e0] px-4 py-3 text-sm text-[#8a3b1c]">
          {status.message}
        </p>
      )}
      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
        <p className="font-medium text-ink">Setup Checklist:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ensure your environment configuration has the database URL and public access key provided.</li>
          <li>Confirm that your ESP32 hardware is powered on and connected to the local network.</li>
          <li>Restart the application server to begin streaming live agricultural telemetry.</li>
        </ul>
      </div>
    </div>
  );
}
