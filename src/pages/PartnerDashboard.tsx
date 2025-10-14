import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Leaf, UserPlus, ShoppingCart, Wallet, FileDown, LogOut } from "lucide-react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import BatchList from "@/components/common/BatchList";
import { useAnalytics, useCustomers, useTransactions } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import { buildCollectionBreakdown, buildOutstandingBreakdown } from "@/lib/analytics-breakdown";
import { clearStoredUser, computeTransactionSummary, formatPhoneForDisplay, formatReadableDate, getStoredUser } from "@/lib/utils";
import { sendReminderForCustomer } from "@/lib/reminder-actions";

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const sessionUser = getStoredUser();

  const handleLogout = () => {
    clearStoredUser();
    navigate("/partner/login", { replace: true });
  };

  if (!sessionUser || sessionUser.role !== "partner") {
    return <Navigate to="/partner/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate("/partner/dashboard")}
            className="group flex items-center space-x-3 rounded-md bg-transparent p-0 text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <Leaf className="h-6 w-6 text-primary-foreground transition group-hover:scale-105" />
            </div>
            <div>
              <h1 className="text-xl font-brand font-semibold tracking-tight">Kadak चाह Manager</h1>
              <p className="text-sm text-muted-foreground">Partner Portal</p>
            </div>
          </button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export const PartnerDashboardHome = () => {
  const navigate = useNavigate();
  const { data: analyticsData } = useAnalytics();
  const { data: transactions } = useTransactions();
  const { data: customers } = useCustomers();
  const transactionSummary = useMemo(() => computeTransactionSummary(transactions), [transactions]);
  const { details: collectionDetails, summary: collectionSummary } = useMemo(
    () => buildCollectionBreakdown(transactions, customers),
    [transactions, customers],
  );
  const outstandingDetails = useMemo(
    () => buildOutstandingBreakdown(transactionSummary, transactions, customers),
    [transactionSummary, transactions, customers],
  );
  const [activeModal, setActiveModal] = useState<null | "collections" | "outstanding">(null);
  const [reminderSendingId, setReminderSendingId] = useState<string | null>(null);
  const { toast } = useToast();
  const closeModal = () => setActiveModal(null);
  const interactiveCardClass =
    "cursor-pointer transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

  const handleSendReminder = async (entry: { customerId: string; customer: any; outstanding: number }) => {
    if (!entry.customer) {
      toast({
        title: "Customer not found",
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
        toast,
      });
    } finally {
      setReminderSendingId(null);
    }
  };
  const analytics = analyticsData;
  const todayCollectionsValue = analytics ? Number(analytics.todayCollections || 0) : 0;
  const totalCollectionsValue = collectionSummary.totalAmount || transactionSummary.totals.totalCollections || Number(analytics?.totalCollections || 0);
  const outstandingValue = analytics ? Number(analytics.outstanding || 0) : 0;

  const cards = [
    {
      icon: UserPlus,
      title: "Register New Customer",
      description: "Add a new customer or vendor to the system",
      path: "register",
    },
    {
      icon: ShoppingCart,
      title: "New Sale",
      description: "Record a new tea sale transaction",
      path: "sale",
    },
    {
      icon: Wallet,
      title: "Collect Payment",
      description: "Collect outstanding balance from customers",
      path: "payment",
    },
    {
      icon: FileDown,
      title: "Download Reports",
      description: "Export customer data and transactions",
      path: "reports",
    },
    {
      icon: UserPlus,
      title: "Manage Customers",
      description: "Edit your customer details",
      path: "manage",
    },
    {
      icon: FileDown,
      title: "Create Batch",
      description: "Record purchased tea and add to stock",
      path: "create-batch",
    },
    {
      icon: UserPlus,
      title: "Manage Batches",
      description: "View, edit or delete batches",
      path: "manage-batches",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sales Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{analytics ? Number(analytics.totalSales || 0).toFixed(2) : "0.00"}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Collections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalCollectionsValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">All recorded full and partial payments</p>
            <p className="text-xs text-primary mt-2">See payment details</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{outstandingValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending collection</p>
            <p className="text-xs text-primary mt-2">View customers</p>
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
            <DialogTitle>Collections Breakdown</DialogTitle>
            <DialogDescription>
              See the customers who have paid and which tea batches they purchased.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Total collected</p>
                <p className="font-semibold">
                  ₹
                  {(
                    collectionDetails.length > 0
                      ? collectionSummary.totalAmount
                      : totalCollectionsValue
                  ).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Customers</p>
                <p className="font-semibold">{collectionSummary.customersCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Payments</p>
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
                No collection data yet. Record a sale or payment to populate this view.
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
            <DialogTitle>Outstanding Customers</DialogTitle>
            <DialogDescription>
              Identify customers with pending dues and send friendly reminders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Total outstanding</p>
                <p className="font-semibold text-destructive">₹{outstandingValue.toFixed(2)}</p>
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
              <p className="text-sm text-muted-foreground">No dues pending at the moment.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-6">
        <BatchList />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(({ icon: Icon, title, description, path }) => (
          <Card
            key={path}
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(path)}
          >
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PartnerDashboard;
