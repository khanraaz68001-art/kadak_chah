import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import supabase from "./supabase";
import { useEffect, useRef } from "react";
import { normalizePhoneNumber } from "./utils";

const PARTNER_CONTACT_KEY = "partner_contact_number";

export const usePartnerContactSetting = () => {
  return useQuery<string | null>({
    queryKey: ["app_settings", PARTNER_CONTACT_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", PARTNER_CONTACT_KEY)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      const rawValue = (data?.value ?? "").trim();
      if (!rawValue) return null;

      const normalized = normalizePhoneNumber(rawValue);
      return normalized ?? rawValue;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useSavePartnerContactSetting = () => {
  const qc = useQueryClient();
  return useMutation<string | null, Error, string>({
    mutationFn: async (inputValue) => {
      const trimmed = inputValue.trim();

      if (trimmed.length === 0) {
        const { error } = await supabase
          .from("app_settings")
          .delete()
          .eq("key", PARTNER_CONTACT_KEY);
        if (error) throw error;
        return null;
      }

      const normalized = normalizePhoneNumber(trimmed);
      if (!normalized) {
        throw new Error("Please enter a valid WhatsApp number");
      }

      const { data, error } = await supabase
        .from("app_settings")
        .upsert({ key: PARTNER_CONTACT_KEY, value: normalized }, { onConflict: "key" })
        .select("value")
        .single();

      if (error) throw error;

      const stored = (data?.value ?? normalized).trim();
      return stored.length > 0 ? stored : null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings", PARTNER_CONTACT_KEY] });
    },
  });
};

export const useCustomers = () => {
  return useQuery<any[]>({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
};

export const useAddCustomer = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, any>({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.from("customers").insert(payload).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
};

export const useUpdateCustomer = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, { id: string; changes: any }>({
    mutationFn: async ({ id, changes }) => {
      const { data, error } = await supabase.from("customers").update(changes).eq("id", id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
};

export const useDeleteCustomer = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, string>({
    mutationFn: async (id: string) => {
      // First remove transactions for the customer to avoid leaving balances counted in analytics
      const { error: delTxErr } = await supabase.from("transactions").delete().eq("customer_id", id);
      if (delTxErr) throw delTxErr;

      const { data, error } = await supabase.from("customers").delete().eq("id", id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
};

export const useResetToday = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      // Call server-side RPC to perform the reset using server time. Returns counts.
      const { data, error } = await supabase.rpc('reset_today_metrics');
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }) || qc.invalidateQueries({ queryKey: ["customers"] }) || qc.invalidateQueries({ queryKey: ["analytics"] }),
  });
};

export const useResetAll = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reset_all');
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }) || qc.invalidateQueries({ queryKey: ["customers"] }) || qc.invalidateQueries({ queryKey: ["analytics"] }),
  });
};

export const useTransactions = () => {
  return useQuery<any[]>({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
};

// --- Batches / Inventory hooks ---
export const useBatches = () => {
  return useQuery<any[]>({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
};

export const useBatchPnl = () => {
  return useQuery<any[]>({
    queryKey: ["batch_pnl"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batch_pnl").select("*");
      if (error) throw error;
      return data as any[];
    },
  });
};

export const downloadCsvFromRows = (rows: any[], filename = "export.csv") => {
  if (!rows || rows.length === 0) return null;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")].concat(rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 3000);
  return true;
};

export const useCreateBatch = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, { name: string; total_quantity: number; purchase_rate: number }>({
    mutationFn: async (payload) => {
      const body = {
        name: payload.name,
        total_quantity: payload.total_quantity,
        remaining_quantity: payload.total_quantity,
        purchase_rate: payload.purchase_rate,
      };
      const { data, error } = await supabase.from("batches").insert(body).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] }),
  });
};

export const useUpdateBatch = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, { id: string; changes: any }>({
    mutationFn: async ({ id, changes }) => {
      const { data, error } = await supabase.from("batches").update(changes).eq("id", id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] }) || qc.invalidateQueries({ queryKey: ["batch_pnl"] }),
  });
};

export const useDeleteBatch = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, string>({
    mutationFn: async (id: string) => {
      // Optionally, remove or orphan related transactions. Here we set batch_id to null on transactions.
      const { error: updErr } = await supabase.from("transactions").update({ batch_id: null, tea_name: null }).eq("batch_id", id);
      if (updErr) throw updErr;

      const { data, error } = await supabase.from("batches").delete().eq("id", id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] }) || qc.invalidateQueries({ queryKey: ["batch_pnl"] }),
  });
};

