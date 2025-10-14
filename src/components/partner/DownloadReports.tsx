import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, FileText, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBatches, useCustomers, useDeleteBatch, useTransactions } from "@/lib/hooks";
import { formatReadableDate } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
});

const formatCurrencyValue = (value?: number | null) =>
  value != null ? currencyFormatter.format(value) : "—";

const formatQuantityValue = (value?: number | null) =>
  value != null ? quantityFormatter.format(value) : "—";

const excelTemplateOptions = [
  {
    value: "comprehensive",
    label: "Comprehensive Overview",
    description: "Tea stock, customer summary, daily collections, and ledgers.",
  },
  {
    value: "teaStock",
    label: "Tea Stock Ledger",
    description: "Inventory-focused sheet with batch history and valuations.",
  },
  {
    value: "customerSummary",
    label: "Customer Snapshot",
    description: "Per-customer quantity, billing, payments, and outstanding dues.",
  },
  {
    value: "dailyCollections",
    label: "Daily Collections",
    description: "Day-wise inflow tracker consolidating all receipts.",
  },
  {
    value: "ledger",
    label: "Customer Ledger",
    description: "Transaction-level ledger with running balances.",
  },
] as const;

type ExcelTemplateOption = (typeof excelTemplateOptions)[number]["value"];

const truncateDescription = (value: string, limit = 110) =>
  value.length > limit ? `${value.slice(0, limit).trimEnd()}…` : value;

const asExcelNumber = (value: number | null | undefined) =>
  typeof value === "number" && !Number.isNaN(value)
    ? Number(value.toFixed(2))
    : "";

const sanitizeSheetName = (value: string) =>
  value.replace(/[\/?*\[\]:]/g, "").slice(0, 28) || "Sheet";

interface SheetFactoryOptions {
  columnWidths?: number[];
  emptyMessage?: string;
}

const createSheetFactory = (
  XLSX: any,
  meta: { scopeLabel: string; templateLabel: string; generatedAtISO: string }
) => {
  const encodeCell = XLSX.utils.encode_cell;
  return (
    title: string,
    headers: string[],
    rows: (string | number)[][],
    options?: SheetFactoryOptions
  ) => {
    const columnCount = headers.length;
    const metadataRows = [
      [title],
      [`Scope: ${meta.scopeLabel}`],
      [`Template: ${meta.templateLabel}`],
      [`Generated: ${formatReadableDate(meta.generatedAtISO)}`],
      [],
    ];

    const safeRows =
      rows.length > 0
        ? rows
        : [
            [
              options?.emptyMessage ?? "No records available",
              ...Array(Math.max(columnCount - 1, 0)).fill(""),
            ],
          ];

    const worksheetAoA = [...metadataRows, headers, ...safeRows];
    const sheet: any = XLSX.utils.aoa_to_sheet(worksheetAoA);
    const lastCol = Math.max(columnCount - 1, 0);

    const merges = sheet["!merges"] ?? [];
    merges.push(
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } }
    );
    sheet["!merges"] = merges;

    const metadataStyles: Array<{ row: number; style: any }> = [
      {
        row: 0,
        style: {
          font: { bold: true, sz: 16 },
          alignment: { horizontal: "center", vertical: "center" },
        },
      },
      {
        row: 1,
        style: {
          font: { italic: true, color: { rgb: "364FC7" } },
          alignment: { horizontal: "center" },
        },
      },
      {
        row: 2,
        style: {
          alignment: { horizontal: "center" },
          font: { bold: true },
        },
      },
      {
        row: 3,
        style: {
          alignment: { horizontal: "center" },
          font: { color: { rgb: "6C757D" } },
        },
      },
    ];

    metadataStyles.forEach(({ row, style }) => {
      const ref = encodeCell({ r: row, c: 0 });
      const cell = sheet[ref];
      if (cell) {
        cell.s = {
          ...(cell.s || {}),
          ...style,
        };
      }
    });

    const headerRowIndex = metadataRows.length;
    for (let c = 0; c <= lastCol; c++) {
      const ref = encodeCell({ r: headerRowIndex, c });
      const cell = sheet[ref];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1C7ED6" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "1C7ED6" } },
            bottom: { style: "thin", color: { rgb: "1C7ED6" } },
          },
        };
      }
    }

    sheet["!cols"] = options?.columnWidths
      ? options.columnWidths.map((wch) => ({ wch }))
      : Array.from({ length: columnCount }, () => ({ wch: 20 }));

    return sheet;
  };
};

interface DownloadReportsProps {
  onBack?: () => void;
}

// customers loaded from Supabase

