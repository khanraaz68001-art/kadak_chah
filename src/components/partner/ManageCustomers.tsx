import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCustomers, useDeleteCustomer, usePartnerContactSetting, useTransactions } from "@/lib/hooks";
import RegisterCustomer from "./RegisterCustomer";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import supabase from "@/lib/supabase";
import { sendReminderForCustomer } from "@/lib/reminder-actions";
import {
  getPartnerContactNumber,
  setPartnerContactNumber,
  normalizePhoneNumber,
  formatPhoneForDisplay,
} from "@/lib/utils";

const ManageCustomers = ({ onBack }: { onBack?: () => void }) => {
  const { data: customers, isLoading } = useCustomers();
  const { data: transactions } = useTransactions();
  const [editing, setEditing] = useState<any | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const deleteCustomer = useDeleteCustomer();
  const [reminderLoading, setReminderLoading] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { data: partnerContactSetting } = usePartnerContactSetting();

  const outstandingMap = useMemo(() => {
    if (!transactions) return {} as Record<string, number>;
    return (transactions || []).reduce<Record<string, number>>((acc, txn: any) => {
      const customerId = txn?.customer_id;
      if (!customerId) return acc;
      const balance = Number(txn?.balance ?? 0);
      acc[customerId] = (acc[customerId] || 0) + balance;
      return acc;
    }, {});
  }, [transactions]);

  const getOutstanding = (customer: any) => {
    if (!customer) return 0;
    const fromColumn = Number(customer.outstanding_balance ?? 0);
    const fromTransactions = Math.max(0, Number(outstandingMap[customer.id] ?? 0));
    return Math.max(fromColumn, fromTransactions, 0);
  };

  const formatDisplayNumber = (value?: string | null) => {
    if (!value) return "—";
    const display = formatPhoneForDisplay(value);
    if (display) return display;
    if (typeof value === "string" && value.trim().length > 0) {
      return value.replace(/[^0-9]/g, "");
    }
    return "—";
  };

  useEffect(() => {
    if (partnerContactSetting) {
      setPartnerContactNumber(partnerContactSetting);
    }
  }, [partnerContactSetting]);

  if (editing) {
    return (
      <RegisterCustomer
        onBack={() => setEditing(null)}
        editingCustomer={editing}
        onSaved={() => setEditing(null)}
      />
    );
  }

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const handleDelete = async (customer: any) => {
    if (!customer?.id) return;
    const confirmed = window.confirm(
      `Delete ${customer.full_name || customer.shop_name || "this customer"}? This will also remove their transactions.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(customer.id);
      await deleteCustomer.mutateAsync(customer.id);
      toast({
        title: "Customer deleted",
        description: `${customer.full_name || customer.shop_name} removed successfully.`,
      });
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete customer",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendReminder = async (customer: any) => {
    if (!customer?.id) return;
    const outstanding = getOutstanding(customer);
    try {
      setReminderLoading(customer.id);
      await sendReminderForCustomer({
        customer,
        outstandingAmount: outstanding,
        partnerContact: partnerContactSetting ?? getPartnerContactNumber(),
        toast,
      });
    } finally {
      setReminderLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <Button variant="ghost" onClick={handleBack}>
          Back
        </Button>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Manage Customers</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead className="w-[260px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(customers || []).map((customer: any) => (
                    <TableRow key={customer.id}>
                    <TableCell>{customer.full_name || "—"}</TableCell>
                    <TableCell>{customer.shop_name || "—"}</TableCell>
                    <TableCell>{formatDisplayNumber(customer.contact)}</TableCell>
                    <TableCell>
                      {formatDisplayNumber(customer.whatsapp_number || customer.contact)}
                    </TableCell>
                    <TableCell>
                      ₹{getOutstanding(customer).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setEditing(customer)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSendReminder(customer)}
                          disabled={reminderLoading === customer.id}
                        >
                          {reminderLoading === customer.id
                            ? "Sending…"
                            : "Reminder"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(customer)}
                          disabled={deletingId === customer.id}
                        >
                          {deletingId === customer.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageCustomers;
