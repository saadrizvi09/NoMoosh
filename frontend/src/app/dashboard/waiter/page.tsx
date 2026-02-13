"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiPost, getWsBase } from "@/lib/api";

const BRAND = "#f97316";

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

  /* ── WebSocket ─────────────────────────────────────── */
  useEffect(() => {
    if (!token || !restaurantId) return;
    let alive = true;
    let ws: WebSocket | null = null;
    let pi: NodeJS.Timeout | null = null;
    let rt: NodeJS.Timeout | null = null;
    let rd = 2000;

    const connect = () => {
      if (!alive) return;
      ws = new WebSocket(`${getWsBase()}/ws/staff/${restaurantId}?token=${token}`);
      ws.onopen = () => { rd = 2000; pi = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); }, 30000); };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") return;
          if (msg.type === "init") { setTables(msg.tables || []); }
          else if (msg.type === "table_status") { setTables(prev => prev.map(t => t.id === msg.table_id ? { ...t, status: msg.status } : t)); }
          else if (msg.type === "table_created") { setTables(prev => prev.some(t => t.id === msg.table.id) ? prev : [...prev, msg.table]); }
          else if (msg.type === "table_deleted") { setTables(prev => prev.filter(t => t.id !== msg.table_id)); }
        } catch {}
      };
      ws.onclose = () => { if (pi) clearInterval(pi); if (alive) { rt = setTimeout(connect, rd); rd = Math.min(rd * 2, 30000); } };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => { alive = false; if (pi) clearInterval(pi); if (rt) clearTimeout(rt); ws?.close(); };
  }, [token, restaurantId]);

  const activate = async (id: string) => {
    setActionInProgress(id);
    try { await apiPost(`/tables/${id}/activate`, {}, token); setTables(prev => prev.map(t => t.id === id ? { ...t, status: "active" } : t)); } catch {}
    setActionInProgress(null);
  };

  const deactivate = async (id: string) => {
    setActionInProgress(id);
    try { await apiPost(`/tables/${id}/deactivate`, {}, token); setTables(prev => prev.map(t => t.id === id ? { ...t, status: "inactive" } : t)); } catch {}
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

  const active = tables.filter(t => t.status === "active");
  const dirty = tables.filter(t => t.status === "dirty");
  const inactive = tables.filter(t => t.status === "inactive");

  const statusCfg: Record<string, { bg: string; text: string; label: string; dot: string }> = {
    inactive: { bg: "bg-gray-50", text: "text-gray-500", label: "Available", dot: "bg-gray-400" },
    active: { bg: "bg-green-50", text: "text-green-700", label: "Active", dot: "bg-green-500" },
    dirty: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Needs Clearing", dot: "bg-yellow-500" },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-extrabold" style={{ background: BRAND }}>N</div>
            <div>
              <div className="text-base font-bold text-gray-900">Waiter Dashboard</div>
              <div className="text-xs text-gray-400">{staffName}</div>
            </div>
          </div>
          <button onClick={logout} className="text-xs text-red-500 font-semibold">Sign Out</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 text-center border border-green-100">
            <div className="text-2xl font-bold text-green-600">{active.length}</div>
            <div className="text-[11px] font-semibold text-green-700">Active</div>
          </div>
          <div className="bg-white rounded-xl p-3 text-center border border-yellow-100">
            <div className="text-2xl font-bold text-yellow-600">{dirty.length}</div>
            <div className="text-[11px] font-semibold text-yellow-700">Needs Clearing</div>
          </div>
          <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
            <div className="text-2xl font-bold text-gray-500">{inactive.length}</div>
            <div className="text-[11px] font-semibold text-gray-500">Available</div>
          </div>
        </div>

        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">All Tables</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tables.map(t => {
            const cfg = statusCfg[t.status] || statusCfg.inactive;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-gray-900">Table {t.number}</span>
                  <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400">Capacity: {t.capacity}</div>
                <div className="flex gap-2 mt-auto">
                  {t.status === "inactive" && (
                    <button onClick={() => activate(t.id)} disabled={actionInProgress === t.id}
                      className="flex-1 py-2.5 rounded-lg bg-green-500 text-white font-bold text-sm active:scale-95 transition disabled:opacity-50">
                      {actionInProgress === t.id ? "..." : "Activate"}
                    </button>
                  )}
                  {t.status === "active" && (
                    <button onClick={() => deactivate(t.id)} disabled={actionInProgress === t.id}
                      className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm active:scale-95 transition disabled:opacity-50"
                      style={{ background: BRAND }}>
                      {actionInProgress === t.id ? "..." : "Deactivate"}
                    </button>
                  )}
                  {t.status === "dirty" && (
                    <button onClick={() => deactivate(t.id)} disabled={actionInProgress === t.id}
                      className="flex-1 py-2.5 rounded-lg bg-blue-500 text-white font-bold text-sm active:scale-95 transition disabled:opacity-50">
                      {actionInProgress === t.id ? "..." : "Mark Cleared"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {tables.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400 text-sm">No tables found. Ask the owner to add tables first.</div>
          )}
        </div>
      </div>
    </div>
  );
}
