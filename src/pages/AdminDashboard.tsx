import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, Users, TrendingUp, AlertCircle, LogOut, Database, IndianRupee } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AllCustomers from "@/components/admin/AllCustomers";
import AllTransactions from "@/components/admin/AllTransactions";
import SystemAnalytics from "@/components/admin/SystemAnalytics";
import TeaAnalytics from "@/components/admin/TeaAnalytics";
import BatchList from "@/components/common/BatchList";
import ManageBatches from "@/components/common/ManageBatches";
import {
  useAnalytics,
  useBatchPnl,
  useCustomers,
  usePartnerContactSetting,
  useResetAll,
  useResetToday,
  useSavePartnerContactSetting,
  useTransactions,
} from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import { buildCollectionBreakdown, buildOutstandingBreakdown, buildPnlBreakdown } from "@/lib/analytics-breakdown";
import {
  clearStoredUser,
  computeTransactionSummary,
  formatPhoneForDisplay,
  formatReadableDate,
  getPartnerContactNumber,
  getStoredUser,
  normalizePhoneNumber,
  setPartnerContactNumber,
} from "@/lib/utils";
import { sendReminderForCustomer } from "@/lib/reminder-actions";

const AdminDashboard = () => {
  const navigate = useNavigate();

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics();
  const { data: transactions } = useTransactions();
  const analytics = analyticsData;
  const netPnl = analytics ? Number(analytics.totalPnl || 0) : 0;
  const isPnlPositive = netPnl >= 0;

  const transactionSummary = useMemo(() => computeTransactionSummary(transactions), [transactions]);
  const hasTransactionData = Array.isArray(transactions);

  const totalSalesValue = hasTransactionData ? transactionSummary.totals.totalSales : Number(analytics?.totalSales || 0);
  const totalCollectionsValue = hasTransactionData ? transactionSummary.totals.totalCollections : Number(analytics?.totalCollections || 0);
  const totalOutstandingValue = hasTransactionData ? transactionSummary.totals.outstanding : Number(analytics?.outstanding || 0);
  const { data: customers } = useCustomers();
  const { data: batchPnl, isLoading: batchPnlLoading } = useBatchPnl();

  const [activeModal, setActiveModal] = useState<"collections" | "outstanding" | "pnl" | null>(null);
  const [reminderSendingId, setReminderSendingId] = useState<string | null>(null);

  const { details: collectionDetails, summary: collectionSummary } = useMemo(
    () => buildCollectionBreakdown(transactions, customers),
    [transactions, customers],
  );

  const outstandingDetails = useMemo(
    () => buildOutstandingBreakdown(transactionSummary, transactions, customers),
    [transactionSummary, transactions, customers],
  );

  const pnlBreakdown = useMemo(() => buildPnlBreakdown(batchPnl, transactions), [batchPnl, transactions]);
  const averageProfitPerKg = useMemo(() => {
    if (!pnlBreakdown.rows.length || pnlBreakdown.totals.soldQuantity === 0) {
      return null;
    }

    const totalWeightedProfit = pnlBreakdown.rows.reduce((sum, row) => {
      if (row.profitPerKg == null) return sum;
      return sum + row.profitPerKg * row.soldQuantity;
    }, 0);

    return totalWeightedProfit / pnlBreakdown.totals.soldQuantity;
  }, [pnlBreakdown]);

  const sessionUser = getStoredUser();
  const [partnerContact, setPartnerContact] = useState("");
  const [savedPartnerContact, setSavedPartnerContact] = useState("");

  const { data: partnerContactFromDb, isLoading: partnerContactLoading } = usePartnerContactSetting();
  const savePartnerContactMutation = useSavePartnerContactSetting();

  useEffect(() => {
    const resolved = partnerContactFromDb ?? getPartnerContactNumber() ?? "";
    const display = resolved ? formatPhoneForDisplay(resolved) ?? resolved : "";
    const digitsOnly = display ? display.replace(/[^0-9]/g, "") : "";
    setPartnerContact(digitsOnly);
    setSavedPartnerContact(digitsOnly);
    if (resolved) {
      setPartnerContactNumber(resolved);
    } else {
      setPartnerContactNumber("");
    }
  }, [partnerContactFromDb]);

  const handleLogout = () => {
    clearStoredUser();
    navigate("/admin/login", { replace: true });
  };

  const resetMutation = useResetToday();
  const resetAllMutation = useResetAll();
  const { toast } = useToast();

  if (!sessionUser || sessionUser.role !== "admin") {
    return <Navigate to="/admin/login" replace />;
  }

  const normalizedCurrent = normalizePhoneNumber(partnerContact) ?? "";
  const normalizedSaved = normalizePhoneNumber(savedPartnerContact) ?? "";
  const partnerContactChanged = normalizedCurrent !== normalizedSaved;

  const handleSavePartnerContact = async () => {
    const normalized = normalizePhoneNumber(partnerContact);
    if (!normalized) {
      toast({
        title: "Contact required",
        description: "Enter a WhatsApp number before saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      const stored = await savePartnerContactMutation.mutateAsync(normalized);
      const value = stored ?? "";
      const display = value ? formatPhoneForDisplay(value) ?? value : "";
      const digitsOnly = display ? display.replace(/[^0-9]/g, "") : "";
      setPartnerContact(digitsOnly);
      setSavedPartnerContact(digitsOnly);
      setPartnerContactNumber(value);
      toast({
        title: "Partner contact saved",
        description: "New default WhatsApp number will be used for reminders.",
      });
    } catch (err: any) {
      toast({
        title: "Unable to save",
        description: err?.message || "Failed to store the partner contact number.",
        variant: "destructive",
      });
    }
  };

  const handleClearPartnerContact = async () => {
    try {
      await savePartnerContactMutation.mutateAsync("");
      setPartnerContact("");
      setSavedPartnerContact("");
      setPartnerContactNumber("");
      toast({
        title: "Partner contact cleared",
        description: "Reminders will no longer include a default partner number.",
      });
    } catch (err: any) {
      toast({
        title: "Unable to clear",
        description: err?.message || "Failed to remove the partner contact number.",
        variant: "destructive",
      });
    }
  };

  const closeModal = () => setActiveModal(null);
  const interactiveCardClass =
    "cursor-pointer transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

  const handleSendReminder = async (entry: {
    customerId: string;
    customer: any;
    customerName: string;
    outstanding: number;
  }) => {
    if (!entry.customer) {
      toast({
        title: "Customer record missing",
        description: "Add this customer to the directory before sending reminders.",
        variant: "destructive",
      });
      return;
    }

    setReminderSendingId(entry.customerId);
    try {
      await sendReminderForCustomer({
        customer: entry.customer,
        outstandingAmount: entry.outstanding,
        partnerContact: normalizedCurrent || partnerContactFromDb || null,
        toast,
      });
    } finally {
      setReminderSendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate("/admin/dashboard")}
            className="group flex items-center space-x-3 rounded-md bg-transparent p-0 text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Leaf className="h-6 w-6 text-primary-foreground transition group-hover:scale-105" />
            </div>
            <div>
              <h1 className="text-xl font-brand font-semibold tracking-tight">Kadak चाह Manager</h1>
              <p className="text-sm text-muted-foreground">Admin Portal</p>
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
            <button className="btn btn-warning" onClick={async () => {
              const typed = prompt('Type RESET (uppercase) to confirm wiping all demo data (customers, transactions) and reseeding demo rows:');
              if (typed !== 'RESET') {
                toast({ title: 'Cancelled', description: 'Reset aborted' });
                return;
              }
              try {
                const res: any = await resetAllMutation.mutateAsync();
                // handle array/object responses
                let txDel = 0, custDel = 0, custIns = 0, txIns = 0;
                if (Array.isArray(res) && res.length > 0) {
                  txDel = Number(res[0].tx_deleted || 0);
                  custDel = Number(res[0].customers_deleted || 0);
                  custIns = Number(res[0].customers_inserted || 0);
                  txIns = Number(res[0].transactions_inserted || 0);
                } else if (res && typeof res === 'object') {
                  txDel = Number(res.tx_deleted || 0);
                  custDel = Number(res.customers_deleted || 0);
                  custIns = Number(res.customers_inserted || 0);
                  txIns = Number(res.transactions_inserted || 0);
                }
                toast({ title: 'Reset All Done', description: `Deleted ${txDel} transactions, ${custDel} customers. Re-seeded ${custIns} customers and ${txIns} transactions.` });
              } catch (err: any) {
                toast({ title: 'Error', description: err?.message || 'Failed to reset all' });
              }
            }}>All Reset</button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Reminder Contact Placeholder</CardTitle>
            <p className="text-sm text-muted-foreground">
              Set the WhatsApp number partners want customers to reach. This appears in reminder messages sent from the partner dashboard.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="partner-contact-input">Default WhatsApp Number</Label>
                <Input
                  id="partner-contact-input"
                  placeholder="e.g. 9876543210"
                  value={partnerContact}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/[^0-9]/g, "");
                    setPartnerContact(digits.slice(0, 15));
                  }}
                  inputMode="numeric"
                  maxLength={15}
                  disabled={partnerContactLoading || savePartnerContactMutation.status === "pending"}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the WhatsApp number without the country code. We'll automatically add +91 (or the configured default) when saving and sending reminders.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSavePartnerContact}
                  disabled={
                    !partnerContact.trim() ||
                    !partnerContactChanged ||
                    savePartnerContactMutation.status === "pending"
                  }
                >
                  {savePartnerContactMutation.status === "pending" ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClearPartnerContact}
                  disabled={
                    (!savedPartnerContact && !partnerContact) ||
                    savePartnerContactMutation.status === "pending"
                  }
                >
                  {savePartnerContactMutation.status === "pending" ? "Please wait…" : "Clear"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Total Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{Number(totalSalesValue || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Orders: {analytics ? Number(analytics.salesCount || 0) : 0}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Total Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics ? Number(analytics.totalCustomers || 0) : 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Registered</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => setActiveModal("collections")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveModal("collections");
              }
            }}
            className={interactiveCardClass}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Total Collections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{Number(totalCollectionsValue || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Payments: {analytics ? Number(analytics.paymentsCount || 0) : 0}</p>
              <p className="text-xs text-primary mt-2">View breakdown</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => setActiveModal("outstanding")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveModal("outstanding");
              }
            }}
            className={interactiveCardClass}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                Outstanding Dues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{Number(totalOutstandingValue || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Pending collection</p>
              <p className="text-xs text-primary mt-2">View customers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Database className="h-4 w-4 mr-2" />
                Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics ? Number(analytics.transactionsCount || 0) : 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Records</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Avg Invoice Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{analytics ? Number(analytics.avgSaleValue || 0).toFixed(2) : "0.00"}</div>
              <p className="text-xs text-muted-foreground mt-1">Per sale</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => setActiveModal("pnl")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveModal("pnl");
              }
            }}
            className={interactiveCardClass}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <IndianRupee className="h-4 w-4 mr-2" />
                Net Profit / Loss
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isPnlPositive ? "text-emerald-500" : "text-destructive"}`}>
                ₹{netPnl.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isPnlPositive ? "All-time profit across recorded sales" : "Overall loss relative to purchase cost"}
              </p>
              <p className="text-xs text-primary mt-2">Inspect batches</p>
            </CardContent>
          </Card>
        </div>

        <Dialog
          open={activeModal === "collections"}
          onOpenChange={(open) => {
            if (open) {
              setActiveModal("collections");
            } else {
              closeModal();
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Total Collections Breakdown</DialogTitle>
              <DialogDescription>
                Track which customers have paid and the teas associated with their payments.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Total collected</p>
                  <p className="font-semibold">
                    ₹
                    {(
                      collectionDetails.length > 0
                        ? collectionSummary.totalAmount
                        : Number(totalCollectionsValue || 0)
                    ).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Contributing customers</p>
                  <p className="font-semibold">{collectionSummary.customersCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recorded payments</p>
                  <p className="font-semibold">{collectionSummary.paymentCount}</p>
                </div>
              </div>

              {collectionDetails.length > 0 ? (
                <ScrollArea className="max-h-[60vh] pr-2">
                  <div className="space-y-4">
                    {collectionDetails.map((entry) => (
                      <div key={entry.customerId} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold leading-tight">{entry.customerName}</p>
                            {entry.customer?.shop_name && (
                              <p className="text-xs text-muted-foreground">Shop: {entry.customer.shop_name}</p>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-emerald-600">
                            ₹{entry.totalPaid.toFixed(2)}
                          </div>
                        </div>

                        <div className="mt-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Tea</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead className="text-right">Selling Price</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.payments.map((payment) => (
                                <TableRow key={payment.id}>
                                  <TableCell>{formatReadableDate(payment.createdAt)}</TableCell>
                                  <TableCell className="max-w-[160px] truncate text-muted-foreground">
                                    {payment.teaName || "—"}
                                  </TableCell>
                                  <TableCell>
                                    {payment.quantity != null && payment.quantity !== 0
                                      ? `${payment.quantity} kg`
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {payment.saleAmount != null
                                      ? `₹${payment.saleAmount.toFixed(2)}`
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">₹{payment.amount.toFixed(2)}</TableCell>
                                  <TableCell
                                    className={`text-right text-xs font-semibold ${
                                      payment.status === "full paid"
                                        ? "text-emerald-600"
                                        : payment.status === "partial left"
                                          ? "text-destructive"
                                          : "text-amber-600"
                                    }`}
                                  >
                                    {payment.status
                                      .split(" ")
                                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                                      .join(" ")}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No collection data available yet. Come back after recording a sale or payment.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={activeModal === "outstanding"}
          onOpenChange={(open) => {
            if (open) {
              setActiveModal("outstanding");
            } else {
              closeModal();
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Outstanding Dues</DialogTitle>
              <DialogDescription>
                Review pending balances and nudge customers directly from this view.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Total outstanding</p>
                  <p className="font-semibold text-destructive">₹{Number(totalOutstandingValue || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customers due</p>
                  <p className="font-semibold">{outstandingDetails.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ready for reminders</p>
                  <p className="font-semibold">{outstandingDetails.filter((item) => Boolean(item.customer)).length}</p>
                </div>
              </div>

              {outstandingDetails.length > 0 ? (
                <ScrollArea className="max-h-[60vh] pr-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead>Next due</TableHead>
                        <TableHead>Last activity</TableHead>
                        <TableHead className="text-right">Reminder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outstandingDetails.map((entry) => (
                        <TableRow key={entry.customerId}>
                          <TableCell className="align-top">
                            <div className="space-y-1">
                              <p className="font-medium leading-tight">{entry.customerName}</p>
                              {entry.customer?.shop_name && (
                                <p className="text-xs text-muted-foreground">Shop: {entry.customer.shop_name}</p>
                              )}
                              {entry.phone && (
                                <p className="text-xs text-muted-foreground">WhatsApp: {formatPhoneForDisplay(entry.phone) || entry.phone}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-destructive">
                            ₹{entry.outstanding.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {entry.nextDue ? formatReadableDate(entry.nextDue) : "—"}
                          </TableCell>
                          <TableCell>{entry.lastActivity ? formatReadableDate(entry.lastActivity) : "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendReminder(entry)}
                              disabled={reminderSendingId === entry.customerId || !entry.customer}
                            >
                              {reminderSendingId === entry.customerId ? "Preparing…" : "Send Reminder"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground">Great news! There are no pending balances right now.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={activeModal === "pnl"}
          onOpenChange={(open) => {
            if (open) {
              setActiveModal("pnl");
            } else {
              closeModal();
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Total P&L Overview</DialogTitle>
              <DialogDescription>
                Compare profit and loss across tea batches to understand what's working.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Net P&L</p>
                  <p className={`font-semibold ${isPnlPositive ? "text-emerald-600" : "text-destructive"}`}>
                    ₹{netPnl.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Batches tracked</p>
                  <p className="font-semibold">{pnlBreakdown.rows.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total sold quantity</p>
                  <p className="font-semibold">{pnlBreakdown.totals.soldQuantity.toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avg profit per kg</p>
                  <p
                    className={`font-semibold ${
                      averageProfitPerKg == null
                        ? ""
                        : averageProfitPerKg >= 0
                          ? "text-emerald-600"
                          : "text-destructive"
                    }`}
                  >
                    {averageProfitPerKg != null ? `₹${averageProfitPerKg.toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>

              {batchPnlLoading ? (
                <p className="text-sm text-muted-foreground">Loading batch performance…</p>
              ) : pnlBreakdown.rows.length > 0 ? (
                <ScrollArea className="max-h-[60vh] pr-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-right">#</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Sold (kg)</TableHead>
                        <TableHead className="text-right">Remaining (kg)</TableHead>
                        <TableHead className="text-right">Purchase ₹/kg</TableHead>
                        <TableHead className="text-right">Profit ₹/kg</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pnlBreakdown.rows.map((row, index) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-right text-xs text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">{row.soldQuantity.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.remainingQuantity.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{row.purchaseRate.toFixed(2)}</TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              row.profitPerKg == null
                                ? "text-muted-foreground"
                                : row.profitPerKg > 0
                                  ? "text-emerald-600"
                                  : row.profitPerKg < 0
                                    ? "text-destructive"
                                    : ""
                            }`}
                          >
                            {row.profitPerKg != null ? `₹${row.profitPerKg.toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${row.pnl >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            ₹{row.pnl.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground">
                  P&L breakdown will appear after you start tracking tea batches.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div className="mb-6">
          <div className="flex items-center justify-end">
            <button className="btn btn-destructive" onClick={async () => {
              if (!confirm('Reset today\'s sales, collections and outstanding balances? This will set those values to 0.')) return;
              try {
                const res: any = await resetMutation.mutateAsync();
                // The RPC may return an array or object depending on driver; handle both
                let txCount = 0;
                let custCount = 0;
                if (Array.isArray(res) && res.length > 0) {
                  txCount = Number(res[0].tx_reset_count || 0);
                  custCount = Number(res[0].customers_reset_count || 0);
                } else if (res && typeof res === 'object') {
                  txCount = Number(res.tx_reset_count || res.tx_reset_count === 0 ? res.tx_reset_count : 0);
                  custCount = Number(res.customers_reset_count || res.customers_reset_count === 0 ? res.customers_reset_count : 0);
                }
                toast({ title: 'Reset', description: `Reset ${txCount} transactions and ${custCount} customer balances` });
              } catch (err: any) {
                toast({ title: 'Error', description: err?.message || 'Failed to reset' });
              }
            }}>Reset Today</button>
          </div>
        </div>

        <Tabs defaultValue="analytics" className="space-y-4">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="customers">All Customers</TabsTrigger>
            <TabsTrigger value="transactions">All Transactions</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
          </TabsList>
          
          <TabsContent value="analytics" className="space-y-4">
            <SystemAnalytics />
            <TeaAnalytics />
            <BatchList />
          </TabsContent>
          
          <TabsContent value="customers" className="space-y-4">
            <AllCustomers />
          </TabsContent>
          
          <TabsContent value="transactions" className="space-y-4">
            <AllTransactions />
          </TabsContent>

          <TabsContent value="batches" className="space-y-4">
            <ManageBatches onBack={() => { /* noop for admin */ }} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