// Try to record a sale atomically using a server-side RPC 'record_sale'. If RPC not available, fallback to client-side operations
export const useRecordSale = () => {
  const qc = useQueryClient();
  return useMutation<any, Error, { batch_id: string; customer_id: string; quantity: number; price_per_kg: number; type?: string; paid_amount?: number; due_date?: string | null }>({
    mutationFn: async (payload) => {
      // First attempt server-side RPC
      try {
        const rpc = await supabase.rpc("record_sale", {
          batch_id: payload.batch_id,
          customer_id: payload.customer_id,
          quantity: payload.quantity,
          price_per_kg: payload.price_per_kg,
          paid_amount: payload.paid_amount ?? null,
          tx_type: payload.type ?? "sale",
          due_date: payload.due_date ?? null,
        });
        // supabase.rpc returns { data, error } like select, but in client v2 it can throw; handle both
        // If rpc returned error property
        // @ts-ignore
        if (rpc?.error) throw rpc.error;
        return rpc?.data ?? rpc;
      } catch (rpcErr) {
        // Fallback: do client-side operations (best-effort)
        // 1) Check batch remaining quantity
        const { data: batch, error: bErr } = await supabase.from("batches").select("*").eq("id", payload.batch_id).single();
        if (bErr) throw bErr;
        if (!batch) throw new Error("Batch not found");
        if (Number(batch.remaining_quantity || 0) < payload.quantity) {
          throw new Error("Insufficient stock for selected tea batch");
        }

        // 2) Insert transaction
        const totalAmount = payload.quantity * payload.price_per_kg;
        const txn: Record<string, any> = {
          customer_id: payload.customer_id,
          amount: totalAmount,
          quantity: payload.quantity,
          type: payload.type ?? "sale",
          paid_amount: payload.paid_amount ?? totalAmount,
          balance: totalAmount - (payload.paid_amount ?? totalAmount),
          batch_id: payload.batch_id,
          tea_name: batch.name,
        };

        if (payload.due_date) {
          txn.due_date = payload.due_date;
        }

        const { data: inserted, error: insErr } = await supabase.from("transactions").insert(txn).select().single();
        if (insErr) throw insErr;

        // 3) Update batch remaining quantity
        const newRemaining = Number(batch.remaining_quantity || 0) - payload.quantity;
        const { data: updatedBatch, error: updErr } = await supabase.from("batches").update({ remaining_quantity: newRemaining }).eq("id", payload.batch_id).select().single();
        if (updErr) throw updErr;

        return { inserted, updatedBatch };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }) || qc.invalidateQueries({ queryKey: ["batches"] }) || qc.invalidateQueries({ queryKey: ["customers"] }),
  });
};

export const useAnalytics = () => {
  return useQuery<{
    totalSales: number;
    totalCollections: number;
    todayCollections: number;
    outstanding: number;
    totalCustomers: number;
    transactionsCount: number;
    salesCount: number;
    paymentsCount: number;
    avgSaleValue: number;
    lastSaleAt: string | null;
    lastPaymentAt: string | null;
    totalPnl: number;
  } | null>({
    queryKey: ["analytics"],
    queryFn: async () => {
      // Use server-side view for aggregates
      const { data, error } = await supabase.from("analytics_summary").select("*").limit(1).single();
      if (error) throw error;

      if (!data) return null;

      return {
        totalSales: Number(data.total_sales || 0),
        totalCollections: Number(data.total_collections || 0),
  todayCollections: Number(data.today_collections || 0),
        totalCustomers: Number(data.total_customers || 0),
        outstanding: Number(data.outstanding || 0),
        salesCount: Number(data.sales_count || 0),
        paymentsCount: Number(data.payments_count || 0),
        avgSaleValue: Number(data.avg_sale_value || 0),
        lastSaleAt: data.last_sale_at ?? null,
        lastPaymentAt: data.last_payment_at ?? null,
        transactionsCount: Number(data.transactions_count || 0),
        totalPnl: Number(data.total_pnl || 0),
      };
    },
  });
};

// Realtime subscriptions: listen to changes and invalidate queries
export const useRealtimeSubscriptions = (enabled = true) => {
  const qc = useQueryClient();
  const lastEventRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!enabled) return;

    const subTx = supabase.channel('public:transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        console.debug('[realtime] transactions change', payload);
        lastEventRef.current = Date.now();
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['analytics'] });
        qc.invalidateQueries({ queryKey: ['tea_analytics'] });
      })
      .subscribe((status) => {
        console.debug('[realtime] transactions subscription status', status);
        lastEventRef.current = Date.now();
      });

    const subB = supabase.channel('public:batches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, (payload) => {
        console.debug('[realtime] batches change', payload);
        lastEventRef.current = Date.now();
        qc.invalidateQueries({ queryKey: ['batches'] });
        qc.invalidateQueries({ queryKey: ['tea_analytics'] });
      })
      .subscribe((status) => {
        console.debug('[realtime] batches subscription status', status);
        lastEventRef.current = Date.now();
      });

    const subC = supabase.channel('public:customers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
        console.debug('[realtime] customers change', payload);
        lastEventRef.current = Date.now();
        qc.invalidateQueries({ queryKey: ['customers'] });
        qc.invalidateQueries({ queryKey: ['analytics'] });
      })
      .subscribe((status) => {
        console.debug('[realtime] customers subscription status', status);
        lastEventRef.current = Date.now();
      });

    // Heartbeat: if no events for 25s, trigger a poll invalidation so UI stays up-to-date
    const interval = setInterval(() => {
      try {
        const age = Date.now() - lastEventRef.current;
        if (age > 25000) {
          console.debug('[realtime] no events for', age, 'ms — forcing poll invalidation');
          qc.invalidateQueries({ queryKey: ['transactions'] });
          qc.invalidateQueries({ queryKey: ['batches'] });
          qc.invalidateQueries({ queryKey: ['customers'] });
          qc.invalidateQueries({ queryKey: ['analytics'] });
          qc.invalidateQueries({ queryKey: ['tea_analytics'] });
          lastEventRef.current = Date.now();
        }
      } catch (e) {
        console.debug('[realtime] heartbeat error', e);
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      try {
        supabase.removeChannel(subTx);
      } catch (e) { console.debug('failed to remove transactions channel', e); }
      try {
        supabase.removeChannel(subB);
      } catch (e) { console.debug('failed to remove batches channel', e); }
      try {
        supabase.removeChannel(subC);
      } catch (e) { console.debug('failed to remove customers channel', e); }
    };
  }, [enabled, qc]);
};
