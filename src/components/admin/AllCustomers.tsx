import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Edit, Trash } from "lucide-react";
import { useCustomers, useUpdateCustomer, useDeleteCustomer, useTransactions } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { computeTransactionSummary } from "@/lib/utils";

const AllCustomers = () => {
  const { data, isLoading, isError, error } = useCustomers();
  const { data: transactions } = useTransactions();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  const transactionSummary = useMemo(() => computeTransactionSummary(transactions), [transactions]);

  const customerSummaries = useMemo(() => {
    const perCustomer = transactionSummary.perCustomer;

    return (data || []).map((customer: any) => {
      const aggregates = perCustomer[customer.id ?? ""] || {
        totalSales: Number(customer.total_purchases ?? 0) || 0,
        totalCollections: 0,
        outstanding: Number(customer.outstanding_balance ?? 0) || 0,
        transactions: 0,
      };

      return {
        ...customer,
        totalSales: aggregates.totalSales,
        totalCollections: aggregates.totalCollections,
        outstandingCalculated: Math.max(
          Number(customer.outstanding_balance ?? 0) || 0,
          Number(aggregates.outstanding ?? 0) || 0,
          0
        ),
      };
    });
  }, [data, transactionSummary]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <CardTitle>All Customers</CardTitle>
        </div>
        <CardDescription>Complete list of registered customers and vendors</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Loading customers...</div>
        ) : isError ? (
          <div className="text-destructive">Error loading customers: {(error as any)?.message}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Shop/Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Total Purchases</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(customerSummaries || []).map((customer: any) => (
                  <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    {editingId === customer.id ? (
                      <Input value={editValues.full_name ?? customer.full_name} onChange={(e) => setEditValues({ ...editValues, full_name: e.target.value })} />
                    ) : (
                      customer.full_name || customer.name
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === customer.id ? (
                      <Input value={editValues.shop_name ?? customer.shop_name} onChange={(e) => setEditValues({ ...editValues, shop_name: e.target.value })} />
                    ) : (
                      customer.shop_name || customer.shop
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {editingId === customer.id ? (
                      <Input value={editValues.contact ?? customer.contact} onChange={(e) => setEditValues({ ...editValues, contact: e.target.value })} />
                    ) : (
                      customer.contact
                    )}
                  </TableCell>
                  <TableCell className="text-right">₹{Number(customer.totalSales || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span className={Number(customer.outstandingCalculated || 0) > 0 ? "text-destructive font-semibold" : ""}>
                      ₹{Number(customer.outstandingCalculated || 0).toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {Number(customer.outstandingCalculated || 0) > 0 ? (
                      <Badge variant="destructive">Pending</Badge>
                    ) : (
                      <Badge variant="default" className="bg-success">Clear</Badge>
                    )}
                  </TableCell>
                  <TableCell className="w-40">
                    {editingId === customer.id ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={async () => {
                          try {
                            await updateCustomer.mutateAsync({ id: customer.id, changes: editValues });
                            toast({ title: 'Updated', description: 'Customer updated' });
                            setEditingId(null);
                            setEditValues({});
                          } catch (err: any) {
                            toast({ title: 'Error', description: err?.message || 'Failed to update' });
                          }
                        }}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditValues({}); }}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(customer.id); setEditValues({ full_name: customer.full_name, shop_name: customer.shop_name, contact: customer.contact }); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={async () => {
                          if (!confirm('Delete this customer? This cannot be undone.')) return;
                          try {
                            await deleteCustomer.mutateAsync(customer.id);
                            toast({ title: 'Deleted', description: 'Customer removed' });
                          } catch (err: any) {
                            toast({ title: 'Error', description: err?.message || 'Failed to delete' });
                          }
                        }}>
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
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

export default AllCustomers;
