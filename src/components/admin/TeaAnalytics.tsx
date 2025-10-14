import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
import { useMemo } from "react";

const fetchTeaAnalytics = async () => {
  const { data, error } = await supabase.from("tea_analytics").select("*");
  if (error) throw error;
  return data as any[];
};

const TeaAnalytics = () => {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["tea_analytics"], queryFn: fetchTeaAnalytics });

  const rows = data || [];
  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row: any) => {
        const sales = Number(row.total_sales_amount || 0);
        const paid = Number(row.total_paid_amount || 0);
        const outstanding = Number(row.outstanding_balance || 0);
        const quantity = Number(row.total_sold_quantity || 0);
        acc.totalSales += sales;
        acc.totalPaid += paid;
        acc.totalOutstanding += outstanding;
        acc.totalQuantity += quantity;
        return acc;
      },
      { totalSales: 0, totalPaid: 0, totalOutstanding: 0, totalQuantity: 0 }
    );
  }, [rows]);

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tea Analytics</CardTitle>
        <CardDescription>Top selling tea names and summary</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-4">
            {rows.length === 0 ? (
              <div className="text-muted-foreground">No tea sales yet</div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-3 border rounded-lg bg-accent/20">
                    <div className="text-xs text-muted-foreground">Total Sales</div>
                    <div className="text-lg font-semibold">₹{summary.totalSales.toFixed(2)}</div>
                  </div>
                  <div className="p-3 border rounded-lg bg-accent/20">
                    <div className="text-xs text-muted-foreground">Total Collected</div>
                    <div className="text-lg font-semibold">₹{summary.totalPaid.toFixed(2)}</div>
                  </div>
                  <div className="p-3 border rounded-lg bg-accent/20">
                    <div className="text-xs text-muted-foreground">Outstanding</div>
                    <div className="text-lg font-semibold text-destructive">₹{summary.totalOutstanding.toFixed(2)}</div>
                  </div>
                  <div className="p-3 border rounded-lg bg-accent/20">
                    <div className="text-xs text-muted-foreground">Total Quantity</div>
                    <div className="text-lg font-semibold">{summary.totalQuantity.toFixed(2)} kg</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {rows.map((row: any) => (
                    <div key={row.tea_name} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-base">{row.tea_name}</div>
                          <div className="text-xs text-muted-foreground">Avg rate ₹{Number(row.avg_selling_rate || 0).toFixed(2)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{Number(row.total_sold_quantity || 0)} kg</div>
                          <div className="text-sm text-muted-foreground">₹{Number(row.total_sales_amount || 0).toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 mt-3 text-xs text-muted-foreground">
                        <div>Collected: ₹{Number(row.total_paid_amount || 0).toFixed(2)}</div>
                        <div>Outstanding: ₹{Number(row.outstanding_balance || 0).toFixed(2)}</div>
                        <div>Orders: {Number(row.orders_count || 0)}</div>
                        <div>First Sale: {formatDate(row.first_sale_at)}</div>
                        <div>Last Sale: {formatDate(row.last_sale_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TeaAnalytics;
