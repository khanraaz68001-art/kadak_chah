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
import { composeReminderMessage, sendReminderMessage } from "@/lib/reminders";
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
    if (outstanding <= 0) {
      toast({
        title: "No outstanding balance",
        description: `${customer.full_name || customer.shop_name} is fully settled.`,
      });
      return;
    }

  const partnerNumber = partnerContactSetting ?? getPartnerContactNumber();
    if (!partnerNumber) {
      toast({
        title: "Add partner number",
        description:
          "Set a default partner contact number in the admin dashboard before sending reminders.",
        variant: "destructive",
      });
      return;
    }

    const recipient = normalizePhoneNumber(
      customer.whatsapp_number || customer.contact
    );
    if (!recipient) {
      toast({
        title: "Missing WhatsApp number",
        description:
          "Add a WhatsApp number to this customer before sending reminders.",
        variant: "destructive",
      });
      return;
    }

    try {
      setReminderLoading(customer.id);
      const { data: transactionHistory, error } = await supabase
        .from("transactions")
        .select(
          "id, due_date, balance, paid_amount, amount, created_at, type, tea_name"
        )
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const upcoming = (transactionHistory || [])
        .filter((t: any) => t.due_date && Number(t.balance || 0) > 0)
        .sort(
          (a: any, b: any) =>
            new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        );

      const nextDue = upcoming[0];
      const lastPayment = (transactionHistory || []).find(
        (t: any) => (t.type || "").toLowerCase() === "payment"
      );

      const saleTransactions = (transactionHistory || []).filter(
        (t: any) => (t.type || "").toLowerCase() !== "payment"
      );
      const latestSale = saleTransactions[0] ?? null;
      const primaryTransaction = nextDue ?? latestSale ?? null;

      const invoiceAmount = primaryTransaction
        ? Number(primaryTransaction.amount ?? 0)
        : null;
      const invoiceBalance = primaryTransaction
        ? Math.max(Number(primaryTransaction.balance ?? 0) || 0, 0)
        : Math.max(outstanding, 0);
      let paidAmount = primaryTransaction
        ? Math.max(
            Number(primaryTransaction.paid_amount ?? 0),
            invoiceAmount != null
              ? Math.max(invoiceAmount - invoiceBalance, 0)
              : 0
          )
        : null;
      if (
        paidAmount != null &&
        invoiceAmount != null &&
        Number.isFinite(invoiceAmount)
      ) {
        paidAmount = Math.min(paidAmount, Math.max(invoiceAmount, 0));
      }

      const partnerNumberDisplay = partnerNumber
        ? formatPhoneForDisplay(partnerNumber) ?? partnerNumber
        : null;

      const message = composeReminderMessage({
        customerName: customer.full_name || customer.shop_name || "Customer",
        teaName:
          primaryTransaction?.tea_name || latestSale?.tea_name || null,
        purchaseDate:
          primaryTransaction?.created_at || latestSale?.created_at || null,
        invoiceAmount,
        paidAmount,
        invoiceBalance,
        totalOutstanding: outstanding,
        dueDate: nextDue?.due_date || primaryTransaction?.due_date || null,
        lastPaymentDate: lastPayment?.created_at || null,
        partnerNumber,
      });

      const result = await sendReminderMessage({
        toNumber: recipient,
        message,
        partnerNumber,
        auto: false,
      });

      if (!result.ok) {
        const friendlyReason =
          result.reason === "missing-recipient"
            ? "Missing or invalid WhatsApp number for this customer."
            : result.reason === "no-window-context"
            ? "WhatsApp Web couldn't be launched in this environment. Please open the dashboard in a browser window."
            : result.reason === "webhook-not-configured"
            ? "Automatic reminders require a WhatsApp webhook URL. Configure it in the environment settings."
            : "Unable to prepare the reminder."
        throw new Error(friendlyReason);
      }

      toast({
        title: "Reminder ready",
        description: partnerNumberDisplay
          ? `WhatsApp message opened. Please tap send. Partner contact: ${partnerNumberDisplay}.`
          : "WhatsApp message opened. Please tap send to deliver the reminder.",
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Reminder failed",
        description: err?.message || "Could not send reminder",
        variant: "destructive",
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
