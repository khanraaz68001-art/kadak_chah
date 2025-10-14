import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCustomers, useTransactions } from "@/lib/hooks";
import supabase from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

interface CollectPaymentProps {
  onBack?: () => void;
}

// We'll fetch customers and filter for outstanding balances (assumes `outstanding_balance` column exists)

const CollectPayment = ({ onBack }: CollectPaymentProps) => {
  const { toast } = useToast();
  const { data: customers, isLoading: customersLoading, refetch } = useCustomers();
  const qc = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [customerTransactions, setCustomerTransactions] = useState<any[]>([]);
  const [transactionSums, setTransactionSums] = useState<Record<string, number>>({});
  const { data: allTransactions } = useTransactions();
  const lastLoadRef = useRef<number>(Date.now());

  const loadCustomerTransactions = async (customerId: string) => {
    try {
      const { data, error } = await supabase.from("transactions").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
      if (error) throw error;
      setCustomerTransactions(data || []);
      lastLoadRef.current = Date.now();
    } catch (err) {
      setCustomerTransactions([]);
    }
  };

  const loadAllTransactionSums = async () => {
    try {
      // Pull transactions and compute net outstanding per customer: sum balances where balance>0 (sales) minus payments
      const { data, error } = await supabase.from("transactions").select("customer_id, balance, type");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((t: any) => {
        const id = t.customer_id;
        if (!id) return;
        const bal = Number(t.balance || 0);
        // Treat payment transactions (type 'payment') as negative balance already stored; we only sum positive outstanding
        map[id] = (map[id] || 0) + bal;
      });
      setTransactionSums(map);
    } catch (err) {
      setTransactionSums({});
    }
  };

  // Always refetch customers on mount to pick up external changes
  useEffect(() => {
    refetch();
    loadAllTransactionSums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute transaction sums whenever the transactions query changes.
  useEffect(() => {
    if (!allTransactions) return;
    const map: Record<string, number> = {};
    // compute net outstanding per customer from live transactions
    (allTransactions || []).forEach((t: any) => {
      const id = t.customer_id;
      if (!id) return;
      const bal = Number(t.balance || 0);
      map[id] = (map[id] || 0) + bal;
    });
    setTransactionSums(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTransactions]);

  // debug: log customers to console to help diagnose missing entries
  useEffect(() => {
    console.debug("CollectPayment: loaded customers", customers);
    console.debug("CollectPayment: transactionSums", transactionSums);
    console.debug("CollectPayment: customerTransactions length", customerTransactions.length);
  }, [customers, transactionSums]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCustomer) return;

    const amount = parseFloat(paymentAmount);
    try {
      // insert a payment transaction
      // record a payment transaction - balance is negative to reduce outstanding
      const { data: insertedPayment, error } = await supabase
        .from("transactions")
        .insert({
          customer_id: selectedCustomer.id,
          amount: amount,
          type: "payment",
          paid_amount: amount,
          balance: -Math.abs(amount),
        })
        .select()
        .single();
      if (error) throw error;

      // Optionally update customer outstanding balance in customers table if you store it
      await supabase.from("customers").update({ outstanding_balance: Math.max((selectedCustomer.outstanding_balance || 0) - amount, 0) }).eq("id", selectedCustomer.id);

      // refresh lists
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["customers"] });

      toast({
        title: "Payment Collected",
        description: `₹${amount.toFixed(2)} collected from ${selectedCustomer.full_name || selectedCustomer.name}`,
      });

      setPaymentAmount("");
      setSelectedCustomer(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to record payment" });
    }
  };

  const outstandingAmount = selectedCustomer
    ? ((): number => {
        const txSum = Number(transactionSums[selectedCustomer.id] ?? 0);
        const txOutstanding = Math.max(0, txSum);
        if (txOutstanding > 0) return txOutstanding;
        return Number(selectedCustomer.outstanding_balance ?? 0);
      })()
    : 0;

  return (
    <div className="space-y-4">
      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      )}

      {!selectedCustomer ? (
        <Card>
          <CardHeader>
            <CardTitle>Customers with Pending Balance</CardTitle>
            <CardDescription>Select a customer to collect payment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-end mb-4">
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Refresh
              </Button>
            </div>
            <div className="space-y-3">
              {(customers || []).filter((c: any) => {
                const outstandingFromColumn = Number(c.outstanding_balance ?? 0);
                const outstandingFromTransactions = Math.max(0, Number(transactionSums[c.id] ?? 0));
                return Math.max(outstandingFromColumn, outstandingFromTransactions, 0) > 0;
              }).map((customer: any) => {
                const outstandingFromColumn = Number(customer.outstanding_balance ?? 0);
                const outstandingFromTransactions = Math.max(0, Number(transactionSums[customer.id] ?? 0));
                const displayOutstanding = Math.max(outstandingFromColumn, outstandingFromTransactions, 0);
                return (
                  <Card
                    key={customer.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => { setSelectedCustomer(customer); loadCustomerTransactions(customer.id); }}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{customer.full_name || customer.name}</div>
                          <div className="text-sm text-muted-foreground">{customer.shop_name || customer.shop}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-destructive">₹{displayOutstanding.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">Due</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Debug: show loaded customers count when needed */}
              <div className="pt-4 text-xs text-muted-foreground">
                Loaded customers: {(customers || []).length} {customersLoading ? "(loading...)" : ""} — Pending: {((customers || []).filter((c: any) => {
                  const outstandingFromColumn = Number(c.outstanding_balance ?? 0);
                  const outstandingFromTransactions = Number(transactionSums[c.id] ?? 0);
                  return Math.max(outstandingFromColumn, outstandingFromTransactions, 0) > 0;
                })).length}
              </div>

              {(!(customers || []).filter((c: any) => Number(c.outstanding_balance || 0) > 0).length) && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No pending payments</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                {selectedCustomer.full_name || selectedCustomer.name} - {selectedCustomer.shop_name || selectedCustomer.shop}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {customerTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="p-4 border rounded-lg space-y-2"
                  >
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Date:</span>
                      <span className="font-medium">{new Date(transaction.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Invoice Amount:</span>
                      <span className="font-medium">₹{Number(transaction.amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Paid:</span>
                      <span className="font-medium">₹{Number(transaction.paid_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-sm font-semibold">Balance:</span>
                      <span className="font-semibold text-destructive">₹{Number(transaction.balance || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-destructive/10 border border-destructive rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Outstanding:</span>
                  <span className="text-xl font-bold text-destructive">₹{outstandingAmount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Collect Payment</CardTitle>
              <CardDescription>Record a new payment collection</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePayment} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Payment Amount (₹) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Enter amount being paid"
                    max={outstandingAmount}
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedCustomer(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setPaymentAmount(outstandingAmount.toString())} className="flex-1">
                    Pay Full Balance
                  </Button>
                  <Button type="submit" className="flex-1">
                    Record Payment
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CollectPayment;
