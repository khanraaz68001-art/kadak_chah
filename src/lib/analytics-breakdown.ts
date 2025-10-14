import type { TransactionSummaryResult } from "./utils";

type MaybeArray<T = any> = T[] | null | undefined;

const buildCustomerMap = (customers?: MaybeArray): Map<string, any> => {
  const map = new Map<string, any>();
  (customers || []).forEach((customer: any) => {
    if (customer?.id) {
      map.set(customer.id, customer);
    }
  });
  return map;
};

const buildTransactionMap = (transactions?: MaybeArray): Map<string, any[]> => {
  const map = new Map<string, any[]>();
  (transactions || []).forEach((txn: any) => {
    if (!txn) return;
    const customerId = txn.customer_id || "__unknown";
    if (!map.has(customerId)) {
      map.set(customerId, []);
    }
    map.get(customerId)!.push(txn);
  });
  return map;
};

const toFiniteNumber = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const pickFirstNumber = (...values: any[]): number | null => {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

export type CollectionPayment = {
  id: string;
  amount: number;
  createdAt: string | null;
  teaName: string | null;
  quantity: number | null;
  type: string;
  saleAmount: number | null;
  balance: number | null;
  status: "full paid" | "partial paid" | "partial left";
};

export type CollectionEntry = {
  customerId: string;
  customerName: string;
  customer: any | null;
  totalPaid: number;
  payments: CollectionPayment[];
};

export type CollectionBreakdown = {
  details: CollectionEntry[];
  summary: {
    customersCount: number;
    paymentCount: number;
    totalAmount: number;
  };
};

export const buildCollectionBreakdown = (
  transactions?: MaybeArray,
  customers?: MaybeArray,
): CollectionBreakdown => {
  const customersById = buildCustomerMap(customers);
  const map = new Map<string, CollectionEntry>();

  const deriveStatus = (
    type: string,
    saleAmount: number | null,
    amountPaid: number,
    balance: number,
  ): "full paid" | "partial paid" | "partial left" => {
    const normalizedType = type.toLowerCase();
    const normalizedBalance = Number.isFinite(balance) ? balance : 0;
    const normalizedPaid = Number.isFinite(amountPaid) ? amountPaid : 0;
    const normalizedSale = Number.isFinite(saleAmount ?? NaN) ? saleAmount ?? 0 : 0;

    if (normalizedBalance <= 0) {
      return "full paid";
    }

    if (normalizedType === "payment") {
      return normalizedBalance > 0 ? "partial paid" : "full paid";
    }

    if (normalizedSale === 0 && normalizedPaid === 0) {
      return "partial left";
    }

    if (normalizedPaid > 0 && normalizedPaid < normalizedSale) {
      return "partial paid";
    }

    if (normalizedPaid >= normalizedSale && normalizedSale > 0) {
      return "full paid";
    }

    return "partial left";
  };

  (transactions || []).forEach((txn: any) => {
    if (!txn) return;
    const customerId = txn.customer_id || "__unknown";
    const type = String(txn.type || "").toLowerCase();
    const amountPaid = type === "payment" ? Number(txn.amount || 0) : Number(txn.paid_amount || 0);
    const saleAmount = type === "payment" ? Number(txn.sale_amount ?? txn.related_sale_amount ?? 0) : Number(txn.amount || 0);
    const balance = Number.isFinite(Number(txn.balance)) ? Number(txn.balance) : type === "payment" ? Number(txn.remaining_balance ?? txn.balance_after ?? 0) : Number(txn.amount || 0) - Number(txn.paid_amount || 0);
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) return;

    if (!map.has(customerId)) {
      const customer = customersById.get(customerId) ?? null;
      const name =
        customer?.full_name ||
        customer?.shop_name ||
        txn.customer_name ||
        txn.customer ||
        (customerId === "__unknown" ? "Unknown customer" : "Customer");
      map.set(customerId, {
        customerId,
        customer,
        customerName: name,
        totalPaid: 0,
        payments: [],
      });
    }

    const entry = map.get(customerId)!;
    entry.totalPaid += amountPaid;
    entry.customer = entry.customer ?? customersById.get(customerId) ?? null;
    entry.customerName =
      entry.customer?.full_name ||
      entry.customer?.shop_name ||
      txn.customer_name ||
      txn.customer ||
      entry.customerName;
    const quantity = Number.isFinite(Number(txn.quantity)) ? Number(txn.quantity) : null;
    entry.payments.push({
      id: txn.id || `${customerId}-${entry.payments.length}`,
      amount: amountPaid,
      createdAt: txn.created_at || null,
      teaName: txn.tea_name || txn.batch_name || txn.tea || null,
      quantity,
      type,
      saleAmount: Number.isFinite(saleAmount) && saleAmount > 0 ? saleAmount : null,
      balance: Number.isFinite(balance) ? balance : null,
      status: deriveStatus(type, Number.isFinite(saleAmount) ? saleAmount : null, amountPaid, Number.isFinite(balance) ? balance : 0),
    });
  });

  const details = Array.from(map.values()).map((entry) => ({
    ...entry,
    payments: entry.payments
      .slice()
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }),
  }));

  details.sort((a, b) => b.totalPaid - a.totalPaid);

  const summary = {
    customersCount: details.length,
    paymentCount: details.reduce((sum, entry) => sum + entry.payments.length, 0),
    totalAmount: details.reduce((sum, entry) => sum + entry.totalPaid, 0),
  };

  return { details, summary };
};

