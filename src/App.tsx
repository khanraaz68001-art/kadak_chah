import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRealtimeSubscriptions } from "@/lib/hooks";
import useAutoReminder from "@/hooks/use-auto-reminder";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import PartnerLogin from "./pages/PartnerLogin";
import AdminLogin from "./pages/AdminLogin";
import PartnerDashboard, { PartnerDashboardHome } from "./pages/PartnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import RegisterCustomer from "@/components/partner/RegisterCustomer";
import NewSale from "@/components/partner/NewSale";
import CollectPayment from "@/components/partner/CollectPayment";
import DownloadReports from "@/components/partner/DownloadReports";
import ManageCustomers from "@/components/partner/ManageCustomers";
import CreateBatch from "@/components/partner/CreateBatch";
import ManageBatches from "@/components/common/ManageBatches";
import RequireRole from "@/components/auth/RequireRole";

const queryClient = new QueryClient();

const RealtimeManager = () => {
  // must be called inside QueryClientProvider so useQueryClient() can find the client
  useRealtimeSubscriptions(true);
  useAutoReminder();
  return null;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeManager />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/partner/login" element={<PartnerLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/partner/dashboard"
              element={(
                <RequireRole role="partner">
                  <PartnerDashboard />
                </RequireRole>
              )}
            >
              <Route index element={<PartnerDashboardHome />} />
              <Route path="register" element={<RegisterCustomer />} />
              <Route path="sale" element={<NewSale />} />
              <Route path="payment" element={<CollectPayment />} />
              <Route path="reports" element={<DownloadReports />} />
              <Route path="manage" element={<ManageCustomers />} />
              <Route path="create-batch" element={<CreateBatch />} />
              <Route path="manage-batches" element={<ManageBatches />} />
            </Route>
            <Route
              path="/admin/dashboard"
              element={(
                <RequireRole role="admin">
                  <AdminDashboard />
                </RequireRole>
              )}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
