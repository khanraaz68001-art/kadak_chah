import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Leaf } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import supabase from "@/lib/supabase";
import { getStoredUser, setStoredUser } from "@/lib/utils";

const PartnerLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const existing = getStoredUser();
    if (!existing) return;
    if (existing.role === "partner") {
      navigate("/partner/dashboard", { replace: true });
    } else if (existing.role === "admin") {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({ title: "Login Failed", description: "Please enter both username and password.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.rpc("authenticate_user", { p_email: username, p_password: password });
      if (error) throw error;

      if (data && data.length > 0) {
        const user = data[0];
    const role = String(user.role ?? "").toLowerCase();
    if (role !== "partner") {
          toast({ title: "Unauthorized", description: "You are not a partner account.", variant: "destructive" });
          return;
        }
        // simple session (demo only)
        setStoredUser({ id: user.id, role, email: user.email });
        toast({ title: "Login Successful", description: "Welcome back, Partner!" });
        navigate("/partner/dashboard", { replace: true });
      } else {
        toast({ title: "Login Failed", description: "Invalid credentials.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Login failed", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-2">
            <Leaf className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Partner Login</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PartnerLogin;
