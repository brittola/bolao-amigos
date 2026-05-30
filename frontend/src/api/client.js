import axios from "axios";

const TOKEN_KEY = "bolao_token";

// O backend roda em outra porta; CORS está habilitado nele.
// Em produção, defina VITE_API_URL para a origem da API.
const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const api = axios.create({ baseURL });

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Extrai a mensagem de erro amigável de uma resposta do backend. */
export function errorMessage(err, fallback = "Algo deu errado. Tente de novo.") {
  return err?.response?.data?.error || fallback;
}
