"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, getWsBase } from "@/lib/api";

const BRAND = "#1c37b3";

interface Table {
  id: string;
  number: string;
  status: string;
  qr_token: string;
  capacity: number;
}

export default function WaiterDashboard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [restaurantId, setRestaurantId] = useState(0);
  const [staffName, setStaffName] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const t = localStorage.getItem("nomoosh_staff_token") || "";
    const r = localStorage.getItem("nomoosh_staff_role") || "";
    const rid = parseInt(localStorage.getItem("nomoosh_staff_restaurant_id") || "0");
    const n = localStorage.getItem("nomoosh_staff_name") || "";
    if (!t || r !== "waiter") { router.push("/staff/login"); return; }
    setToken(t); setRestaurantId(rid); setStaffName(n);
    return () => { mountedRef.current = false; };
  }, [router]);

  /* ── WebSocket — instant table updates ─────────────── */
  useEffect(() => {
    if (!token || !restaurantId) return;
    let alive = true;
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectDelay = 2000;

    const connect = () => {
      if (!alive) return;
      ws = new WebSocket(`${getWsBase()}/ws/staff/${restaurantId}?token=${token}`);

      ws.onopen = () => {
        reconnectDelay = 2000;
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "ping" }));
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") return;

          if (msg.type === "init") {
            setTables(msg.tables || []);
          } else if (msg.type === "table_status") {
            setTables(prev => prev.map(t =>
              t.id === msg.table_id ? { ...t, status: msg.status } : t
            ));
          } else if (msg.type === "table_created") {
            setTables(prev => {
              if (prev.some(t => t.id === msg.table.id)) return prev;
              return [...prev, msg.table];
            });
          } else if (msg.type === "table_deleted") {
            setTables(prev => prev.filter(t => t.id !== msg.table_id));
          }
        } catch {}
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (alive) {
          reconnectTimer = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      alive = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [token, restaurantId]);

  const activate = async (id: string) => {
    setActionInProgress(id);
    try {
      await apiPost(`/tables/${id}/activate`, {}, token);
      // Optimistic update (WS will confirm)
      setTables(prev => prev.map(t => t.id === id ? { ...t, status: "active" } : t));
    } catch { }
    setActionInProgress(null);
  };

  const deactivate = async (id: string) => {
    setActionInProgress(id);
    try {
      await apiPost(`/tables/${id}/deactivate`, {}, token);
      // Optimistic update (WS will confirm)
      setTables(prev => prev.map(t => t.id === id ? { ...t, status: "inactive" } : t));
    } catch { }
    setActionInProgress(null);
  };

  const logout = () => {
    localStorage.removeItem("nomoosh_staff_token");
    localStorage.removeItem("nomoosh_staff_role");
    localStorage.removeItem("nomoosh_staff_name");
    localStorage.removeItem("nomoosh_staff_restaurant_id");
    localStorage.removeItem("nomoosh_staff_id");
    router.push("/staff/login");
  };

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    inactive: { bg: "bg-slate-100", text: "text-slate-500", label: "Inactive" },
    active: { bg: "bg-green-100", text: "text-green-700", label: "Active" },
    dirty: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Needs Clearing" },
  };

  const activeTables = tables.filter((t) => t.status === "active");
  const dirtyTables = tables.filter((t) => t.status === "dirty");
  const inactiveTables = tables.filter((t) => t.status === "inactive");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-extrabold" style={{ background: BRAND }}>N</div>
            <div>
              <div className="text-lg font-bold text-slate-900">Waiter Dashboard</div>
              <div className="text-xs text-slate-500">Hi {staffName} &middot; Restaurant #{restaurantId}</div>
            </div>
          </div>
          <button onClick={logout} className="text-sm text-red-500 hover:text-red-700 font-semibold">Sign Out</button>
        </div>
      </header>

      {/* Summary cards */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 rounded-2xl p-4 text-center border border-green-200">
            <div className="text-3xl font-extrabold text-green-600">{activeTables.length}</div>
            <div className="text-sm font-semibold text-green-700">Active</div>
          </div>
          <div className="bg-yellow-50 rounded-2xl p-4 text-center border border-yellow-200">
            <div className="text-3xl font-extrabold text-yellow-600">{dirtyTables.length}</div>
            <div className="text-sm font-semibold text-yellow-700">Needs Clearing</div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-200">
            <div className="text-3xl font-extrabold text-slate-500">{inactiveTables.length}</div>
            <div className="text-sm font-semibold text-slate-500">Available</div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-3">All Tables</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((t) => {
            const cfg = statusConfig[t.status] || statusConfig.inactive;
            return (
              <div key={t.id} className="bg-white rounded-2xl shadow p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-slate-900">Table {t.number}</span>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                </div>
                <div className="text-xs text-slate-400">Capacity: {t.capacity}</div>

                <div className="flex gap-2 mt-auto">
                  {t.status === "inactive" && (
                    <button onClick={() => activate(t.id)}
                      disabled={actionInProgress === t.id}
                      className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-base shadow active:scale-95 transition disabled:opacity-50">
                      {actionInProgress === t.id ? "Activating..." : "Activate Table"}
                    </button>
                  )}
                  {t.status === "active" && (
                    <button onClick={() => deactivate(t.id)}
                      disabled={actionInProgress === t.id}
                      className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-bold text-base shadow active:scale-95 transition disabled:opacity-50">
                      {actionInProgress === t.id ? "Deactivating..." : "Deactivate"}
                    </button>
                  )}
                  {t.status === "dirty" && (
                    <button onClick={() => deactivate(t.id)}
                      disabled={actionInProgress === t.id}
                      className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-base shadow active:scale-95 transition disabled:opacity-50">
                      {actionInProgress === t.id ? "Resetting..." : "Mark Cleared & Reset"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {tables.length === 0 && (
            <div className="col-span-full text-center py-16 text-slate-400 text-lg">
              No tables found. Ask the owner to add tables first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
