import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, Users, TrendingUp, AlertCircle, LogOut, Database, IndianRupee } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AllCustomers from "@/components/admin/AllCustomers";
import AllTransactions from "@/components/admin/AllTransactions";
import SystemAnalytics from "@/components/admin/SystemAnalytics";
import TeaAnalytics from "@/components/admin/TeaAnalytics";
import BatchList from "@/components/common/BatchList";
import ManageBatches from "@/components/common/ManageBatches";
import { useAnalytics, usePartnerContactSetting, useResetAll, useResetToday, useSavePartnerContactSetting } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import {
  clearStoredUser,
  formatPhoneForDisplay,
  getPartnerContactNumber,
  getStoredUser,
  normalizePhoneNumber,
  setPartnerContactNumber,
} from "@/lib/utils";

const AdminDashboard = () => {
  const navigate = useNavigate();

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics();
  const analytics = analyticsData;
  const netPnl = analytics ? Number(analytics.totalPnl || 0) : 0;
  const isPnlPositive = netPnl >= 0;

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
              <div className="text-2xl font-bold">₹{analytics ? Number(analytics.totalSales || 0).toFixed(2) : "0.00"}</div>
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Total Collections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{analytics ? Number(analytics.totalCollections || 0).toFixed(2) : "0.00"}</div>
              <p className="text-xs text-muted-foreground mt-1">Payments: {analytics ? Number(analytics.paymentsCount || 0) : 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                Outstanding Dues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{analytics ? Number(analytics.outstanding || 0).toFixed(2) : "0.00"}</div>
              <p className="text-xs text-muted-foreground mt-1">Pending collection</p>
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

          <Card>
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
            </CardContent>
          </Card>
        </div>

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
