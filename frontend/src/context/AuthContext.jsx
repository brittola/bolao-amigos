import { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Recupera a sessão a partir do token salvo
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    const stored = localStorage.getItem("bolao_user");
    if (stored) setUser(JSON.parse(stored));
    setReady(true);
  }, []);

  function persist(token, u) {
    setToken(token);
    localStorage.setItem("bolao_user", JSON.stringify(u));
    setUser(u);
  }

  async function login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data.token, data.user);
    return data.user;
  }

  async function register(payload) {
    const { data } = await api.post("/auth/register", payload);
    persist(data.token, data.user);
    return data.user;
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("bolao_user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
