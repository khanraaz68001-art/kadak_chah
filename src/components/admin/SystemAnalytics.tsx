import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { useAnalytics, useCustomers, useTransactions } from "@/lib/hooks";
import { useMemo } from "react";
import { computeTransactionSummary } from "@/lib/utils";

const SystemAnalytics = () => {
  const { data: analytics, isLoading } = useAnalytics();

  const { data: customers } = useCustomers();
  const { data: transactions } = useTransactions();
  const transactionSummary = useMemo(() => computeTransactionSummary(transactions), [transactions]);
  const hasTransactionData = Array.isArray(transactions);

  const chartData = useMemo(() => {
    const map = new Map<string, { sales: number; collections: number; orders: number; payments: number }>();
    const addToMap = (date: string | Date | null | undefined, kind: "sale" | "collection", amount: number) => {
      if (!date) return;
      const dt = new Date(date);
      if (Number.isNaN(dt.getTime())) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, { sales: 0, collections: 0, orders: 0, payments: 0 });
      }
      const entry = map.get(key)!;
      if (kind === "sale") {
        entry.sales += amount;
        entry.orders += 1;
      } else {
        entry.collections += amount;
        entry.payments += 1;
      }
    };

    (transactions || []).forEach((t: any) => {
      const type = String(t.type || "").toLowerCase();
      const amount = Number(t.amount || 0);
      if (type === "payment") {
        addToMap(t.created_at, "collection", amount);
      } else {
        addToMap(t.created_at, "sale", amount);
      }
    });

    const now = new Date();
    const rows: { month: string; sales: number; collections: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key);
      rows.push({
        month: dt.toLocaleString(undefined, { month: "short", year: "2-digit" }),
        sales: entry?.sales ?? 0,
        collections: entry?.collections ?? 0,
      });
    }
    return rows;
  }, [transactions]);

  // compute top customers by total purchase amount (exclude payment transactions)
  const topCustomers = useMemo(() => {
    const summary: Record<string, { total: number; outstanding: number; count: number }> = {};
    (transactions || []).forEach((t: any) => {
      const id = t.customer_id;
      if (!id) return;
      const type = String(t.type || "").toLowerCase();
      const amount = Number(t.amount || 0);
      const balance = Number(t.balance || 0);
      if (!summary[id]) {
        summary[id] = { total: 0, outstanding: 0, count: 0 };
      }
      if (type === "payment") {
        summary[id].outstanding += balance; // payments should reduce outstanding (negative balance)
      } else {
        summary[id].total += amount;
        summary[id].outstanding += balance;
        summary[id].count += 1;
      }
    });

    return Object.entries(summary)
      .map(([id, value]) => {
        const customer = (customers || []).find((c: any) => c.id === id);
        const name = customer?.full_name || customer?.shop_name || "Unknown";
        return {
          id,
          name,
          total: value.total,
          outstanding: Math.max(value.outstanding, 0),
          orders: value.count,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [customers, transactions]);

  const totalCollections = hasTransactionData ? transactionSummary.totals.totalCollections : Number(analytics?.totalCollections || 0);
  const totalSales = hasTransactionData ? transactionSummary.totals.totalSales : Number(analytics?.totalSales || 0);
  const outstanding = hasTransactionData ? transactionSummary.totals.outstanding : Number(analytics?.outstanding || 0);
  const collectionRate = totalSales ? ((totalCollections / totalSales) * 100) : 0;
  const avgSaleValue = Number(analytics?.avgSaleValue || 0);
  const lastSaleAt = analytics?.lastSaleAt ? new Date(analytics.lastSaleAt).toLocaleString() : "—";
  const lastPaymentAt = analytics?.lastPaymentAt ? new Date(analytics.lastPaymentAt).toLocaleString() : "—";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <CardTitle>Sales Analytics</CardTitle>
          </div>
          <CardDescription>Monthly sales performance overview</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading analytics...</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="sales" name="Sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collections" name="Collections" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Customers</CardTitle>
            <CardDescription>By total purchase value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCustomers && topCustomers.length > 0 ? (
                topCustomers.map((c: any, i: number) => (
                  <div key={c.id || i} className="flex flex-col border rounded-md p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">₹{Number(c.total || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>Orders: {c.orders}</span>
                      <span>Outstanding: ₹{Number(c.outstanding || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">No customer purchase data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
            <CardDescription>Overview of collections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Collected</span>
                <span className="font-semibold text-lg">₹{totalCollections.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-semibold text-lg text-destructive">₹{outstanding.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-medium">Collection Rate</span>
                <span className="font-semibold text-lg text-success">{collectionRate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Avg Invoice</span>
                <span>₹{avgSaleValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Last Sale</span>
                <span>{lastSaleAt}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Last Collection</span>
                <span>{lastPaymentAt}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SystemAnalytics;
