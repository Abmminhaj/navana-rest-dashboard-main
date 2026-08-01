import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui-kit";

export interface StatItem {
  label: string;
  value: string;
  delta: string;
  icon: LucideIcon;
  tone: string;
  to?: string;
  search?: Record<string, unknown>;
}

interface Props {
  stats: StatItem[];
}

export default function DashboardStats({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7">
      {stats.map((s) => {
        const cardBody = (
          <>
            <div
              className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${s.tone}`}
            >
              <s.icon className="h-4 w-4" />
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>

            <div className="mt-1 text-2xl font-bold text-foreground">{s.value}</div>

            <div className="mt-1 text-[11px] text-muted-foreground">{s.delta}</div>
          </>
        );

        const cardClassName =
          "block p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" +
          (s.to ? " cursor-pointer" : "");

        if (s.to) {
          return (
            <Link key={s.label} to={s.to} search={s.search as any}>
              <Card className={cardClassName}>{cardBody}</Card>
            </Link>
          );
        }

        return (
          <Card key={s.label} className={cardClassName}>
            {cardBody}
          </Card>
        );
      })}
    </div>
  );
}
