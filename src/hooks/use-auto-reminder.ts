import { useEffect } from "react";
import supabase from "@/lib/supabase";
import {
  getPartnerContactNumber,
  setPartnerContactNumber,
  normalizePhoneNumber,
} from "@/lib/utils";
import { composeReminderMessage, sendReminderMessage } from "@/lib/reminders";

const STORAGE_PREFIX = "auto-reminder-sent-";

const startOfDay = (input: Date) => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

const diffInDays = (future: Date, current: Date) => {
  const f = startOfDay(future).getTime();
  const c = startOfDay(current).getTime();
  return Math.round((f - c) / (24 * 60 * 60 * 1000));
};

const markAsSent = (transactionId: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${transactionId}`, new Date().toISOString());
};

const wasAlreadySent = (transactionId: string) => {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(`${STORAGE_PREFIX}${transactionId}`));
};

const fetchLastPaymentDate = async (customerId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from("transactions")
    .select("created_at")
    .eq("customer_id", customerId)
    .ilike("type", "payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch last payment", error);
    return null;
  }

  return data?.created_at ?? null;
};

const fetchPartnerContactFromDb = async (): Promise<string | null> => {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "partner_contact_number")
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Failed to load partner contact", error);
    return null;
  }

  const retrieved = (data?.value ?? "").trim();
  if (retrieved) {
    setPartnerContactNumber(retrieved);
    return retrieved;
  }

  return null;
};

const useAutoReminder = () => {
  useEffect(() => {
    let cancelled = false;

    const checkReminders = async () => {
      const partnerNumber = getPartnerContactNumber() || (await fetchPartnerContactFromDb());
      const webhookAvailable = Boolean(import.meta.env.VITE_REMINDER_WEBHOOK_URL);

      if (!partnerNumber && !webhookAvailable) {
        // Without partner number (for message context) or a webhook endpoint, skip automation.
        return;
      }

      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowIso = tomorrow.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, customer_id, due_date, balance, amount, paid_amount, tea_name, created_at, customer:customers(full_name, shop_name, whatsapp_number, contact)"
        )
        .not("due_date", "is", null)
        .gt("balance", 0)
        .gte("due_date", todayIso)
        .lte("due_date", tomorrowIso);

      if (error) {
        console.error("Auto reminder query failed", error);
        return;
      }

      if (!data || data.length === 0) return;

      for (const transaction of data) {
        if (cancelled) return;
        if (!transaction.due_date) continue;

        const daysUntilDue = diffInDays(new Date(transaction.due_date), today);
        if (daysUntilDue !== 1) continue; // trigger exactly one day prior

        if (wasAlreadySent(transaction.id)) continue;

        const customerData = Array.isArray(transaction.customer)
          ? transaction.customer[0]
          : transaction.customer;

        const customerName = customerData?.full_name || customerData?.shop_name || "Customer";
        const rawNumber = customerData?.whatsapp_number || customerData?.contact || null;
        const normalized = normalizePhoneNumber(rawNumber ?? undefined);

        if (!normalized) continue;

        const lastPaymentDate = await fetchLastPaymentDate(transaction.customer_id);
        const amountDue = Number(transaction.balance || 0);

        if (amountDue <= 0) {
          markAsSent(transaction.id);
          continue;
        }

        const invoiceAmount = Number(transaction.amount ?? amountDue);
        const invoiceBalance = Math.max(Number(transaction.balance ?? amountDue) || amountDue, 0);
        let paidAmount = Math.max(
          Number(transaction.paid_amount ?? 0),
          invoiceAmount - invoiceBalance
        );
        if (Number.isFinite(invoiceAmount)) {
          paidAmount = Math.min(paidAmount, Math.max(invoiceAmount, 0));
        }

        const message = composeReminderMessage({
          customerName,
          teaName: transaction.tea_name,
          purchaseDate: transaction.created_at,
          invoiceAmount,
          paidAmount,
          invoiceBalance,
          totalOutstanding: Math.max(amountDue, invoiceBalance),
          dueDate: transaction.due_date,
          lastPaymentDate,
          partnerNumber,
        });
        const result = await sendReminderMessage({
          toNumber: normalized,
          message,
          partnerNumber,
          auto: true,
        });

        if (result.ok) {
          markAsSent(transaction.id);
        }
      }
    };

    void checkReminders();
    const interval = window.setInterval(checkReminders, 1000 * 60 * 30); // every 30 minutes

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
};

export default useAutoReminder;
