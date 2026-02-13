"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, getWsBase } from "@/lib/api";

const BRAND = "#1c37b3";

interface OrderItem {
  id: string;
  menu_item_id: number;
  quantity: number;
  price_at_time: number;
  dish_name: string;
  category: string | null;
  variant_name: string;
}

interface Order {
  id: string;
  session_id: string;
  table_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  items: OrderItem[];
  chef_eta_minutes: number | null;
  chef_eta_set_at: string | null;
  session_status: string | null;
}

export default function ChefDashboard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [restaurantId, setRestaurantId] = useState(0);
  const [staffName, setStaffName] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [now, setNow] = useState(Date.now());
  const [settingEta, setSettingEta] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const t = localStorage.getItem("nomoosh_staff_token") || "";
    const r = localStorage.getItem("nomoosh_staff_role") || "";
    const rid = parseInt(localStorage.getItem("nomoosh_staff_restaurant_id") || "0");
    const n = localStorage.getItem("nomoosh_staff_name") || "";
    if (!t || (r !== "chef" && r !== "owner")) { router.push("/staff/login"); return; }
    setToken(t); setRestaurantId(rid); setStaffName(n);
    return () => { mountedRef.current = false; };
  }, [router]);

  /* ── WebSocket — instant order updates ─────────────── */
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
            setOrders(msg.orders || []);
          } else if (msg.type === "new_order") {
            setOrders(prev => {
              if (prev.some(o => o.id === msg.order.id)) return prev;
              return [msg.order, ...prev];
            });
          } else if (msg.type === "order_eta") {
            setOrders(prev => prev.map(o =>
              o.id === msg.order_id
                ? { ...o, chef_eta_minutes: msg.minutes, chef_eta_set_at: msg.set_at }
                : o
            ));
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

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const setETA = async (orderId: string, minutes: number) => {
    setSettingEta(orderId);
    try {
      await apiPost(`/orders/${orderId}/eta`, { minutes }, token);
      // Optimistic update
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, chef_eta_minutes: minutes, chef_eta_set_at: new Date().toISOString() } : o
      ));
    } catch { }
    setSettingEta(null);
  };

  const logout = () => {
    localStorage.removeItem("nomoosh_staff_token");
    localStorage.removeItem("nomoosh_staff_role");
    localStorage.removeItem("nomoosh_staff_name");
    localStorage.removeItem("nomoosh_staff_restaurant_id");
    localStorage.removeItem("nomoosh_staff_id");
    router.push("/staff/login");
  };

  const formatCountdown = (etaMinutes: number, setAt: string) => {
    const setTime = new Date(setAt).getTime();
    const endTime = setTime + etaMinutes * 60 * 1000;
    const remaining = Math.max(0, endTime - now);
    if (remaining <= 0) return "Ready!";
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const pendingOrders = orders.filter((o) => !o.chef_eta_minutes);
  const activeOrders = orders.filter((o) => o.chef_eta_minutes && o.chef_eta_set_at);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-extrabold" style={{ background: BRAND }}>N</div>
            <div>
              <div className="text-lg font-bold text-slate-900">Chef Dashboard</div>
              <div className="text-xs text-slate-500">Hi {staffName} &middot; Restaurant #{restaurantId}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-500">{orders.length} orders</div>
            <button onClick={logout} className="text-sm text-red-500 hover:text-red-700 font-semibold">Sign Out</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* ── NEW ORDERS (no ETA set) ──────────────────── */}
        {pendingOrders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-red-600 mb-3 flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              New Orders — Set Preparation Time
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-2xl shadow-lg border-2 border-red-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-2xl font-extrabold text-slate-900">Table {order.table_number}</span>
                      <span className="ml-2 text-xs text-slate-400">{new Date(order.created_at).toLocaleTimeString()}</span>
                    </div>
                    <span className="text-lg font-bold" style={{ color: BRAND }}>&#8377;{order.total_amount}</span>
                  </div>

                  {/* Items */}
                  <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-slate-700">
                          {item.dish_name}
                          {item.variant_name !== "Regular" && <span className="text-slate-400 ml-1">({item.variant_name})</span>}
                        </span>
                        <span className="font-semibold text-slate-900">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* ETA Preset Buttons */}
                  <div className="flex gap-3">
                    {[10, 15, 20, 30, 45].map((min) => (
                      <button
                        key={min}
                        onClick={() => setETA(order.id, min)}
                        disabled={settingEta === order.id}
                        className="flex-1 py-4 rounded-xl text-white font-bold text-lg shadow-lg active:scale-95 transition disabled:opacity-50"
                        style={{ background: BRAND }}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── IN-PROGRESS ORDERS ───────────────────────── */}
        {activeOrders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-green-600 mb-3">In Progress</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeOrders.map((order) => {
                const countdown = formatCountdown(order.chef_eta_minutes!, order.chef_eta_set_at!);
                const isReady = countdown === "Ready!";
                return (
                  <div key={order.id} className={`bg-white rounded-2xl shadow p-5 border-2 ${isReady ? "border-green-400" : "border-blue-200"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-xl font-bold text-slate-900">Table {order.table_number}</span>
                        <span className="ml-2 text-xs text-slate-400">{new Date(order.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div className={`text-2xl font-extrabold ${isReady ? "text-green-500" : "text-blue-600"}`}>
                        {countdown}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-slate-700">
                            {item.dish_name}
                            {item.variant_name !== "Regular" && <span className="text-slate-400 ml-1">({item.variant_name})</span>}
                          </span>
                          <span className="font-semibold text-slate-900">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Allow re-setting ETA */}
                    <div className="flex gap-2 mt-3">
                      {[10, 15, 20, 30].map((min) => (
                        <button key={min} onClick={() => setETA(order.id, min)}
                          disabled={settingEta === order.id}
                          className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold text-sm hover:bg-slate-200 transition active:scale-95 disabled:opacity-50">
                          {min}m
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {orders.length === 0 && (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">👨‍🍳</div>
            <div className="text-xl font-bold text-slate-400">No orders yet</div>
            <div className="text-sm text-slate-400 mt-1">New orders will appear here automatically</div>
          </div>
        )}
      </div>
    </div>
  );
}
