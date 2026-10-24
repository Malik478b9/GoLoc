import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiError, get } from "../api/client";

// ---------------------------------------------------------------- data
/** Fetch + reload + optional polling. Keeps showing old data while refreshing (no flicker). */
export function useApi<T>(url: string | null, params?: Record<string, unknown>, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const key = url ? url + JSON.stringify(params ?? {}) : null;
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await get<T>(url, params);
      if (mine === seq.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(apiError(e).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
    if (!pollMs) return;
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), pollMs);
    return () => window.clearInterval(t);
  }, [load, pollMs]);

  return { data, error, loading, reload: load, setData };
}

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

// ---------------------------------------------------------------- format
const inr = new Intl.NumberFormat("en-IN");
export const money = (n?: number | null) => (n == null ? "—" : `₹${inr.format(n)}`);
export const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const day = (iso?: string | null) =>
  iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const title = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------- navigation (hash routes: #/captains/<id>?status=x)
const parseHash = () => {
  const [path, query = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
  return { parts: path.split("/").filter(Boolean), query: new URLSearchParams(query) };
};

export function useRoute(): [string[], (path: string) => void, URLSearchParams] {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route.parts, (path: string) => (window.location.hash = path), route.query];
}

// ---------------------------------------------------------------- toast
let pushToast: (m: string, bad?: boolean) => void = () => {};
export const toast = (m: string, bad = false) => pushToast(m, bad);
export const toastError = (e: unknown) => pushToast(apiError(e).message, true);

export function ToastHost() {
  const [t, setT] = useState<{ m: string; bad: boolean } | null>(null);
  useEffect(() => {
    pushToast = (m, bad = false) => setT({ m, bad });
  }, []);
  useEffect(() => {
    if (!t) return;
    const id = window.setTimeout(() => setT(null), 3000);
    return () => window.clearTimeout(id);
  }, [t]);
  return t ? <div className={`toast ${t.bad ? "bad" : ""}`} role="status">{t.m}</div> : null;
}

// ---------------------------------------------------------------- ui
const TONES: Record<string, string> = {
  pending: "info", requested: "info", open: "bad", acknowledged: "warn", in_review: "warn", accepted: "warn", draft: "muted",
  approved: "good", confirmed: "good", paid: "good", captured: "good", resolved: "good", completed: "muted", processed: "good", published: "good",
  in_progress: "live", rejected: "bad", cancelled: "bad", declined: "bad", failed: "bad", hidden: "bad", expired: "muted", false_alarm: "muted",
  refunded: "muted", partially_refunded: "warn", closed: "muted",
};
export const Badge = ({ s, label }: { s: string; label?: string }) => <span className={`badge ${TONES[s] ?? "muted"}`}>{label ?? title(s)}</span>;

export function Stat({ label, value, hint, tone, onClick }: { label: string; value: React.ReactNode; hint?: string; tone?: "bad" | "good"; onClick?: () => void }) {
  return (
    <button className={`stat ${tone ?? ""}`} onClick={onClick} disabled={!onClick}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </button>
  );
}

export function Modal({ title: heading, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={heading} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{heading}</h3><button className="icon" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Runs an admin action with a busy state and toast; returns true on success. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export const Loading = () => <div className="center"><div className="boot-spinner dark" /></div>;
export const ErrorBox = ({ error, retry }: { error: string; retry?: () => void }) => (
  <div className="empty"><p>{error}</p>{retry ? <button className="btn" onClick={retry}>Try again</button> : null}</div>
);
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty"><p>{children}</p></div>;

export function Pager({ page, onPage, current }: { page: Pick<Page<unknown>, "count" | "next" | "previous"> | null; onPage: (n: number) => void; current: number }) {
  if (!page || (!page.next && !page.previous)) return null;
  return (
    <div className="pager">
      <button className="btn" disabled={!page.previous} onClick={() => onPage(current - 1)}>← Prev</button>
      <span>Page {current} · {page.count} total</span>
      <button className="btn" disabled={!page.next} onClick={() => onPage(current + 1)}>Next →</button>
    </div>
  );
}

export const mapLink = (lat?: number | string | null, lng?: number | string | null) =>
  lat != null && lng != null ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : null;
