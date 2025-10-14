import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Leaf, UserPlus, ShoppingCart, Wallet, FileDown, LogOut } from "lucide-react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import BatchList from "@/components/common/BatchList";
import { useAnalytics } from "@/lib/hooks";
import { clearStoredUser, getStoredUser } from "@/lib/utils";

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
  const analytics = analyticsData;

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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Collections Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{analytics ? Number(analytics.todayCollections || 0).toFixed(2) : "0.00"}</div>
            <p className="text-xs text-muted-foreground mt-1">Full + partial payments recorded today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{analytics ? Number(analytics.outstanding || 0).toFixed(2) : "0.00"}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending collection</p>
          </CardContent>
        </Card>
      </div>

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
