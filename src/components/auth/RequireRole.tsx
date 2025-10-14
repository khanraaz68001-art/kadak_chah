import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getStoredUser, SessionUser } from "@/lib/utils";

type Role = "admin" | "partner";

interface RequireRoleProps {
  role: Role;
  children: ReactNode;
}

const RequireRole = ({ role, children }: RequireRoleProps) => {
  const location = useLocation();
  const [session, setSession] = useState<SessionUser | null>(() => {
    const stored = getStoredUser();
    if (!stored) return null;
    const normalizedRole = typeof stored.role === "string" ? stored.role.toLowerCase() : stored.role;
    return { ...stored, role: normalizedRole };
  });

  useEffect(() => {
    const syncSession = () => {
      const stored = getStoredUser();
      if (!stored) {
        setSession(null);
        return;
      }
      const normalizedRole = typeof stored.role === "string" ? stored.role.toLowerCase() : stored.role;
      setSession({ ...stored, role: normalizedRole });
    };

    // Update on storage events (other tabs) and navigation changes
    window.addEventListener("storage", syncSession);
    // Always resync on mount in case of late writes
    syncSession();

    return () => {
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  if (!session) {
    return <Navigate to={`/${role}/login`} replace state={{ from: location }} />;
  }

  if (session.role !== role) {
    const fallback = session.role === "admin" ? "/admin/dashboard" : "/partner/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default RequireRole;
