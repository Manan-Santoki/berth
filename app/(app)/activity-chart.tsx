"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { DailyActivity } from "@/lib/events";

// Fixed hues so the series stay distinguishable in both themes (the preset's chart palette is grayscale).
const config = {
  push: { label: "Pushes", color: "oklch(0.62 0.19 255)" },
  pull: { label: "Pulls", color: "oklch(0.72 0.15 165)" },
  delete: { label: "Deletes", color: "oklch(0.64 0.22 25)" },
} satisfies ChartConfig;

const day = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { ...opts, timeZone: "UTC" });

export function ActivityChart({ data }: { data: DailyActivity[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(d: string) => day(d, { month: "short", day: "numeric" })} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
        <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={<ChartTooltipContent labelFormatter={(d) => day(String(d), { dateStyle: "medium" })} />} />
        <Bar dataKey="pull" stackId="a" fill="var(--color-pull)" />
        <Bar dataKey="push" stackId="a" fill="var(--color-push)" />
        <Bar dataKey="delete" stackId="a" fill="var(--color-delete)" radius={[3, 3, 0, 0]} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