export type OutstandingEntry = {
  customerId: string;
  customer: any | null;
  customerName: string;
  outstanding: number;
  phone?: string | null;
  nextDue: string | null;
  lastActivity: string | null;
};

export const buildOutstandingBreakdown = (
  transactionSummary: TransactionSummaryResult,
  transactions?: MaybeArray,
  customers?: MaybeArray,
): OutstandingEntry[] => {
  const customersById = buildCustomerMap(customers);
  const transactionsByCustomer = buildTransactionMap(transactions);

  return Object.entries(transactionSummary.perCustomer || {})
    .map(([customerId, summary]) => {
      const outstanding = Math.max(Number(summary?.outstanding || 0), 0);
      if (!outstanding) return null;
      if (customerId === "__unknown") return null;

      const customer = customersById.get(customerId) ?? null;
      const txns = transactionsByCustomer.get(customerId) ?? [];
      const fallbackTxn = txns[0];
      const dueCandidates = txns.filter(
        (txn: any) => Number(txn.balance || 0) > 0 && Boolean(txn.due_date),
      );
      const nextDue =
        dueCandidates
          .slice()
          .sort(
            (a: any, b: any) =>
              new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
          )[0] || null;

      return {
        customerId,
        customer,
        customerName:
          customer?.full_name ||
          customer?.shop_name ||
          fallbackTxn?.customer_name ||
          fallbackTxn?.customer ||
          "Customer",
        outstanding,
        phone: customer?.whatsapp_number || customer?.contact || fallbackTxn?.customer_phone || null,
        nextDue: nextDue?.due_date || null,
        lastActivity: txns.length > 0 ? txns[0]?.created_at || null : null,
      } as OutstandingEntry;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.outstanding - a.outstanding);
};

export type PnlBreakdownRow = {
  id: string;
  name: string;
  soldQuantity: number;
  remainingQuantity: number;
  purchaseRate: number;
  avgSellRate: number;
  totalSaleValue: number;
  profitPerKg: number | null;
  pnl: number;
  soldAt?: string | null;
};

export type PnlBreakdown = {
  rows: PnlBreakdownRow[];
  totals: {
    pnl: number;
    soldQuantity: number;
    saleValue: number;
  };
};

export const buildPnlBreakdown = (batchPnl?: MaybeArray, transactions?: MaybeArray): PnlBreakdown => {
  const batchMap = new Map<string, any>();
  (batchPnl || []).forEach((batch: any) => {
    const id = batch?.batch_id || batch?.id;
    if (!id) return;
    batchMap.set(id, batch);
  });

  const saleRows: (PnlBreakdownRow & { soldAt?: string | null })[] = (transactions || [])
    .filter((txn: any) => {
      if (!txn) return false;
      const type = String(txn.type || "").toLowerCase();
      return type !== "payment";
    })
    .map((txn: any, index: number) => {
      const batchInfo = txn.batch_id ? batchMap.get(txn.batch_id) : null;
      const quantity = pickFirstNumber(txn.quantity, txn.qty, txn.sold_quantity) ?? 0;
      const saleAmount = pickFirstNumber(txn.amount, txn.sale_amount, txn.total_amount) ?? 0;
      const saleRateFromTxn = pickFirstNumber(txn.sale_rate, txn.price_per_kg, txn.rate_per_kg);
      const saleRate = quantity > 0 ? saleAmount / quantity : saleRateFromTxn;
      const purchaseRate = pickFirstNumber(
        txn.purchase_rate,
        batchInfo?.purchase_rate,
        batchInfo?.purchaseRate,
      ) ?? 0;
      const remainingQuantity = pickFirstNumber(
        txn.remaining_quantity,
        batchInfo?.remaining_quantity,
        batchInfo?.remainingQuantity,
      ) ?? 0;
      const explicitProfit = pickFirstNumber(
        txn.profit,
        txn.pnl,
        txn.profit_amount,
        txn.total_profit,
      );

      let profitPerKg: number | null = null;
      let totalProfit: number = 0;
      if (quantity > 0) {
        if (explicitProfit !== null) {
          totalProfit = explicitProfit;
          profitPerKg = totalProfit / quantity;
        } else if (saleRate !== null) {
          profitPerKg = saleRate - purchaseRate;
          totalProfit = profitPerKg * quantity;
        }
      } else if (explicitProfit !== null) {
        totalProfit = explicitProfit;
      }

      if (profitPerKg === null && saleRate !== null) {
        profitPerKg = saleRate - purchaseRate;
      }

      const totalSaleValue = saleAmount || (saleRate !== null && quantity > 0 ? saleRate * quantity : 0);

      return {
        id: txn.id || `${txn.batch_id || "sale"}-${index}`,
        name:
          txn.tea_name ||
          txn.batch_name ||
          batchInfo?.batch_name ||
          batchInfo?.name ||
          "Tea Sale",
        soldQuantity: quantity,
        remainingQuantity,
        purchaseRate,
        avgSellRate: saleRate ?? 0,
        totalSaleValue: Number.isFinite(totalSaleValue) ? totalSaleValue : 0,
        profitPerKg,
        pnl: Number.isFinite(totalProfit) ? totalProfit : 0,
        soldAt: txn.created_at ?? null,
      } as PnlBreakdownRow & { soldAt?: string | null };
    })
    .filter((row) => row.soldQuantity > 0 || row.pnl !== 0);

  if (saleRows.length > 0) {
    saleRows.sort((a, b) => {
      const aTime = a.soldAt ? new Date(a.soldAt).getTime() : 0;
      const bTime = b.soldAt ? new Date(b.soldAt).getTime() : 0;
      return bTime - aTime;
    });

    const totals = saleRows.reduce(
      (acc, row) => {
        acc.pnl += row.pnl;
        acc.soldQuantity += row.soldQuantity;
        acc.saleValue += row.totalSaleValue;
        return acc;
      },
      { pnl: 0, soldQuantity: 0, saleValue: 0 },
    );

    const normalizedRows: PnlBreakdownRow[] = saleRows.map(({ soldAt: _soldAt, ...rest }) => rest);
    return { rows: normalizedRows, totals };
  }

  // Fallback to batch-level aggregates if sale transactions aren't available
  const rows = (batchPnl || []).map((batch: any, index: number) => {
    const soldQuantity = pickFirstNumber(batch.sold_quantity, batch.soldQuantity) ?? 0;
    const remainingQuantity = pickFirstNumber(batch.remaining_quantity, batch.remainingQuantity) ?? 0;
    const purchaseRate = pickFirstNumber(batch.purchase_rate, batch.purchaseRate) ?? 0;
    let avgSellRate = pickFirstNumber(
      batch.avg_sale_rate,
      batch.avg_sell_rate,
      batch.avg_sale_price,
      batch.avg_selling_rate,
    );
    const explicitSaleValue = pickFirstNumber(
      batch.total_sale_value,
      batch.total_sales_amount,
      batch.total_sales_value,
      batch.sales_amount,
      batch.sale_value,
      batch.sales_value,
    );
    const pnlValue = pickFirstNumber(batch.pnl, batch.total_profit, batch.profit) ?? 0;

    if ((avgSellRate === null || avgSellRate === 0) && explicitSaleValue !== null && soldQuantity > 0) {
      avgSellRate = explicitSaleValue / soldQuantity;
    }

    const totalSaleValue = explicitSaleValue !== null
      ? explicitSaleValue
      : avgSellRate !== null && soldQuantity > 0
        ? avgSellRate * soldQuantity
        : 0;

    let profitPerKg: number | null = null;
    if (soldQuantity > 0) {
      if (Number.isFinite(pnlValue)) {
        profitPerKg = pnlValue / soldQuantity;
      } else if (avgSellRate !== null) {
        profitPerKg = avgSellRate - purchaseRate;
      }
    } else if (avgSellRate !== null) {
      profitPerKg = avgSellRate - purchaseRate;
    }

    return {
      id: batch.batch_id || batch.id || String(index),
      name: batch.batch_name || batch.name || `Batch ${index + 1}`,
      soldQuantity,
      remainingQuantity,
      purchaseRate,
      avgSellRate: avgSellRate ?? 0,
      totalSaleValue: Number.isFinite(totalSaleValue) ? totalSaleValue : 0,
      profitPerKg,
      pnl: Number.isFinite(pnlValue) ? pnlValue : 0,
    } as PnlBreakdownRow;
  });

  rows.sort((a, b) => b.pnl - a.pnl);

  const totals = rows.reduce(
    (acc, row) => {
      acc.pnl += row.pnl;
      acc.soldQuantity += row.soldQuantity;
      acc.saleValue += row.totalSaleValue;
      return acc;
    },
    { pnl: 0, soldQuantity: 0, saleValue: 0 },
  );

  return { rows, totals };
};