const DownloadReports = ({ onBack }: DownloadReportsProps) => {
  const { toast } = useToast();
  const { data: customers } = useCustomers();
  const { data: transactions } = useTransactions();
  const { data: batches } = useBatches();
  const deleteBatchMutation = useDeleteBatch();
  const [reportType, setReportType] = useState<"all" | "specific">("all");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [format, setFormat] = useState<"pdf" | "excel">("excel");
  const [excelTemplate, setExcelTemplate] = useState<ExcelTemplateOption>("comprehensive");
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeBatchDownloadId, setActiveBatchDownloadId] = useState<string | null>(null);
  const [activeBatchDeleteId, setActiveBatchDeleteId] = useState<string | null>(null);

  const allCustomers = useMemo(() => (customers as any[]) || [], [customers]);
  const allTransactions = useMemo(() => (transactions as any[]) || [], [transactions]);
  const allBatches = useMemo(() => (batches as any[]) || [], [batches]);

  const customerLookup = useMemo(() => {
    const map = new Map<string, any>();
    allCustomers.forEach((customer) => {
      if (customer?.id) {
        map.set(customer.id, customer);
      }
    });
    return map;
  }, [allCustomers]);

  const sortedBatches = useMemo(() => {
    return [...allBatches].sort((a, b) => {
      const dateA = new Date(a?.created_at ?? 0).getTime();
      const dateB = new Date(b?.created_at ?? 0).getTime();
      if (!Number.isFinite(dateA) || !Number.isFinite(dateB)) {
        return (a?.name || "").localeCompare(b?.name || "");
      }
      return dateB - dateA;
    });
  }, [allBatches]);

  const selectedTemplateMeta = useMemo(() => {
    return (
      excelTemplateOptions.find((option) => option.value === excelTemplate) ?? null
    );
  }, [excelTemplate]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 5000);
  };

  type TeaStockRow = {
    teaName: string;
    batchName: string;
    purchaseDate: string | null;
    purchaseRate: number;
    quantityPurchased: number;
    totalCost: number;
    remainingQuantity: number;
    teaTotalQuantity: number | null;
    teaTotalCost: number | null;
  };

  type CustomerSummaryRow = {
    customerId: string;
    customerName: string;
    shopName: string;
    totalQuantity: number;
    averageRate: number;
    totalBill: number;
    totalPaid: number;
    outstanding: number;
  };

  type LedgerRow = {
    customerId: string;
    customerName: string;
    shopName: string;
    date: string;
    teaName: string;
    typeLabel: string;
    quantity: number | null;
    rate: number | null;
    debit: number;
    credit: number;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    runningBalance: number;
    statusLabel: string;
    dueDate: string | null;
  };

  type DailyCollectionRow = {
    date: string;
    dayLabel: string;
    amountCollected: number;
    entries: number;
  };

  const buildReportData = () => {
    const selectedIds = (reportType === "all"
      ? allCustomers.map((c) => c.id)
      : [selectedCustomer]
    ).filter(Boolean);

    const selectedSet = new Set(selectedIds);

    const targetCustomers = allCustomers
      .filter((customer) => selectedSet.has(customer.id))
      .sort((a, b) => {
        const nameA = (a.full_name || a.shop_name || "").toLowerCase();
        const nameB = (b.full_name || b.shop_name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

    const targetTransactions = allTransactions.filter(
      (txn) => txn?.customer_id && selectedSet.has(txn.customer_id)
    );

    const dailyCollectionMap = new Map<
      string,
      { amountCollected: number; entries: number; dateISO: string; dayLabel: string }
    >();

    targetTransactions.forEach((txn: any) => {
      const createdAt = txn?.created_at;
      if (!createdAt) return;

      const txnDate = new Date(createdAt);
      if (Number.isNaN(txnDate.getTime())) return;

      const key = txnDate.toISOString().slice(0, 10);
      const type = (txn?.type || "").toString().toLowerCase();
      const amount = Number(txn?.amount ?? 0);
      const paidAmount = Number(txn?.paid_amount ?? 0);

      const credit =
        type === "payment"
          ? Math.abs(amount || paidAmount)
          : Math.max(paidAmount, 0);

      if (!credit || credit <= 0) return;

      const existing = dailyCollectionMap.get(key);
      if (existing) {
        existing.amountCollected += credit;
        existing.entries += 1;
        if (txnDate > new Date(existing.dateISO)) {
          existing.dateISO = txnDate.toISOString();
          existing.dayLabel = dayFormatter.format(txnDate);
        }
      } else {
        dailyCollectionMap.set(key, {
          amountCollected: credit,
          entries: 1,
          dateISO: txnDate.toISOString(),
          dayLabel: dayFormatter.format(txnDate),
        });
      }
    });

    const dailyCollectionRows: DailyCollectionRow[] = Array.from(
      dailyCollectionMap.entries()
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, entry]) => ({
        date: entry.dateISO,
        dayLabel: entry.dayLabel,
        amountCollected: entry.amountCollected,
        entries: entry.entries,
      }));

    const teaGroups = new Map<
      string,
      { teaName: string; batches: any[]; totalQuantity: number; totalCost: number }
    >();

    allBatches.forEach((batch: any) => {
      const teaName = (batch?.name || "Tea Blend").toString();
      const group = teaGroups.get(teaName) || {
        teaName,
        batches: [] as any[],
        totalQuantity: 0,
        totalCost: 0,
      };

      const quantity = Number(batch?.total_quantity ?? 0);
      const rate = Number(batch?.purchase_rate ?? 0);
      const totalCost = quantity * rate;

      group.totalQuantity += quantity;
      group.totalCost += totalCost;
      group.batches.push(batch);
      teaGroups.set(teaName, group);
    });

    const teaStockRows: TeaStockRow[] = [];

    Array.from(teaGroups.values())
      .sort((a, b) => a.teaName.localeCompare(b.teaName))
      .forEach((group) => {
        const sortedBatches = group.batches.sort(
          (a, b) =>
            new Date(a?.created_at ?? 0).getTime() -
            new Date(b?.created_at ?? 0).getTime()
        );

        if (sortedBatches.length === 0) {
          teaStockRows.push({
            teaName: group.teaName,
            batchName: group.teaName,
            purchaseDate: null,
            purchaseRate: 0,
            quantityPurchased: 0,
            totalCost: 0,
            remainingQuantity: 0,
            teaTotalQuantity: group.totalQuantity,
            teaTotalCost: group.totalCost,
          });
        }

        sortedBatches.forEach((batch: any, index: number) => {
          const quantity = Number(batch?.total_quantity ?? 0);
          const rate = Number(batch?.purchase_rate ?? 0);
          const totalCost = quantity * rate;
          const remaining = Number(batch?.remaining_quantity ?? 0);

          teaStockRows.push({
            teaName: group.teaName,
            batchName: batch?.label || batch?.name || group.teaName,
            purchaseDate: batch?.created_at ?? null,
            purchaseRate: rate,
            quantityPurchased: quantity,
            totalCost,
            remainingQuantity: remaining,
            teaTotalQuantity: index === 0 ? group.totalQuantity : null,
            teaTotalCost: index === 0 ? group.totalCost : null,
          });
        });
      });

    const summaryMap = new Map<
      string,
      { totalQuantity: number; totalAmount: number; totalPaid: number; balance: number }
    >();

    targetCustomers.forEach((customer) => {
      summaryMap.set(customer.id, {
        totalQuantity: 0,
        totalAmount: 0,
        totalPaid: 0,
        balance: 0,
      });
    });

    targetTransactions.forEach((txn: any) => {
      const customerId = txn?.customer_id;
      if (!customerId || !summaryMap.has(customerId)) return;

      const entry = summaryMap.get(customerId)!;
      const type = (txn?.type || "").toString().toLowerCase();
      const amount = Number(txn?.amount ?? 0);
      const paidAmount = Number(txn?.paid_amount ?? 0);
      const balance = Number(txn?.balance ?? 0);

      if (type === "payment") {
        const credit = Math.abs(amount || paidAmount);
        entry.totalPaid += credit;
        entry.balance += balance;
        return;
      }

      const quantity = Number(txn?.quantity ?? 0);
      entry.totalQuantity += quantity;
      entry.totalAmount += amount;
      entry.totalPaid += paidAmount;
      entry.balance += balance;
    });

    const customerSummaryRows: CustomerSummaryRow[] = targetCustomers.map((customer) => {
      const entry =
        summaryMap.get(customer.id) || {
          totalQuantity: 0,
          totalAmount: 0,
          totalPaid: 0,
          balance: 0,
        };

      const outstandingFromTransactions = Math.max(entry.balance, 0);
      const fallbackOutstanding = Number(customer?.outstanding_balance ?? 0);
      const outstanding = Math.max(outstandingFromTransactions, fallbackOutstanding);

      const averageRate =
        entry.totalQuantity > 0 ? entry.totalAmount / entry.totalQuantity : 0;

      return {
        customerId: customer.id,
        customerName: customer.full_name || customer.name || "Customer",
        shopName: customer.shop_name || customer.shop || "—",
        totalQuantity: entry.totalQuantity,
        averageRate,
        totalBill: entry.totalAmount,
        totalPaid: entry.totalPaid,
        outstanding,
      };
    });

    customerSummaryRows.sort((a, b) =>
      a.customerName.localeCompare(b.customerName)
    );

    const ledgerRows: LedgerRow[] = [];
    const ledgerByCustomer: { customer: any; rows: LedgerRow[] }[] = [];

    targetCustomers.forEach((customer) => {
      const txnsForCustomer = targetTransactions
        .filter((txn) => txn.customer_id === customer.id)
        .sort(
          (a, b) =>
            new Date(a?.created_at ?? 0).getTime() -
            new Date(b?.created_at ?? 0).getTime()
        );

      let runningBalance = 0;
      const customerRows: LedgerRow[] = [];

      txnsForCustomer.forEach((txn: any) => {
        const type = (txn?.type || "").toString().toLowerCase();
        const isPayment = type === "payment";
        const amount = Number(txn?.amount ?? 0);
        const paidAmount = Number(txn?.paid_amount ?? 0);
        const quantity = !isPayment ? Number(txn?.quantity ?? 0) : null;
        const debit = isPayment ? 0 : amount;
        const credit = isPayment ? Math.abs(amount || paidAmount) : Math.max(paidAmount, 0);
        const rate =
          quantity && quantity !== 0 ? amount / quantity : null;
        const perTxnBalance = Math.max(Number(txn?.balance ?? 0), 0);
        const dueDate = txn?.due_date ?? null;

        const nextRunning = runningBalance + (debit - credit);
        const positiveOutstanding = Math.max(nextRunning, 0);

        const statusLabel = isPayment
          ? `Payment Received ₹${credit.toFixed(2)}`
          : positiveOutstanding > 0
          ? `Partial – Due ₹${positiveOutstanding.toFixed(2)}`
          : "Full Payment";

        const row: LedgerRow = {
          customerId: customer.id,
          customerName: customer.full_name || customer.name || "Customer",
          shopName: customer.shop_name || customer.shop || "—",
          date: txn?.created_at || new Date().toISOString(),
          teaName: txn?.tea_name || "—",
          typeLabel: isPayment
            ? "Payment"
            : type === "partial"
            ? "Sale (Partial)"
            : "Sale",
          quantity,
          rate,
          debit,
          credit,
          totalAmount: amount,
          paidAmount: credit,
          balance: perTxnBalance,
          runningBalance: nextRunning,
          statusLabel,
          dueDate,
        };

        runningBalance = nextRunning;
        customerRows.push(row);
      });

      ledgerRows.push(...customerRows);
      ledgerByCustomer.push({ customer, rows: customerRows });
    });

    return {
      targetCustomers,
      targetTransactions,
      teaStockRows,
      customerSummaryRows,
      ledgerRows,
      ledgerByCustomer,
      dailyCollectionRows,
    };
  };

  const handleDownloadBatch = async (batch: any) => {
    if (!batch?.id) {
      toast({
        title: "Select a batch",
        description: "Unable to download because this batch record is incomplete.",
        variant: "destructive",
      });
      return;
    }

    setActiveBatchDownloadId(batch.id);

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const scopeLabel = batch.name || batch.label || "Tea Batch";
      const templateLabel = "Tea Batch Detail";
      const generatedAtISO = new Date().toISOString();
      const createStyledSheet = createSheetFactory(XLSX, {
        scopeLabel,
        templateLabel,
        generatedAtISO,
      });

      const transactionsForBatch = allTransactions
        .filter((txn) => txn?.batch_id && txn.batch_id === batch.id)
        .sort((a, b) => {
          const dateA = new Date(a?.created_at ?? 0).getTime();
          const dateB = new Date(b?.created_at ?? 0).getTime();
          return dateA - dateB;
        });

      const saleTransactions = transactionsForBatch.filter(
        (txn) => (txn?.type || "").toString().toLowerCase() !== "payment"
      );

      const totalQuantitySold = saleTransactions.reduce(
        (acc, txn) => acc + Number(txn?.quantity ?? 0),
        0
      );
      const totalInvoiceValue = saleTransactions.reduce(
        (acc, txn) => acc + Number(txn?.amount ?? 0),
        0
      );

      let totalCollected = 0;
      transactionsForBatch.forEach((txn) => {
        const type = (txn?.type || "").toString().toLowerCase();
        const amount = Number(txn?.amount ?? 0);
        const paidAmount = Number(txn?.paid_amount ?? 0);
        const credit =
          type === "payment"
            ? Math.abs(amount || paidAmount)
            : Math.max(paidAmount, 0);
        if (credit > 0) totalCollected += credit;
      });

      const averageRate = totalQuantitySold > 0 ? totalInvoiceValue / totalQuantitySold : 0;
      const outstanding = Math.max(totalInvoiceValue - totalCollected, 0);

      const summaryRows: (string | number)[][] = [
        ["Batch Name", batch.name || "—"],
        ["Batch Label", batch.label || "—"],
        [
          "Created On",
          batch?.created_at ? formatReadableDate(batch.created_at) : "—",
        ],
        ["Purchase Rate (₹/kg)", asExcelNumber(Number(batch?.purchase_rate ?? 0))],
        ["Total Quantity Purchased (kg)", asExcelNumber(Number(batch?.total_quantity ?? 0))],
        ["Remaining Quantity (kg)", asExcelNumber(Number(batch?.remaining_quantity ?? 0))],
        ["Quantity Sold (kg)", asExcelNumber(totalQuantitySold)],
        ["Average Selling Rate (₹/kg)", asExcelNumber(averageRate)],
        ["Gross Invoice (₹)", asExcelNumber(totalInvoiceValue)],
        ["Cash Collected (₹)", asExcelNumber(totalCollected)],
        ["Outstanding (₹)", asExcelNumber(outstanding)],
      ];

      const overviewSheet = createStyledSheet(
        "Batch Overview",
        ["Metric", "Value"],
        summaryRows,
        {
          columnWidths: [30, 24],
        }
      );
      XLSX.utils.book_append_sheet(
        workbook,
        overviewSheet,
        sanitizeSheetName(`${batch.name || "Batch"}_Overview`)
      );

      type CustomerAccumulator = {
        customerId: string;
        customerName: string;
        shopName: string;
        quantity: number;
        invoice: number;
        paid: number;
      };

      const customerMap = new Map<string, CustomerAccumulator>();

      transactionsForBatch.forEach((txn) => {
        const customerId = txn?.customer_id;
        if (!customerId) return;

        const customer = customerLookup.get(customerId);
        const customerName =
          customer?.full_name || customer?.name || txn?.customer_name || "Customer";
        const shopName = customer?.shop_name || customer?.shop || "—";

        const entry =
          customerMap.get(customerId) ||
          ({
            customerId,
            customerName,
            shopName,
            quantity: 0,
            invoice: 0,
            paid: 0,
          } as CustomerAccumulator);

        const type = (txn?.type || "").toString().toLowerCase();
        const amount = Number(txn?.amount ?? 0);
        const qty = Number(txn?.quantity ?? 0);
        const paidAmount = Number(txn?.paid_amount ?? 0);
        const credit =
          type === "payment"
            ? Math.abs(amount || paidAmount)
            : Math.max(paidAmount, 0);

        if (type !== "payment") {
          entry.quantity += qty;
          entry.invoice += amount;
        }

        if (credit > 0) {
          entry.paid += credit;
        }

        customerMap.set(customerId, entry);
      });

      const customerRows = Array.from(customerMap.values())
        .sort((a, b) => a.customerName.localeCompare(b.customerName))
        .map((entry) => [
          entry.customerName,
          entry.shopName,
          asExcelNumber(entry.quantity),
          asExcelNumber(entry.invoice),
          asExcelNumber(entry.paid),
          asExcelNumber(Math.max(entry.invoice - entry.paid, 0)),
        ]);

      const customerSheet = createStyledSheet(
        "Customer Impact",
        [
          "Customer",
          "Shop / Business",
          "Quantity Sold (kg)",
          "Invoice (₹)",
          "Paid (₹)",
          "Outstanding (₹)",
        ],
        customerRows,
        {
          columnWidths: [26, 26, 20, 20, 20, 20],
          emptyMessage: "No customer transactions for this batch",
        }
      );
      XLSX.utils.book_append_sheet(
        workbook,
        customerSheet,
        sanitizeSheetName(`${batch.name || "Batch"}_Customers`)
      );

      const transactionRows = transactionsForBatch.map((txn) => {
        const type = (txn?.type || "").toString().toLowerCase();
        const isPayment = type === "payment";
        const amount = Number(txn?.amount ?? 0);
        const qty = Number(txn?.quantity ?? 0);
        const paidAmount = Number(txn?.paid_amount ?? 0);
        const credit =
          isPayment ? Math.abs(amount || paidAmount) : Math.max(paidAmount, 0);
        const rate = !isPayment && qty !== 0 ? amount / qty : null;
        const outstandingTxn = Math.max(Number(txn?.balance ?? 0), 0);
        const customer = customerLookup.get(txn?.customer_id);
        const customerName =
          customer?.full_name || customer?.name || txn?.customer_name || "Customer";

        const statusLabel = isPayment
          ? `Payment Received ₹${credit.toFixed(2)}`
          : outstandingTxn > 0
          ? `Due ₹${outstandingTxn.toFixed(2)}`
          : "Fully Paid";

        return [
          txn?.created_at ? formatReadableDate(txn.created_at) : "—",
          customerName,
          isPayment ? "Payment" : type === "partial" ? "Sale (Partial)" : "Sale",
          !isPayment ? asExcelNumber(qty) : "",
          !isPayment && rate != null ? asExcelNumber(rate) : "",
          asExcelNumber(amount),
          asExcelNumber(credit),
          asExcelNumber(outstandingTxn),
          statusLabel,
        ];
      });

      const transactionsSheet = createStyledSheet(
        "Batch Transactions",
        [
          "Date",
          "Customer",
          "Type",
          "Quantity (kg)",
          "Rate (₹/kg)",
          "Invoice (₹)",
          "Paid (₹)",
          "Balance (₹)",
          "Status",
        ],
        transactionRows,
        {
          columnWidths: [20, 24, 18, 18, 18, 18, 18, 18, 28],
          emptyMessage: "No transactions recorded for this batch",
        }
      );
      XLSX.utils.book_append_sheet(
        workbook,
        transactionsSheet,
        sanitizeSheetName(`${batch.name || "Batch"}_Transactions`)
      );

      const batchSlug = (batch?.label || batch?.name || "batch")
        .toString()
        .trim()
        .replace(/\s+/g, "_")
        .toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:]/g, "-");
      const filename = `batch_${batchSlug}_${timestamp}.xlsx`;

      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob(blob, filename);

      toast({
        title: "Batch report ready",
        description: `Saved ${filename} with overview, customer impact, and transactions.`,
      });
    } catch (error: any) {
      console.error("Failed to generate batch report", error);
      toast({
        title: "Batch download failed",
        description:
          error?.message || "Unable to build the batch report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActiveBatchDownloadId(null);
    }
  };

  const handleDeleteBatch = async (batch: any) => {
    if (!batch?.id) return;

    const confirmDelete = window.confirm(
      `Delete batch “${batch.name || batch.label || "Unnamed Batch"}”? This will detach related transactions. This action cannot be undone.`
    );
    if (!confirmDelete) return;

    setActiveBatchDeleteId(batch.id);
    try {
      await deleteBatchMutation.mutateAsync(batch.id);
      toast({
        title: "Batch removed",
        description: `${batch.name || batch.label || "Batch"} has been deleted.`,
      });
    } catch (error: any) {
      console.error("Failed to delete batch", error);
      toast({
        title: "Delete failed",
        description: error?.message || "We couldn't delete the batch. Please retry.",
        variant: "destructive",
      });
    } finally {
      setActiveBatchDeleteId(null);
    }
  };

  const handleDownload = async () => {
    if (reportType === "specific" && !selectedCustomer) {
      toast({
        title: "Select Customer",
        description: "Please select a customer for the report.",
        variant: "destructive",
      });
      return;
    }

    if (allCustomers.length === 0) {
      toast({
        title: "No data available",
        description: "Add customers before generating reports.",
        variant: "destructive",
      });
      return;
    }

    const {
      targetCustomers,
      teaStockRows,
      customerSummaryRows,
      ledgerRows,
      ledgerByCustomer,
      dailyCollectionRows,
    } = buildReportData();

    if (targetCustomers.length === 0) {
      toast({
        title: "No matching customers",
        description: "We couldn't find data for the selected criteria.",
        variant: "destructive",
      });
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:]/g, "-");
    const primaryCustomer = targetCustomers[0];
    const primaryName =
      primaryCustomer?.full_name || primaryCustomer?.shop_name || "customer";
    const reportLabel =
      reportType === "all"
        ? "all_customers"
        : primaryName.replace(/\s+/g, "_").toLowerCase();

    try {
      setIsDownloading(true);

      const scopeLabel = reportType === "all" ? "All Customers" : primaryName;
      const templateMeta =
        excelTemplateOptions.find((option) => option.value === excelTemplate) ??
        excelTemplateOptions[0];
      const templateLabel = templateMeta.label;
      const generatedAtISO = new Date().toISOString();

      const includeTeaStock = excelTemplate === "comprehensive" || excelTemplate === "teaStock";
      const includeCustomerSummary =
        excelTemplate === "comprehensive" || excelTemplate === "customerSummary";
      const includeDailyCollections =
        excelTemplate === "comprehensive" || excelTemplate === "dailyCollections";
      const includeLedger = excelTemplate === "comprehensive" || excelTemplate === "ledger";

      if (format === "excel") {
        const XLSX = await import("xlsx");
        const workbook = XLSX.utils.book_new();
        const appendedSheets: string[] = [];

        const createStyledSheet = createSheetFactory(XLSX, {
          scopeLabel,
          templateLabel,
          generatedAtISO,
        });

        const teaStockHeader = [
          "Tea Name",
          "Batch / Lot",
          "Purchase Date",
          "Purchase Rate (₹/kg)",
          "Quantity Purchased (kg)",
          "Total Cost (₹)",
          "Remaining Quantity (kg)",
          "Tea Total Quantity (kg)",
          "Tea Total Value (₹)",
        ];
        const summaryHeader = [
          "Customer",
          "Shop / Business",
          "Total Quantity (kg)",
          "Average Rate (₹/kg)",
          "Total Bill (₹)",
          "Total Paid (₹)",
          "Outstanding (₹)",
        ];
        const dailyCollectionsHeader = ["Date", "Day", "Collections (₹)", "Entries"];
        const ledgerHeader = [
          "Customer",
          "Shop",
          "Date",
          "Tea Name",
          "Type",
          "Quantity (kg)",
          "Rate (₹/kg)",
          "Debit (₹)",
          "Credit (₹)",
          "Running Balance (₹)",
          "Status",
          "Due Date",
        ];

        if (includeTeaStock) {
          const rows = teaStockRows.map((row) => [
            row.teaName,
            row.batchName,
            row.purchaseDate ? formatReadableDate(row.purchaseDate) : "—",
            asExcelNumber(row.purchaseRate),
            asExcelNumber(row.quantityPurchased),
            asExcelNumber(row.totalCost),
            asExcelNumber(row.remainingQuantity),
            row.teaTotalQuantity != null ? asExcelNumber(row.teaTotalQuantity) : "",
            row.teaTotalCost != null ? asExcelNumber(row.teaTotalCost) : "",
          ]);

          const sheet = createStyledSheet("Tea Stock Overview", teaStockHeader, rows, {
            columnWidths: [22, 20, 18, 18, 18, 18, 18, 18, 18],
            emptyMessage: "No tea stock records available",
          });
          XLSX.utils.book_append_sheet(workbook, sheet, "Tea Stock");
          appendedSheets.push("Tea Stock");
        }

        if (includeCustomerSummary) {
          const rows = customerSummaryRows.map((row) => [
            row.customerName,
            row.shopName,
            asExcelNumber(row.totalQuantity),
            asExcelNumber(row.averageRate),
            asExcelNumber(row.totalBill),
            asExcelNumber(row.totalPaid),
            asExcelNumber(row.outstanding),
          ]);

          const sheet = createStyledSheet("Customer Summary", summaryHeader, rows, {
            columnWidths: [26, 26, 18, 18, 18, 18, 18],
            emptyMessage: "No customer activity recorded",
          });
          XLSX.utils.book_append_sheet(workbook, sheet, "Customer Summary");
          appendedSheets.push("Customer Summary");
        }

        if (includeDailyCollections) {
          const rows = dailyCollectionRows.map((row) => [
            formatReadableDate(row.date),
            row.dayLabel,
            asExcelNumber(row.amountCollected),
            row.entries,
          ]);

          const sheet = createStyledSheet("Daily Collections", dailyCollectionsHeader, rows, {
            columnWidths: [20, 20, 20, 14],
            emptyMessage: "No collections recorded",
          });
          XLSX.utils.book_append_sheet(workbook, sheet, "Daily Collections");
          appendedSheets.push("Daily Collections");
        }

        if (includeLedger) {
          const rows = ledgerRows.map((row) => [
            row.customerName,
            row.shopName,
            formatReadableDate(row.date),
            row.teaName,
            row.typeLabel,
            row.quantity != null ? asExcelNumber(row.quantity) : "",
            row.rate != null ? asExcelNumber(row.rate) : "",
            asExcelNumber(row.debit),
            asExcelNumber(row.credit),
            asExcelNumber(row.runningBalance),
            row.statusLabel,
            row.dueDate ? formatReadableDate(row.dueDate) : "—",
          ]);

          const sheet = createStyledSheet("Customer Ledger", ledgerHeader, rows, {
            columnWidths: [26, 24, 20, 22, 18, 18, 18, 18, 18, 22, 22, 18],
            emptyMessage: "No ledger entries available",
          });
          XLSX.utils.book_append_sheet(workbook, sheet, "Customer Ledger");
          appendedSheets.push("Customer Ledger");

          if (reportType === "specific" && ledgerByCustomer.length > 0) {
            const focused = ledgerByCustomer[0];
            const focusRows = focused.rows.map((row) => [
              row.customerName,
              row.shopName,
              formatReadableDate(row.date),
              row.teaName,
              row.typeLabel,
              row.quantity != null ? asExcelNumber(row.quantity) : "",
              row.rate != null ? asExcelNumber(row.rate) : "",
              asExcelNumber(row.debit),
              asExcelNumber(row.credit),
              asExcelNumber(row.runningBalance),
              row.statusLabel,
              row.dueDate ? formatReadableDate(row.dueDate) : "—",
            ]);

            const specificSheet = createStyledSheet(
              `${focused.customer.full_name || focused.customer.shop_name || "Customer"} – Balance Sheet`,
              ledgerHeader,
              focusRows,
              {
                columnWidths: [26, 24, 20, 22, 18, 18, 18, 18, 18, 22, 22, 18],
                emptyMessage: "No ledger entries available",
              }
            );
            const sheetName = sanitizeSheetName(`Balance_${primaryName}`);
            XLSX.utils.book_append_sheet(workbook, specificSheet, sheetName);
            appendedSheets.push(sheetName);
          }
        }

        if (appendedSheets.length === 0) {
          const fallbackSheet = createStyledSheet(
            "Summary",
            ["Notice"],
            [],
            { emptyMessage: "No data available for the selected template." }
          );
          XLSX.utils.book_append_sheet(workbook, fallbackSheet, "Summary");
          appendedSheets.push("Summary");
        }

        const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const filename = `report_${reportLabel}_${timestamp}.xlsx`;
        downloadBlob(blob, filename);

        const sheetSummary = appendedSheets.join(", ");
        toast({
          title: "Excel report ready",
          description: `Saved ${filename} using the ${templateLabel} template (${sheetSummary}).`,
        });
      } else {
        const [jsPDFModule, autoTableModule] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);

        const jsPDFConstructor = jsPDFModule.jsPDF || (jsPDFModule as any).default;
        const autoTableFn = (autoTableModule as any).default || (autoTableModule as any).autoTable;

        if (!jsPDFConstructor) {
          throw new Error("PDF generator failed to load.");
        }
        if (!autoTableFn) {
          throw new Error("PDF table helper failed to load.");
        }

        const doc = new jsPDFConstructor({ orientation: "landscape" });
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFontSize(16);
        doc.text("Chai Chronicle Hub Report", 14, 20);
        doc.setFontSize(11);
        doc.text(
          `Generated: ${formatReadableDate(new Date().toISOString())}`,
          14,
          28
        );
        doc.text(
          `Scope: ${reportType === "all" ? "All Customers" : primaryName}`,
          14,
          34
        );

        let cursorY = 42;
        const headStyles = { fillColor: [33, 37, 41], textColor: 255 };

        const ensureSpace = (height: number) => {
          if (cursorY + height > pageHeight - 20) {
            doc.addPage("landscape");
            cursorY = 20;
          }
        };

        doc.setFontSize(13);
        const pdfSectionsRendered: string[] = [];

        if (includeTeaStock) {
          doc.setFontSize(13);
          doc.text("Tea Stock Overview", 14, cursorY);
          cursorY += 4;

          autoTableFn(doc, {
            startY: cursorY,
            head: [
              [
                "Tea Name",
                "Batch / Lot",
                "Purchase Date",
                "Rate (₹/kg)",
                "Qty (kg)",
                "Total (₹)",
                "Remaining (kg)",
                "Group Qty (kg)",
                "Group Value (₹)",
              ],
            ],
            body:
              teaStockRows.length > 0
                ? teaStockRows.map((row) => [
                    row.teaName,
                    row.batchName,
                    row.purchaseDate
                      ? formatReadableDate(row.purchaseDate)
                      : "—",
                    formatCurrencyValue(row.purchaseRate),
                    formatQuantityValue(row.quantityPurchased),
                    formatCurrencyValue(row.totalCost),
                    formatQuantityValue(row.remainingQuantity),
                    row.teaTotalQuantity != null
                      ? formatQuantityValue(row.teaTotalQuantity)
                      : "",
                    row.teaTotalCost != null
                      ? formatCurrencyValue(row.teaTotalCost)
                      : "",
                  ])
                : [["—", "—", "—", "—", "—", "—", "—", "—", "—"]],
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles,
          });

          pdfSectionsRendered.push("Tea Stock");

          cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
          cursorY += 10;
          ensureSpace(40);
        }

        if (includeCustomerSummary) {
          doc.setFontSize(13);
          doc.text("Customer Summary", 14, cursorY);
          cursorY += 4;

          autoTableFn(doc, {
            startY: cursorY,
            head: [
              [
                "Customer",
                "Shop",
                "Total Qty (kg)",
                "Avg Rate (₹/kg)",
                "Total Bill (₹)",
                "Total Paid (₹)",
                "Outstanding (₹)",
              ],
            ],
            body:
              customerSummaryRows.length > 0
                ? customerSummaryRows.map((row) => [
                    row.customerName,
                    row.shopName,
                    formatQuantityValue(row.totalQuantity),
                    formatCurrencyValue(row.averageRate),
                    formatCurrencyValue(row.totalBill),
                    formatCurrencyValue(row.totalPaid),
                    formatCurrencyValue(row.outstanding),
                  ])
                : [["—", "—", "—", "—", "—", "—", "—"]],
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles,
          });

          pdfSectionsRendered.push("Customer Summary");

          cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 10;
          cursorY += 10;
        }

        if (includeDailyCollections) {
          ensureSpace(30);

          doc.setFontSize(13);
          doc.text("Daily Collections", 14, cursorY);
          cursorY += 4;

          autoTableFn(doc, {
            startY: cursorY,
            head: [["Date", "Day", "Collections (₹)", "Entries"]],
            body:
              dailyCollectionRows.length > 0
                ? dailyCollectionRows.map((row) => [
                    formatReadableDate(row.date),
                    row.dayLabel,
                    formatCurrencyValue(row.amountCollected),
                    row.entries.toString(),
                  ])
                : [["—", "—", "—", "—"]],
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles,
          });

          pdfSectionsRendered.push("Daily Collections");

          cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 8;
          cursorY += 10;
        }

        if (includeLedger) {
          let renderedLedger = false;
          ledgerByCustomer.forEach((entry) => {
            ensureSpace(50);
            doc.setFontSize(13);
            doc.text(
              `Balance Sheet – ${
                entry.customer.full_name || entry.customer.shop_name || "Customer"
              }`,
              14,
              cursorY
            );
            cursorY += 4;

            const ledgerBody =
              entry.rows.length > 0
                ? entry.rows.map((row) => [
                    formatReadableDate(row.date),
                    row.teaName,
                    row.typeLabel,
                    row.quantity != null
                      ? formatQuantityValue(row.quantity)
                      : "—",
                    row.rate != null
                      ? formatCurrencyValue(row.rate)
                      : "—",
                    formatCurrencyValue(row.debit),
                    formatCurrencyValue(row.credit),
                    formatCurrencyValue(row.runningBalance),
                    row.statusLabel,
                    row.dueDate ? formatReadableDate(row.dueDate) : "—",
                  ])
                : [["—", "—", "—", "—", "—", "—", "—", "—", "—", "—"]];

            autoTableFn(doc, {
              startY: cursorY,
              head: [
                [
                  "Date",
                  "Tea",
                  "Type",
                  "Qty (kg)",
                  "Rate (₹/kg)",
                  "Debit (₹)",
                  "Credit (₹)",
                  "Running Balance (₹)",
                  "Status",
                  "Due Date",
                ],
              ],
              body: ledgerBody,
              styles: { fontSize: 7, cellPadding: 2 },
              headStyles,
            });

            renderedLedger = true;

            cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 8;
            const customerSummary = customerSummaryRows.find(
              (row) => row.customerId === entry.customer.id
            );
            if (customerSummary) {
              doc.setFontSize(10);
              doc.text(
                `Outstanding: ${formatCurrencyValue(customerSummary.outstanding)}`,
                14,
                cursorY + 6
              );
              cursorY += 14;
            } else {
              cursorY += 10;
            }
          });

          if (renderedLedger) {
            pdfSectionsRendered.push("Customer Ledger");
          }
        }

        if (!includeTeaStock && !includeCustomerSummary && !includeDailyCollections && !includeLedger) {
          doc.setFontSize(12);
          doc.text("No sections selected for this template.", 14, cursorY);
          pdfSectionsRendered.push("Summary");
        }

        const filename = `report_${reportLabel}_${timestamp}.pdf`;
        doc.save(filename, { returnPromise: false });

        toast({
          title: "PDF report ready",
          description:
            `Downloaded ${filename} using the ${templateLabel} template (${pdfSectionsRendered.join(", ")}).`,
        });
      }
    } catch (error: any) {
      console.error("Failed to generate report", error);
      toast({
        title: "Download failed",
        description: error?.message || "Unable to build the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
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

      <Card>
        <CardHeader>
          <CardTitle>Download Reports</CardTitle>
          <CardDescription>Export customer data and transaction history</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Report Type</Label>
            <RadioGroup value={reportType} onValueChange={(value) => setReportType(value as "all" | "specific")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all-users" />
                <Label htmlFor="all-users" className="font-normal cursor-pointer">
                  All Users - Complete transaction history
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="specific" id="specific-user" />
                <Label htmlFor="specific-user" className="font-normal cursor-pointer">
                  Specific User - Individual customer report
                </Label>
              </div>
            </RadioGroup>
          </div>

          {reportType === "specific" && (
            <div className="space-y-2">
              <Label>Select Customer</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer" />
                </SelectTrigger>
                <SelectContent>
                  {(customers || []).map((customer: any) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.full_name || customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-3">
            <Label>Download Format</Label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card
                className={`cursor-pointer transition-all ${
                  format === "pdf" ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setFormat("pdf")}
              >
                <CardContent className="p-6 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-primary" />
                  <div className="font-medium">PDF</div>
                  <div className="text-xs text-muted-foreground">
                    For printing and sharing
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all ${
                  format === "excel" ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setFormat("excel")}
              >
                <CardContent className="p-6 text-center">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 text-primary" />
                  <div className="font-medium">Excel</div>
                  <div className="text-xs text-muted-foreground">
                    For data analysis
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Report Template</Label>
            <Select
              value={excelTemplate}
              onValueChange={(value) => setExcelTemplate(value as ExcelTemplateOption)}
            >
              <SelectTrigger className="h-auto min-h-[3.25rem] items-start gap-2 py-2 [&>span]:hidden">
                <div className="flex w-full flex-col text-left">
                  <span className="text-sm font-medium text-foreground">
                    {selectedTemplateMeta?.label || "Choose a template"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {selectedTemplateMeta
                      ? truncateDescription(selectedTemplateMeta.description, 70)
                      : `Select the ${format.toUpperCase()} layout you want to export.`}
                  </span>
                </div>
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent className="w-[min(92vw,22rem)] max-w-xl sm:w-auto sm:min-w-[24rem]">
                {excelTemplateOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="items-start gap-2 whitespace-normal py-2"
                  >
                    <div className="flex max-w-full flex-col text-left leading-tight">
                      <span className="text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="text-xs text-muted-foreground break-words">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {format === "pdf"
                ? "Choose the layout to generate a polished PDF report tailored to your needs."
                : "Choose the layout to generate a polished Excel workbook tailored to your needs."}
            </p>
          </div>

          <Button onClick={handleDownload} className="w-full" size="lg" disabled={isDownloading}>
            {isDownloading ? "Preparing report…" : "Download Report"}
          </Button>

          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <Label>Tea Batch Actions</Label>
              <p className="text-xs text-muted-foreground">
                Export inventories per batch or remove obsolete entries.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 divide-y">
              {sortedBatches.length > 0 ? (
                sortedBatches.map((batch: any) => {
                  const isDownloadingBatch = activeBatchDownloadId === batch.id;
                  const isDeletingBatch = activeBatchDeleteId === batch.id;
                  const purchaseDate = batch?.created_at
                    ? formatReadableDate(batch.created_at)
                    : null;
                  const remaining = Number(batch?.remaining_quantity ?? 0);
                  const totalQuantity = Number(batch?.total_quantity ?? 0);
                  const soldQuantity = Math.max(totalQuantity - remaining, 0);
                  return (
                    <div
                      key={batch.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1 sm:w-2/3">
                        <div className="text-sm font-medium text-foreground">
                          {batch?.name || batch?.label || "Tea Batch"}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <span className="font-medium text-foreground/80">Purchase</span>
                            ₹{Number(batch?.purchase_rate ?? 0).toFixed(2)}/kg
                          </span>
                          <span>
                            Remaining {remaining.toFixed(2)} kg
                          </span>
                          <span>Sold {soldQuantity.toFixed(2)} kg</span>
                          <span>Added {purchaseDate || "—"}</span>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDownloadBatch(batch)}
                          disabled={isDownloadingBatch}
                          className="w-full sm:w-auto"
                        >
                          {isDownloadingBatch ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Download
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteBatch(batch)}
                          disabled={isDeletingBatch}
                          className="w-full sm:w-auto"
                        >
                          {isDeletingBatch ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  No tea batches found. Add batches from the inventory tools to enable batch exports.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DownloadReports;
