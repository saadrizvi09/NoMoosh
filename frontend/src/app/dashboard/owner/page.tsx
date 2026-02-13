"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPut, apiDelete, getWsBase } from "@/lib/api";

const BRAND = "#f97316";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
// Use production URL for QR codes so they work from anywhere
const FRONTEND = process.env.NEXT_PUBLIC_FRONTEND_URL || "https://no-moosh.vercel.app";

interface MenuItem {
  id: number;
  dish_name: string;
  price: number;
  category: string;
  description: string;
  category_veg: boolean | null;
  availability: boolean;
  variant_name: string;
}

interface Table {
  id: string;
  number: string;
  status: string;
  qr_token: string;
  capacity: number;
}

export default function OwnerDashboard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [restaurantId, setRestaurantId] = useState(0);
  const [staffName, setStaffName] = useState("");
  const [tab, setTab] = useState<"menu" | "tables" | "qr">("tables");

  // Menu state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [showAddDish, setShowAddDish] = useState(false);
  const [newDish, setNewDish] = useState({ dish_name: "", price: 0, category: "", description: "", category_veg: true, variant_name: "Regular" });

  // Tables state
  const [tables, setTables] = useState<Table[]>([]);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState(4);
  const [tableActionBusy, setTableActionBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("nomoosh_staff_token") || "";
    const r = localStorage.getItem("nomoosh_staff_role") || "";
    const rid = parseInt(localStorage.getItem("nomoosh_staff_restaurant_id") || "0");
    const n = localStorage.getItem("nomoosh_staff_name") || "";
    if (!t || r !== "owner") { router.push("/staff/login"); return; }
    setToken(t);
    setRestaurantId(rid);
    setStaffName(n);
  }, [router]);

  /* ── Fetch menu via HTTP (owner is the only editor) ────── */
  const fetchMenu = useCallback(async () => {
    if (!token || !restaurantId) return;
    try { setMenuItems(await apiGet(`/menu/restaurant/${restaurantId}`, token)); } catch { }
  }, [token, restaurantId]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  /* ── WebSocket — instant table updates ─────────────────── */
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

  const addDish = async () => {
    try {
      await apiPost("/menu/create", { restaurant_id: restaurantId, ...newDish }, token);
      setNewDish({ dish_name: "", price: 0, category: "", description: "", category_veg: true, variant_name: "Regular" });
      setShowAddDish(false);
      fetchMenu();
    } catch { }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    try {
      await apiPut(`/menu/${editItem.id}`, {
        dish_name: editItem.dish_name,
        price: editItem.price,
        category: editItem.category,
        description: editItem.description,
        availability: editItem.availability,
        category_veg: editItem.category_veg,
        variant_name: editItem.variant_name,
      }, token);
      setEditItem(null);
      fetchMenu();
    } catch { }
  };

  const removeDish = async (id: number) => {
    try { await apiDelete(`/menu/${id}`, token); fetchMenu(); } catch { }
  };

  const addTable = async () => {
    if (!newTableNumber || tableActionBusy) return;
    setTableActionBusy("add");
    try {
      await apiPost("/tables", { restaurant_id: restaurantId, number: newTableNumber, capacity: newTableCapacity }, token);
      setNewTableNumber("");
      setNewTableCapacity(4);
      // WS will push table_created
    } catch { }
    setTableActionBusy(null);
  };

  const deleteTable = async (id: string) => {
    setTableActionBusy(id);
    try { await apiDelete(`/tables/${id}`, token); } catch { }
    setTableActionBusy(null);
    // WS will push table_deleted
  };

  const activateTable = async (id: string) => {
    setTableActionBusy(id);
    try {
      await apiPost(`/tables/${id}/activate`, {}, token);
      setTables(prev => prev.map(t => t.id === id ? { ...t, status: "active" } : t));
    } catch { }
    setTableActionBusy(null);
  };

  const deactivateTable = async (id: string) => {
    setTableActionBusy(id);
    try {
      await apiPost(`/tables/${id}/deactivate`, {}, token);
      setTables(prev => prev.map(t => t.id === id ? { ...t, status: "inactive" } : t));
    } catch { }
    setTableActionBusy(null);
  };

  const logout = () => {
    localStorage.removeItem("nomoosh_staff_token");
    localStorage.removeItem("nomoosh_staff_role");
    localStorage.removeItem("nomoosh_staff_name");
    localStorage.removeItem("nomoosh_staff_restaurant_id");
    localStorage.removeItem("nomoosh_staff_id");
    router.push("/staff/login");
  };

  const statusColor = (s: string) =>
    s === "active" ? "bg-green-100 text-green-700" : s === "dirty" ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500";

  const categories = [...new Set(menuItems.map((i) => i.category || "Uncategorised"))];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-extrabold" style={{ background: BRAND }}>N</div>
            <div>
              <div className="text-lg font-bold text-slate-900">Owner Dashboard</div>
              <div className="text-xs text-slate-500">Welcome, {staffName} &middot; Restaurant #{restaurantId}</div>
            </div>
          </div>
          <button onClick={logout} className="text-sm text-red-500 hover:text-red-700 font-semibold">Sign Out</button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 mt-4 flex gap-2">
        {(["tables", "menu", "qr"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition ${tab === t ? "text-white shadow" : "text-slate-600 bg-white border border-slate-200 hover:bg-slate-100"}`}
            style={tab === t ? { background: BRAND } : {}}>
            {t === "tables" ? "Tables" : t === "menu" ? "Menu" : "QR Codes"}
          </button>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ── TABLES TAB ──────────────────────────────── */}
        {tab === "tables" && (
          <div>
            {/* Add table */}
            <div className="bg-white rounded-2xl shadow p-5 mb-6 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Table Number / Name</label>
                <input value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 w-40 text-slate-900" placeholder="e.g. 5" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Capacity</label>
                <input type="number" value={newTableCapacity} onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 4)}
                  className="border border-slate-300 rounded-lg px-3 py-2 w-24 text-slate-900" />
              </div>
              <button onClick={addTable} className="px-5 py-2 rounded-lg text-white font-semibold shadow" style={{ background: BRAND }}>
                Add Table
              </button>
            </div>

            {/* Table grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {tables.map((t) => (
                <div key={t.id} className="bg-white rounded-2xl shadow p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-slate-900">Table {t.number}</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor(t.status)}`}>{t.status}</span>
                  </div>
                  <div className="text-xs text-slate-500">Capacity: {t.capacity} &middot; ID: {t.id.slice(0, 8)}...</div>
                  <div className="flex gap-2 mt-auto">
                    {t.status === "inactive" && (
                      <button onClick={() => activateTable(t.id)} disabled={tableActionBusy === t.id}
                        className="flex-1 py-2 rounded-lg bg-green-500 text-white font-semibold text-sm disabled:opacity-50">
                        {tableActionBusy === t.id ? "..." : "Activate"}
                      </button>
                    )}
                    {(t.status === "active" || t.status === "dirty") && (
                      <button onClick={() => deactivateTable(t.id)} disabled={tableActionBusy === t.id}
                        className="flex-1 py-2 rounded-lg bg-orange-500 text-white font-semibold text-sm disabled:opacity-50">
                        {tableActionBusy === t.id ? "..." : "Deactivate"}
                      </button>
                    )}
                    <button onClick={() => deleteTable(t.id)} disabled={tableActionBusy === t.id}
                      className="py-2 px-3 rounded-lg bg-red-50 text-red-500 font-semibold text-sm hover:bg-red-100 disabled:opacity-50">Delete</button>
                  </div>
                </div>
              ))}
              {tables.length === 0 && (
                <div className="col-span-full text-center py-16 text-slate-400 text-lg">No tables yet. Add your first table above.</div>
              )}
            </div>
          </div>
        )}

        {/* ── MENU TAB ────────────────────────────────── */}
        {tab === "menu" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">{menuItems.length} items</h2>
              <button onClick={() => setShowAddDish(true)} className="px-5 py-2 rounded-lg text-white font-semibold shadow" style={{ background: BRAND }}>
                + Add Dish
              </button>
            </div>

            {/* Add dish modal */}
            {showAddDish && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddDish(false)}>
                <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-slate-900">Add New Dish</h3>
                  <input className="w-full border rounded-lg px-3 py-2 text-slate-900" placeholder="Dish name" value={newDish.dish_name} onChange={(e) => setNewDish({ ...newDish, dish_name: e.target.value })} />
                  <div className="flex gap-3">
                    <input type="number" className="flex-1 border rounded-lg px-3 py-2 text-slate-900" placeholder="Price" value={newDish.price || ""} onChange={(e) => setNewDish({ ...newDish, price: parseInt(e.target.value) || 0 })} />
                    <input className="flex-1 border rounded-lg px-3 py-2 text-slate-900" placeholder="Category" value={newDish.category} onChange={(e) => setNewDish({ ...newDish, category: e.target.value })} />
                  </div>
                  <input className="w-full border rounded-lg px-3 py-2 text-slate-900" placeholder="Variant (e.g. Regular, Large)" value={newDish.variant_name} onChange={(e) => setNewDish({ ...newDish, variant_name: e.target.value })} />
                  <textarea className="w-full border rounded-lg px-3 py-2 text-slate-900" rows={2} placeholder="Description" value={newDish.description} onChange={(e) => setNewDish({ ...newDish, description: e.target.value })} />
                  <div className="flex gap-3 items-center">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={newDish.category_veg === true} onChange={(e) => setNewDish({ ...newDish, category_veg: e.target.checked })} className="rounded" />
                      Veg
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={addDish} className="flex-1 py-2 rounded-lg text-white font-semibold" style={{ background: BRAND }}>Save</button>
                    <button onClick={() => setShowAddDish(false)} className="flex-1 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit dish modal */}
            {editItem && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditItem(null)}>
                <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-slate-900">Edit Dish</h3>
                  <input className="w-full border rounded-lg px-3 py-2 text-slate-900" value={editItem.dish_name} onChange={(e) => setEditItem({ ...editItem, dish_name: e.target.value })} />
                  <div className="flex gap-3">
                    <input type="number" className="flex-1 border rounded-lg px-3 py-2 text-slate-900" value={editItem.price || ""} onChange={(e) => setEditItem({ ...editItem, price: parseInt(e.target.value) || 0 })} />
                    <input className="flex-1 border rounded-lg px-3 py-2 text-slate-900" value={editItem.category} onChange={(e) => setEditItem({ ...editItem, category: e.target.value })} />
                  </div>
                  <input className="w-full border rounded-lg px-3 py-2 text-slate-900" value={editItem.variant_name} onChange={(e) => setEditItem({ ...editItem, variant_name: e.target.value })} />
                  <textarea className="w-full border rounded-lg px-3 py-2 text-slate-900" rows={2} value={editItem.description || ""} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} />
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={editItem.category_veg === true} onChange={(e) => setEditItem({ ...editItem, category_veg: e.target.checked })} className="rounded" />
                      Veg
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={editItem.availability} onChange={(e) => setEditItem({ ...editItem, availability: e.target.checked })} className="rounded" />
                      Available
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={saveEdit} className="flex-1 py-2 rounded-lg text-white font-semibold" style={{ background: BRAND }}>Save</button>
                    <button onClick={() => setEditItem(null)} className="flex-1 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Menu list by category */}
            {categories.map((cat) => (
              <div key={cat} className="mb-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">{cat}</h3>
                <div className="bg-white rounded-2xl shadow divide-y divide-slate-100">
                  {menuItems.filter((i) => (i.category || "Uncategorised") === cat).map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-3 h-3 rounded-sm border ${item.category_veg ? "border-green-500 bg-green-500" : "border-red-500 bg-red-500"}`} />
                          <span className="font-semibold text-slate-900 truncate">{item.dish_name}</span>
                          {item.variant_name && item.variant_name !== "Regular" && (
                            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 rounded">{item.variant_name}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</div>
                      </div>
                      <div className="flex items-center gap-3 ml-3">
                        <span className="font-bold text-slate-900">&#8377;{item.price}</span>
                        {!item.availability && <span className="text-xs text-red-400 font-medium">Unavailable</span>}
                        <button onClick={() => setEditItem(item)} className="text-xs px-3 py-1 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100">Edit</button>
                        <button onClick={() => removeDish(item.id)} className="text-xs px-3 py-1 rounded-lg bg-red-50 text-red-500 font-semibold hover:bg-red-100">Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {menuItems.length === 0 && <div className="text-center py-16 text-slate-400 text-lg">No menu items yet. Add your first dish!</div>}
          </div>
        )}

        {/* ── QR CODES TAB ────────────────────────────── */}
        {tab === "qr" && (
          <div>
            <p className="text-slate-600 mb-4">Print these QR codes and place them on each table. Customers scan to view your menu and order.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {tables.map((t) => {
                const qrUrl = `${FRONTEND}/table/${t.qr_token}`;
                const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}`;
                return (
                  <div key={t.id} className="bg-white rounded-2xl shadow p-6 text-center">
                    <h3 className="text-lg font-bold text-slate-900 mb-3">Table {t.number}</h3>
                    <img src={qrImage} alt={`QR for table ${t.number}`} className="mx-auto w-48 h-48 rounded-xl border border-slate-200" />
                    <div className="mt-3 text-xs text-slate-400 break-all select-all">{qrUrl}</div>
                    <button onClick={() => window.open(qrImage, "_blank")} className="mt-3 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: BRAND, color: "#fff" }}>
                      Download QR
                    </button>
                  </div>
                );
              })}
              {tables.length === 0 && <div className="col-span-full text-center py-16 text-slate-400 text-lg">Create tables first to generate QR codes.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
