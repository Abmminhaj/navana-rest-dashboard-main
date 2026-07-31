import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui-kit";
import { formatCompactCurrency } from "@/lib/utils";

type Props = {
  monthly: any[];
};

export default function ExpenseChart({ monthly }: Props) {
  const hasData = monthly.some((m) => (m.expense || 0) > 0);

  return (
    <Card className="p-6 lg:col-span-2">
      <h3 className="text-sm font-semibold text-foreground">Monthly Expense Breakdown</h3>

      <p className="text-xs text-muted-foreground">Operational spend pattern</p>

      <div className="mt-4 h-56">
        {!hasData ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-center">
            <p className="text-sm font-medium text-muted-foreground">এখনো কোনো খরচ যোগ হয়নি</p>
            <p className="text-xs text-muted-foreground/70">
              Expenses পেজ থেকে খরচ যোগ করলে এখানে breakdown দেখা যাবে।
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <defs>
                <linearGradient id="expenseBarFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={1} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0.55} />
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
                cursor={{ fill: "#2563EB", fillOpacity: 0.06 }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #E2E8F0",
                  fontSize: 12,
                }}
              />

              <Bar dataKey="expense" fill="url(#expenseBarFill)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
