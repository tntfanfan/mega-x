import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, type Me } from "./api";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "anonymous"
  | "unavailable"
  | "forbidden";

type AuthState = {
  me: Me | null;
  status: AuthStatus;
  loading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

async function fetchMe(): Promise<{ me: Me | null; status: AuthStatus; errorMessage: string | null }> {
  try {
    const data = await api.get<Me>("/v1/me");
    return { me: data, status: "authenticated", errorMessage: null };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) {
        return { me: null, status: "anonymous", errorMessage: null };
      }
      if (e.status === 403) {
        // Identity present but not allowed — keep any prior me? Spec: don't clear me.
        return { me: null, status: "forbidden", errorMessage: "没有访问权限" };
      }
      if (e.status === 503) {
        return { me: null, status: "unavailable", errorMessage: "服务暂时不可用，请稍后重试" };
      }
    }
    return { me: null, status: "unavailable", errorMessage: "网络异常，请稍后重试" };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    const result = await fetchMe();
    setMe(result.me);
    setStatus(result.status);
    setErrorMessage(result.errorMessage);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    await api.post("/v1/auth/login", { email, password });
    const result = await fetchMe();
    setMe(result.me);
    setStatus(result.status);
    setErrorMessage(result.errorMessage);
    if (result.status !== "authenticated") {
      throw new ApiError(401, result.errorMessage, result.errorMessage || "login failed");
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      await api.post("/v1/auth/register", {
        email,
        password,
        display_name: displayName || undefined,
      });
      const result = await fetchMe();
      setMe(result.me);
      setStatus(result.status);
      setErrorMessage(result.errorMessage);
      if (result.status !== "authenticated") {
        throw new ApiError(401, result.errorMessage, result.errorMessage || "register failed");
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/v1/auth/logout");
    } catch {
      // Still clear local state — Cookie clear is best-effort.
    }
    setMe(null);
    setStatus("anonymous");
    setErrorMessage(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        me,
        status,
        loading: status === "loading",
        errorMessage,
        reload,
        login,
        register,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
