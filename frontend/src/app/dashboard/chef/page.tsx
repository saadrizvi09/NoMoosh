"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiPost, getWsBase } from "@/lib/api";

const BRAND = "#f97316";

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
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
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
          if (msg.type === "init") { setOrders(msg.orders || []); }
          else if (msg.type === "new_order") { setOrders(prev => prev.some(o => o.id === msg.order.id) ? prev : [msg.order, ...prev]); }
          else if (msg.type === "order_eta") { setOrders(prev => prev.map(o => o.id === msg.order_id ? { ...o, chef_eta_minutes: msg.minutes, chef_eta_set_at: msg.set_at } : o)); }
        } catch {}
      };
      ws.onclose = () => { if (pi) clearInterval(pi); if (alive) { rt = setTimeout(connect, rd); rd = Math.min(rd * 2, 30000); } };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => { alive = false; if (pi) clearInterval(pi); if (rt) clearTimeout(rt); ws?.close(); };
  }, [token, restaurantId]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const setETA = async (orderId: string, minutes: number) => {
    setSettingEta(orderId);
    try {
      await apiPost(`/orders/${orderId}/eta`, { minutes }, token);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, chef_eta_minutes: minutes, chef_eta_set_at: new Date().toISOString() } : o));
    } catch {}
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

  const getCountdown = (etaMin: number, setAt: string) => {
    const end = new Date(setAt).getTime() + etaMin * 60000;
    const rem = Math.max(0, end - now);
    if (rem <= 0) return "Ready!";
    return `${Math.floor(rem / 60000)}:${Math.floor((rem % 60000) / 1000).toString().padStart(2, "0")}`;
  };

  const getElapsed = (createdAt: string) => {
    const diff = now - new Date(createdAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ${m % 60}m ago`;
  };

  // Split orders into 3 categories
  const pendingOrders = orders.filter(o => !o.chef_eta_minutes);
  const activeOrders = orders.filter(o => {
    if (!o.chef_eta_minutes || !o.chef_eta_set_at) return false;
    const end = new Date(o.chef_eta_set_at).getTime() + o.chef_eta_minutes * 60000;
    return end > now; // still counting down
  });
  const completedOrders = orders.filter(o => {
    if (!o.chef_eta_minutes || !o.chef_eta_set_at) return false;
    const end = new Date(o.chef_eta_set_at).getTime() + o.chef_eta_minutes * 60000;
    return end <= now; // countdown finished
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-extrabold" style={{ background: BRAND }}>N</div>
            <div>
              <div className="text-base font-bold text-gray-900">Chef Dashboard</div>
              <div className="text-xs text-gray-400">{staffName}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-50" style={{ color: BRAND }}>{pendingOrders.length + activeOrders.length} active</span>
            <button onClick={logout} className="text-xs text-red-500 font-semibold">Sign Out</button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-2">
          <button onClick={() => setActiveTab("active")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${activeTab === "active" ? "text-white" : "text-gray-500 bg-gray-100"}`} style={activeTab === "active" ? { background: BRAND } : {}}>
            Active ({pendingOrders.length + activeOrders.length})
          </button>
          <button onClick={() => setActiveTab("completed")} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${activeTab === "completed" ? "text-white" : "text-gray-500 bg-gray-100"}`} style={activeTab === "completed" ? { background: BRAND } : {}}>
            Completed ({completedOrders.length})
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {activeTab === "active" && (
          <>
            {/* NEW ORDERS */}
            {pendingOrders.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <h2 className="text-sm font-bold text-red-600 uppercase tracking-wide">New — Set Time</h2>
                </div>
                <div className="space-y-3">
                  {pendingOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-xl border-2 border-red-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-900">T-{order.table_number}</span>
                          <span className="text-[11px] text-gray-400">{getElapsed(order.created_at)}</span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: BRAND }}>&#8377;{order.total_amount}</span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5 mb-3 space-y-0.5">
                        {order.items.map(item => (
                          <div key={item.id} className="flex justify-between text-xs">
                            <span className="text-gray-700">{item.dish_name}{item.variant_name !== "Regular" && <span className="text-gray-400 ml-1">({item.variant_name})</span>}</span>
                            <span className="font-semibold text-gray-900">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {[10, 15, 20, 30, 45].map(min => (
                          <button key={min} onClick={() => setETA(order.id, min)} disabled={settingEta === order.id}
                            className="flex-1 py-3 rounded-lg text-white font-bold text-sm active:scale-95 transition disabled:opacity-50"
                            style={{ background: BRAND }}>
                            {min}m
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IN-PROGRESS ORDERS */}
            {activeOrders.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-green-600 uppercase tracking-wide mb-3">In Progress</h2>
                <div className="space-y-3">
                  {activeOrders.map(order => {
                    const cd = getCountdown(order.chef_eta_minutes!, order.chef_eta_set_at!);
                    return (
                      <div key={order.id} className="bg-white rounded-xl border border-green-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-gray-900">T-{order.table_number}</span>
                            <span className="text-[11px] text-gray-400">{getElapsed(order.created_at)}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-green-600">{cd}</div>
                            <div className="text-[10px] text-gray-400">{order.chef_eta_minutes}m timer</div>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5 space-y-0.5">
                          {order.items.map(item => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span className="text-gray-700">{item.dish_name}{item.variant_name !== "Regular" && <span className="text-gray-400 ml-1">({item.variant_name})</span>}</span>
                              <span className="font-semibold text-gray-900">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          {[5, 10, 15].map(min => (
                            <button key={min} onClick={() => setETA(order.id, min)} disabled={settingEta === order.id}
                              className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-semibold text-xs active:scale-95 transition disabled:opacity-50">
                              Reset {min}m
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pendingOrders.length === 0 && activeOrders.length === 0 && (
              <div className="text-center py-20">
                <div className="text-5xl mb-3">👨‍🍳</div>
                <div className="text-lg font-bold text-gray-400">No active orders</div>
                <div className="text-sm text-gray-400 mt-1">New orders will appear here automatically</div>
              </div>
            )}
          </>
        )}

        {activeTab === "completed" && (
          <>
            {completedOrders.length > 0 ? (
              <div className="space-y-3">
                {completedOrders.map(order => (
                  <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4 opacity-80">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900">T-{order.table_number}</span>
                        <span className="text-[11px] text-gray-400">{new Date(order.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Done</span>
                        <span className="text-sm font-bold text-gray-900">&#8377;{order.total_amount}</span>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 space-y-0.5">
                      {order.items.map(item => (
                        <div key={item.id} className="flex justify-between text-xs">
                          <span className="text-gray-600">{item.dish_name}</span>
                          <span className="font-semibold text-gray-700">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="text-5xl mb-3">✅</div>
                <div className="text-lg font-bold text-gray-400">No completed orders yet</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
