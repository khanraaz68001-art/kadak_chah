import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useBatchPnl } from "@/lib/hooks";

interface BatchListProps {
  showPnl?: boolean;
}

const BatchList = ({ showPnl = true }: BatchListProps) => {
  const { data, isLoading } = useBatchPnl();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batches</CardTitle>
        <CardDescription>Current inventory and P&L summary</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-3">
            {(data || []).map((b: any) => (
              <div
                key={b.batch_id}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {b.batch_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Remaining: {b.remaining_quantity} kg • Purchase ₹
                    {Number(b.purchase_rate).toFixed(2)}
                  </div>
                </div>
                {showPnl && (
                  <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:items-end">
                    <span className="text-sm font-semibold text-foreground">
                      Sold: {Number(b.sold_quantity || 0)} kg
                    </span>
                    <span>P&L: ₹{Number(b.pnl || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BatchList;
