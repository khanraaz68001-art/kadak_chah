import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCustomers, useBatches, useRecordSale } from "@/lib/hooks";
import supabase from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

interface NewSaleProps {
  onBack?: () => void;
}

// customers will be loaded from Supabase

const NewSale = ({ onBack }: NewSaleProps) => {
  const { toast } = useToast();
  const { data: customers, isLoading } = useCustomers();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const { data: batches } = useBatches();
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const recordSale = useRecordSale();
  const [quantity, setQuantity] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState<string>("");

  const getDefaultDueDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };

  const totalAmount = quantity && pricePerKg ? parseFloat(quantity) * parseFloat(pricePerKg) : 0;
  const balanceDue = paymentType === "partial" && amountPaid 
    ? totalAmount - parseFloat(amountPaid)
    : 0;

  const filteredCustomers = (customers || []).filter(
    (customer: any) =>
      (customer.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.shop_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCustomer) {
      toast({
        title: "Select Customer",
        description: "Please select a customer first.",
        variant: "destructive",
      });
      return;
    }

      try {
        if (!selectedBatchId) {
          toast({ title: "Select Batch", description: "Please select a tea batch for this sale.", variant: "destructive" });
          return;
        }

        // Ensure pricePerKg is set; otherwise use batch purchase rate as default
        const batch = (batches || []).find((b: any) => b.id === selectedBatchId);
        if (!batch) {
          toast({ title: "Batch not found", description: "Selected batch not found.", variant: "destructive" });
          return;
        }

        if (paymentType === "partial") {
          if (!amountPaid) {
            toast({ title: "Amount Paid", description: "Enter the amount received for partial payments.", variant: "destructive" });
            return;
          }

          if (!dueDate) {
            toast({ title: "Due Date Required", description: "Please select a due date for the pending balance.", variant: "destructive" });
            return;
          }

          const due = new Date(dueDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (due < today) {
            toast({ title: "Invalid Due Date", description: "Due date cannot be in the past.", variant: "destructive" });
            return;
          }

          if (parseFloat(amountPaid || "0") >= totalAmount) {
            toast({ title: "Mismatch", description: "Paid amount covers the full total. Choose full payment instead.", variant: "destructive" });
            return;
          }
        }

        const salePayload = {
          batch_id: selectedBatchId,
          customer_id: selectedCustomer.id,
          quantity: Number(quantity || 0),
          price_per_kg: Number(pricePerKg || batch.purchase_rate || 0),
          type: paymentType === "partial" ? "partial" : "sale",
          paid_amount: paymentType === "partial" ? Number(amountPaid || 0) : undefined,
          due_date: paymentType === "partial" ? dueDate : null,
        };

        await recordSale.mutateAsync(salePayload);

        // refresh lists
        await qc.invalidateQueries({ queryKey: ["transactions"] });
        await qc.invalidateQueries({ queryKey: ["customers"] });
        await qc.invalidateQueries({ queryKey: ["batches"] });

        toast({
          title: "Transaction Saved",
          description: `Sale recorded for ${selectedCustomer.full_name || selectedCustomer.name}. Amount: ₹${totalAmount.toFixed(2)}`,
        });

        // Reset form
        setSelectedCustomer(null);
        setSelectedBatchId("");
        setQuantity("");
        setPricePerKg("");
        setPaymentType("full");
        setAmountPaid("");
        setDueDate("");
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "Failed to save transaction" });
      }
  };

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
            <CardTitle>Select Customer</CardTitle>
            <CardDescription>Choose an existing customer for this sale</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or shop..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="space-y-2">
                {filteredCustomers.map((customer) => (
                  <Card
                    key={customer.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <CardContent className="p-4">
                      <div className="font-medium">{customer.full_name || customer.name}</div>
                      <div className="text-sm text-muted-foreground">{customer.shop_name || customer.shop}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>New Sale Transaction</CardTitle>
            <CardDescription>
              Customer: {selectedCustomer.full_name || selectedCustomer.name} ({selectedCustomer.shop_name || selectedCustomer.shop})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="batch">Tea Batch *</Label>
                  <select
                    id="batch"
                    className="w-full px-3 py-2 border rounded-md"
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    required
                  >
                    <option value="">Select tea batch</option>
                    {(batches || []).map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — remaining: {b.remaining_quantity} kg @ ₹{b.purchase_rate}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity (kg) *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Enter quantity in kg"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pricePerKg">Price per kg (₹) (leave empty to use purchase rate)</Label>
                  <Input
                    id="pricePerKg"
                    type="number"
                    step="0.01"
                    value={pricePerKg}
                    onChange={(e) => setPricePerKg(e.target.value)}
                    placeholder="Enter price per kg or leave blank"
                  />
                </div>
              </div>

              {totalAmount > 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-lg font-semibold">
                    Total Amount: ₹{totalAmount.toFixed(2)}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label>Payment Type *</Label>
                <RadioGroup
                  value={paymentType}
                  onValueChange={(value) => {
                    const next = value as "full" | "partial";
                    setPaymentType(next);
                    if (next === "partial" && !dueDate) {
                      setDueDate(getDefaultDueDate());
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full" id="full" />
                    <Label htmlFor="full" className="font-normal cursor-pointer">
                      Full Payment
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="partial" id="partial" />
                    <Label htmlFor="partial" className="font-normal cursor-pointer">
                      Partial Payment
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {paymentType === "partial" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="amountPaid">Amount Paid (₹) *</Label>
                    <Input
                      id="amountPaid"
                      type="number"
                      step="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="Enter amount paid"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Balance Due Date *</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll queue a reminder one day before this due date.
                    </p>
                  </div>

                  {amountPaid && (
                    <div className="p-4 bg-warning/10 border border-warning rounded-lg">
                      <div className="font-semibold text-warning">
                        Balance Due: ₹{balanceDue.toFixed(2)}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedCustomer(null)}
                  className="flex-1"
                >
                  Change Customer
                </Button>
                <Button type="submit" className="flex-1">
                  Save Transaction
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default NewSale;
