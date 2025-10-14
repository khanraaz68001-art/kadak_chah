import { formatPhoneForDisplay, formatReadableDate, normalizePhoneNumber } from "@/lib/utils";

const formatCurrencyLine = (value?: number | null) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "₹0.00";
  return `₹${value.toFixed(2)}`;
};

export interface ReminderMessageDetails {
  customerName: string;
  teaName?: string | null;
  purchaseDate?: string | null;
  invoiceAmount?: number | null;
  paidAmount?: number | null;
  invoiceBalance?: number | null;
  totalOutstanding: number;
  dueDate?: string | null;
  lastPaymentDate?: string | null;
  partnerNumber?: string | null;
}

export const composeReminderMessage = ({
  customerName,
  teaName,
  purchaseDate,
  invoiceAmount,
  paidAmount,
  invoiceBalance,
  totalOutstanding,
  dueDate,
  lastPaymentDate,
  partnerNumber,
}: ReminderMessageDetails) => {
  const purchaseText = purchaseDate ? formatReadableDate(purchaseDate) : "Not recorded";
  const teaLabel = (teaName ?? "your latest tea order").trim() || "your latest tea order";
  const invoiceLine = typeof invoiceAmount === "number" && Number.isFinite(invoiceAmount)
    ? `${"".padStart(2)}• Invoice total: ${formatCurrencyLine(Math.max(invoiceAmount, 0))}`
    : null;
  const paidLine = typeof paidAmount === "number" && Number.isFinite(paidAmount)
    ? `${"".padStart(2)}• Paid so far: ${formatCurrencyLine(Math.max(paidAmount, 0))}`
    : null;
  const balanceBase = typeof invoiceBalance === "number" && Number.isFinite(invoiceBalance)
    ? Math.max(invoiceBalance, 0)
    : Math.max(totalOutstanding, 0);
  const dueDateText = dueDate ? formatReadableDate(dueDate) : null;
  const balanceLine = `${"".padStart(2)}• Balance due: ${formatCurrencyLine(balanceBase)}${dueDateText ? ` (due on ${dueDateText})` : ""}`;
  const outstandingDifference = Math.abs(Math.max(totalOutstanding, 0) - balanceBase);
  const overallLine = outstandingDifference > 1
    ? `${"".padStart(2)}• Total outstanding with us: ${formatCurrencyLine(Math.max(totalOutstanding, 0))}`
    : null;
  const partnerDisplay = partnerNumber
    ? formatPhoneForDisplay(partnerNumber) ?? partnerNumber
    : null;
  const partnerLine = partnerDisplay
    ? `☎ Partner support: ${partnerDisplay}`
    : null;

  const salutation = `Dear ${customerName},`;
  const intro = `I hope this note finds you well. This is a gentle reminder from Kadak चाह regarding your recent tea procurement.`;

  const detailsBlock: Array<string | null> = [
    "Tea Order Summary:",
    `${"".padStart(2)}• Tea selection: ${teaLabel}`,
    `${"".padStart(2)}• Purchased on: ${purchaseText}`,
    invoiceLine,
    paidLine,
    balanceLine,
    overallLine,
  ];

  const closingPara = "We truly appreciate your continued patronage. Kindly keep the payment ready for our partner to collect at your convenience.";

  const signatureLines: Array<string | null> = [
    partnerLine,
    partnerLine ? "" : null,
    "",
    `${"".padStart(34)}With warm regards,`,
    `${"".padStart(34)}Kadak चाह`,
  ];

  return [
    salutation,
    "",
    intro,
    "",
    ...detailsBlock,
    "",
    closingPara,
    "",
    ...signatureLines,
  ]
    .filter(Boolean)
    .join("\n");
};

interface ReminderOptions {
  toNumber?: string | null;
  message: string;
  partnerNumber?: string | null;
  auto?: boolean;
}

interface ReminderResult {
  via: "webhook" | "whatsapp-link" | "skipped";
  ok: boolean;
  reason?: string;
}

export const sendReminderMessage = async ({
  toNumber,
  message,
  partnerNumber,
  auto = false,
}: ReminderOptions): Promise<ReminderResult> => {
  const normalizedRecipient = normalizePhoneNumber(toNumber ?? undefined);
  if (!normalizedRecipient) {
    return { via: "skipped", ok: false, reason: "missing-recipient" };
  }

  const webhookUrl = import.meta.env.VITE_REMINDER_WEBHOOK_URL;
  const webhookSecret = import.meta.env.VITE_REMINDER_WEBHOOK_SECRET;
  const shouldUseWebhook = Boolean(webhookUrl && auto);

  if (auto && !webhookUrl) {
    // Avoid launching popups automatically; require webhook configuration for unattended sends
    return { via: "skipped", ok: false, reason: "webhook-not-configured" };
  }

  const payload = {
    to: normalizedRecipient,
    message,
    partnerNumber: partnerNumber ?? null,
    auto,
  };

  try {
    if (shouldUseWebhook) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return { via: "webhook", ok: false, reason: `webhook-status-${res.status}` };
      }

      return { via: "webhook", ok: true };
    }

    if (typeof window !== "undefined") {
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${normalizedRecipient}?text=${encodedMessage}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      return { via: "whatsapp-link", ok: true };
    }

    return { via: "skipped", ok: false, reason: "no-window-context" };
  } catch (err) {
    console.error("Failed to send reminder", err);
    return { via: shouldUseWebhook ? "webhook" : "whatsapp-link", ok: false, reason: "exception" };
  }
};
