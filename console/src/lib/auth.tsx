import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Me } from "./api";

type AuthState = {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await api.get<Me>("/v1/me");
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return <Ctx.Provider value={{ me, loading, reload }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
