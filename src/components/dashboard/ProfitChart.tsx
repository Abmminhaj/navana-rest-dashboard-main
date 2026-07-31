import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui-kit";
import { formatCompactCurrency } from "@/lib/utils";

type Props = {
  monthly: any[];
};

export default function ProfitChart({ monthly }: Props) {
  const hasData = monthly.some((m) => (m.profit || 0) !== 0);

  return (
    <Card className="p-6">
      <h3 className="text-sm font-semibold text-foreground">Profit Trend</h3>

      <p className="text-xs text-muted-foreground">Monthly net profit</p>

      <div className="mt-4 h-64">
        {!hasData ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-center">
            <p className="text-sm font-medium text-muted-foreground">এখনো কোনো ডেটা নেই</p>
            <p className="text-xs text-muted-foreground/70">
              মাস শেষে profit trend এখানে দেখা যাবে।
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />

              <XAxis
                dataKey="month"
                stroke="#94A3B8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                stroke="#94A3B8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactCurrency}
                width={56}
              />

              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #E2E8F0",
                  fontSize: 12,
                }}
              />

              <Area
                type="monotone"
                dataKey="profit"
                stroke="#10B981"
                strokeWidth={3}
                fill="url(#profitFill)"
                dot={{ r: 4, fill: "#10B981", strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
