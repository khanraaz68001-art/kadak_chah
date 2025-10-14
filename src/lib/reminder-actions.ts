import supabase from "./supabase";
import { composeReminderMessage, sendReminderMessage } from "./reminders";
import { formatPhoneForDisplay, getPartnerContactNumber, normalizePhoneNumber } from "./utils";

export type ReminderToast = (payload: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

export type ReminderPayload = {
  customer: any;
  outstandingAmount: number;
  partnerContact?: string | null;
  toast: ReminderToast;
};

export const sendReminderForCustomer = async ({ customer, outstandingAmount, partnerContact, toast }: ReminderPayload) => {
  if (!customer?.id) {
    toast({ title: "Missing customer", description: "Cannot send reminder without a valid customer." });
    return false;
  }

  if (Number(outstandingAmount || 0) <= 0) {
    toast({
      title: "No outstanding balance",
      description: `${customer.full_name || customer.shop_name || "Customer"} is fully settled.`,
    });
    return false;
  }

  const partnerNumberInput = partnerContact ?? getPartnerContactNumber();
  const partnerNumber = normalizePhoneNumber(partnerNumberInput ?? undefined);
  if (!partnerNumber) {
    toast({
      title: "Add partner number",
      description: "Set a default partner contact number in the admin dashboard before sending reminders.",
      variant: "destructive",
    });
    return false;
  }

  const recipient = normalizePhoneNumber(customer.whatsapp_number || customer.contact);
  if (!recipient) {
    toast({
      title: "Missing WhatsApp number",
      description: "Add a WhatsApp number to this customer before sending reminders.",
      variant: "destructive",
    });
    return false;
  }

  try {
    const { data: transactionHistory, error } = await supabase
      .from("transactions")
      .select("id, due_date, balance, paid_amount, amount, created_at, type, tea_name")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const upcoming = (transactionHistory || [])
      .filter((t: any) => t.due_date && Number(t.balance || 0) > 0)
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    const nextDue = upcoming[0];
    const lastPayment = (transactionHistory || []).find((t: any) => (t.type || "").toLowerCase() === "payment");
    const saleTransactions = (transactionHistory || []).filter((t: any) => (t.type || "").toLowerCase() !== "payment");
    const latestSale = saleTransactions[0] ?? null;
    const primaryTransaction = nextDue ?? latestSale ?? null;

    const invoiceAmount = primaryTransaction ? Number(primaryTransaction.amount ?? 0) : null;
    const invoiceBalance = primaryTransaction ? Math.max(Number(primaryTransaction.balance ?? 0) || 0, 0) : Math.max(outstandingAmount, 0);
    let paidAmount = primaryTransaction
      ? Math.max(
          Number(primaryTransaction.paid_amount ?? 0),
          invoiceAmount != null ? Math.max(invoiceAmount - invoiceBalance, 0) : 0,
        )
      : null;

    if (paidAmount != null && invoiceAmount != null && Number.isFinite(invoiceAmount)) {
      paidAmount = Math.min(paidAmount, Math.max(invoiceAmount, 0));
    }

    const partnerNumberDisplay = formatPhoneForDisplay(partnerNumber) ?? partnerNumber;

    const message = composeReminderMessage({
      customerName: customer.full_name || customer.shop_name || "Customer",
      teaName: primaryTransaction?.tea_name || latestSale?.tea_name || null,
      purchaseDate: primaryTransaction?.created_at || latestSale?.created_at || null,
      invoiceAmount,
      paidAmount,
      invoiceBalance,
      totalOutstanding: outstandingAmount,
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
          : "Unable to prepare the reminder.";

      throw new Error(friendlyReason);
    }

    toast({
      title: "Reminder ready",
      description: `WhatsApp message opened. Please tap send.${partnerNumberDisplay ? ` Partner contact: ${partnerNumberDisplay}.` : ""}`,
    });

    return true;
  } catch (err: any) {
    toast({
      title: "Reminder failed",
      description: err?.message || "Could not send reminder",
      variant: "destructive",
    });
    return false;
  }
};
