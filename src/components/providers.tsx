"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsProvider } from "@/lib/settings/context";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Hooks set their own retry policy; this is the safe default for ad-hoc queries.
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            staleTime: 10_000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
