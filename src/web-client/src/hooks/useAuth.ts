import { useState, useEffect } from "react";
import type { CurrentUser } from "@fithub/contracts";
import { apiService } from "../services/api.service";
export type WebUser = CurrentUser;
// Optional read-only session hook for future screens; server is the authority.
export function useAuth() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const expire = () => {
      if (live) setCurrentUser(null);
    };
    window.addEventListener("fithub:session-expired", expire);
    if (sessionStorage.getItem("fithub_token")) {
      apiService
        .me()
        .then((user) => {
          if (live) setCurrentUser(user);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    } else setLoading(false);
    return () => {
      live = false;
      window.removeEventListener("fithub:session-expired", expire);
    };
  }, []);
  return {
    currentUser,
    loading,
    error,
    isAuthenticated: Boolean(currentUser),
    role: currentUser?.role,
    isAdmin: currentUser?.role === "ADMIN",
  };
}
