"use client";

import {
  Activity,
  CloudSun,
  Droplets,
  LayoutDashboard,
  LineChart,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { FreshnessPill } from "@/components/dashboard/status";
import { SetupNotice } from "@/components/shell/setup-notice";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/config";
import { useOnlineStatus } from "@/lib/data/hooks";
import { useDashboardData } from "@/lib/data/useDashboard";
import { useSettings } from "@/lib/settings/context";
import { formatAge, tzName } from "@/lib/time";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/live", label: "Live Monitoring", icon: Activity },
  { href: "/analytics", label: "Historical Analytics", icon: LineChart },
  { href: "/predictions", label: "AI Predictions", icon: Sparkles },
  { href: "/weather", label: "Weather Forecast", icon: CloudSun },
  { href: "/irrigation", label: "Irrigation History", icon: Droplets },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2c5a3c" />
      <path d="M9 22c0-7 4.5-11.5 14-12-.3 8.2-4.6 12.6-11.2 12.4" fill="none" stroke="#f1ead6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 23.5c2.2-3.6 4.6-6 8-8" fill="none" stroke="#c9d38f" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring group relative flex items-center gap-3 rounded-md px-3 py-2 text-[0.9rem] transition-colors",
              active ? "bg-[#e4dfc6] font-medium text-[#223a2b]" : "text-[#4a5846] hover:bg-[#e9e3cf]",
            )}
          >
            <span className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-full transition-opacity", active ? "bg-olive opacity-100" : "opacity-0")} aria-hidden />
            <Icon className={cn("size-4 shrink-0", active ? "text-forest" : "text-[#7b8676] group-hover:text-forest")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="focus-ring mb-8 flex items-center gap-3 rounded-md px-2 py-1">
        <BrandMark className="size-9" />
        <div className="leading-tight">
          <p className="font-heading text-[1.35rem] font-medium tracking-tight text-ink">Tilth</p>
          <p className="text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">Smart agriculture</p>
        </div>
      </Link>
      <NavList onNavigate={onNavigate} />
      <div className="mt-auto rounded-lg border border-[#ddd5bf] bg-[#f6f1e2] p-3 text-xs leading-relaxed text-muted-foreground">
        Telemetry is synchronized from your agricultural database. “Reporting” status indicates recent data received from the sensor node.
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { tz } = useSettings();
  const configured = isSupabaseConfigured();
  const { freshness, isFetching, lastFetchedAt, now } = useDashboardData();

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6 lg:px-10">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {configured ? (
          <>
            <FreshnessPill freshness={freshness} />
            <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
              {isFetching ? "Refreshing…" : now > 0 && lastFetchedAt ? `Checked ${formatAge(now - lastFetchedAt)}` : ""}
              {now > 0 && (
                <>
                  <span className="mx-2 opacity-40">·</span>
                  {tzName(now, tz)}
                </>
              )}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Database Not Connected
          </span>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const online = useOnlineStatus();
  const configured = isSupabaseConfigured();

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-sidebar-border bg-sidebar p-5 lg:block" aria-label="Sidebar">
        <SidebarContent />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-[#24302a]/40" aria-label="Close navigation" onClick={() => setDrawer(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] bg-sidebar p-5 shadow-xl">
            <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={() => setDrawer(false)} aria-label="Close navigation">
              <X className="size-5" />
            </Button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <TopBar onMenu={() => setDrawer(true)} />
        {!online && (
          <div role="status" className="flex items-center gap-2 border-b border-[#e6d3a1] bg-[#f4e8cc] px-6 py-2 text-sm text-[#7d5a12]">
            <WifiOff className="size-4" aria-hidden /> You’re offline. Showing the last data loaded; it will refresh automatically when the connection returns.
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {configured ? children : <SetupNotice />}
        </main>
      </div>
    </div>
  );
}
