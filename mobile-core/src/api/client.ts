import axios, { AxiosError, AxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";

import { API_URL } from "../config";

export type Role = "traveler" | "captain";

/** Every API error has this shape (see backend apps/accounts/exceptions.py). */
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string[] | string>;
  retryAfter?: number;

  constructor(status: number, detail: string, code = "error", fields?: any, retryAfter?: number) {
    super(detail);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }

  /** First message for a form field, if any. */
  field(name: string): string | undefined {
    const v = this.fields?.[name];
    return Array.isArray(v) ? v[0] : v;
  }
}

let role: Role = "traveler";
const keys = () => ({ access: `goloc.${role}.access`, refresh: `goloc.${role}.refresh` });
let accessToken: string | null = null;
let onSignedOut: (() => void) | null = null;

export function configureClient(r: Role, signedOut: () => void) {
  role = r;
  onSignedOut = signedOut;
}

export async function loadTokens() {
  accessToken = await SecureStore.getItemAsync(keys().access);
  return !!accessToken;
}

export async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  await Promise.all([SecureStore.setItemAsync(keys().access, access), SecureStore.setItemAsync(keys().refresh, refresh)]);
}

export async function clearTokens() {
  accessToken = null;
  await Promise.all([SecureStore.deleteItemAsync(keys().access), SecureStore.deleteItemAsync(keys().refresh)]);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(keys().refresh);
}

export const http = axios.create({ baseURL: API_URL, timeout: 20000 });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// One refresh at a time: parallel 401s all wait for the same promise.
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = await getRefreshToken();
  if (!refresh) return false;
  try {
    const { data } = await axios.post(`${API_URL}/auth/token/refresh/`, { refresh }, { timeout: 15000 });
    await saveTokens(data.access, data.refresh ?? refresh);
    return true;
  } catch (e) {
    const status = (e as AxiosError).response?.status;
    if (status === 401 || status === 400) return false;
    throw e; // network trouble: keep the session, let the caller show an error
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    if (error.response?.status === 401 && original && !original._retried && !original.url?.includes("/auth/")) {
      original._retried = true;
      refreshing ??= refreshTokens().finally(() => (refreshing = null));
      const ok = await refreshing.catch(() => null);
      if (ok) return http(original);
      if (ok === false) {
        await clearTokens();
        onSignedOut?.();
      }
    }
    throw toApiError(error);
  },
);

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const e = error as AxiosError<any>;
  if (!e?.response) {
    return new ApiError(0, e?.code === "ECONNABORTED" ? "The server took too long. Try again." : "No connection. Check your internet.", "network");
  }
  const d = e.response.data ?? {};
  return new ApiError(e.response.status, d.detail || "Something went wrong.", d.code, d.fields, d.retry_after);
}

/** Small typed helpers: `const captain = await api.get<Captain>("/captains/CAP-1001/")` */
export const api = {
  get: async <T>(url: string, params?: Record<string, any>) => (await http.get<T>(url, { params })).data,
  post: async <T>(url: string, body?: any) => (await http.post<T>(url, body)).data,
  put: async <T>(url: string, body?: any) => (await http.put<T>(url, body)).data,
  patch: async <T>(url: string, body?: any) => (await http.patch<T>(url, body)).data,
  del: async <T>(url: string, body?: any) => (await http.delete<T>(url, { data: body })).data,
  upload: async <T>(url: string, form: FormData, method: "post" | "put" = "post", onProgress?: (p: number) => void) =>
    (
      await http.request<T>({
        url,
        method,
        data: form,
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
        transformRequest: (d) => d,
        onUploadProgress: (ev) => ev.total && onProgress?.(ev.loaded / ev.total),
      })
    ).data,
};

/** React Native FormData file part from a picker URI. */
export function filePart(uri: string, name: string, type: string) {
  return { uri, name, type } as any;
}
