import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt } from "lucide-react";
import { useTransactions } from "@/lib/hooks";

const AllTransactions = () => {
  const { data, isLoading, isError, error } = useTransactions();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          <CardTitle>All Transactions</CardTitle>
        </div>
        <CardDescription>Complete transaction log across all customers</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Loading transactions...</div>
        ) : isError ? (
          <div className="text-destructive">Error: {(error as any)?.message}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Quantity (kg)</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data || []).map((transaction: any) => (
                  <TableRow key={transaction.id}>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{new Date(transaction.created_at).toLocaleDateString()}</div>
                      <div className="text-muted-foreground">{new Date(transaction.created_at).toLocaleTimeString()}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{transaction.customer_name || transaction.customer}</TableCell>
                  <TableCell>{transaction.quantity ?? "-"} kg</TableCell>
                  <TableCell className="text-right">₹{Number(transaction.amount ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">₹{Number(transaction.paid_amount ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span className={Number(transaction.balance ?? 0) > 0 ? "text-destructive font-semibold" : ""}>
                      ₹{Number(transaction.balance ?? 0).toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {transaction.status === "paid" && (
                      <Badge variant="default" className="bg-success">Paid</Badge>
                    )}
                    {transaction.status === "partial" && (
                      <Badge variant="secondary">Partial</Badge>
                    )}
                    {transaction.status === "due" && (
                      <Badge variant="destructive">Due</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AllTransactions;
