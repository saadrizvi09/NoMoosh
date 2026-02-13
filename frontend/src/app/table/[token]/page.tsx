"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, getWsBase } from "@/lib/api";

const BRAND = "#1c37b3";

/* ── Types ─────────────────────────────────────────────── */
interface MenuItem {
  id: number;
  dish_name: string;
  price: number;
  category: string;
  image_link: string | null;
  variant_name: string;
  description: string;
  category_veg: boolean | null;
}

interface CartItem {
  id: string;
  menu_item_id: number;
  quantity: number;
  dish_name: string;
  price: number;
  category: string | null;
  variant_name: string;
}

type Phase =
  | "loading"
  | "waiting"
  | "menu"
  | "payment"
  | "confirmed"
  | "countdown"
  | "done";

/* ── Page ──────────────────────────────────────────────── */
export default function TablePage() {
  const params = useParams();
  const qrToken = params.token as string;

  const [phase, setPhase] = useState<Phase>("loading");
  const [restaurantName, setRestaurantName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [restaurantId, setRestaurantId] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [cartVersion, setCartVersion] = useState(0);
  const [showCart, setShowCart] = useState(false);
  const [paymentLocked, setPaymentLocked] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderTotal, setOrderTotal] = useState(0);
  const [chefEtaMinutes, setChefEtaMinutes] = useState(0);
  const [chefEtaSetAt, setChefEtaSetAt] = useState("");
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [paymentCountdown, setPaymentCountdown] = useState(0);
  const [activeCategory, setActiveCategory] = useState("");
  const [cartBusy, setCartBusy] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* ── 1. Scan / Check table ───────────────────────────── */
  const checkTable = useCallback(async () => {
    try {
      const data = await apiGet(`/tables/scan/${qrToken}`);
      setRestaurantName(data.restaurant_name || "");
      setTableNumber(data.table_number || "");

      if (data.status === "inactive") {
        setPhase("waiting");
        return;
      }

      // Table is active
      setRestaurantId(data.restaurant_id);
      setMenu(data.menu || []);
      if (data.menu?.length) setActiveCategory(data.menu[0].category || "");

      // Check if we already have a session for this token
      const storedSession = localStorage.getItem(`nomoosh_session_${qrToken}`);
      const storedParticipant = localStorage.getItem(`nomoosh_participant_${qrToken}`);

      if (storedSession && storedParticipant) {
        setSessionId(storedSession);
        setParticipantId(storedParticipant);

        // Check session status
        try {
          const status = await apiGet(`/sessions/${storedSession}/status`);
          if (status.session_status === "completed") {
            if (status.chef_eta_minutes && status.chef_eta_set_at) {
              setChefEtaMinutes(status.chef_eta_minutes);
              setChefEtaSetAt(status.chef_eta_set_at);
              setPhase("countdown");
            } else {
              setPhase("confirmed");
            }
            if (status.order) {
              setOrderId(status.order.id);
              setOrderTotal(status.order.total_amount);
            }
            return;
          }
          if (status.payment_lock) {
            setPaymentLocked(true);
            setPhase("payment");
            return;
          }
        } catch {
          // Session might be invalid, rejoin
        }

        setPhase("menu");
      } else if (data.session_id) {
        // Join the session
        try {
          const joined = await apiPost(`/sessions/join/${qrToken}`);
          setSessionId(joined.session_id);
          setParticipantId(joined.participant_id);
          localStorage.setItem(`nomoosh_session_${qrToken}`, joined.session_id);
          localStorage.setItem(`nomoosh_participant_${qrToken}`, joined.participant_id);
          setPhase("menu");
        } catch {
          setPhase("menu");
        }
      } else {
        setPhase("menu");
      }
    } catch {
      setError("Could not connect to restaurant. Please try again.");
    }
  }, [qrToken]);

  useEffect(() => { checkTable(); }, [checkTable]);

  /* ── 2. Waiting WS — instant notification when table is activated ── */
  useEffect(() => {
    if (phase !== "waiting") return;
    let alive = true;
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectDelay = 2000;

    const connect = () => {
      if (!alive) return;
      ws = new WebSocket(`${getWsBase()}/ws/table/${qrToken}`);

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
          if (msg.type === "table_activated") checkTable();
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
  }, [phase, qrToken, checkTable]);

  /* ── 3. Session WS — all real-time state via push ────────── */
  const reconnectDelayRef = useRef(1000);

  useEffect(() => {
    if (!sessionId) return;

    let alive = true;
    let pingInterval: NodeJS.Timeout | null = null;

    const connect = () => {
      if (!alive || !mountedRef.current) return;
      const ws = new WebSocket(`${getWsBase()}/ws/${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        wsConnectedRef.current = true;
        reconnectDelayRef.current = 1000;
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "ping" }));
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") return;

          if (msg.type === "init") {
            // Full state sync (on connect / reconnect)
            const c = msg.cart || {};
            setCart(c.items || []);
            setCartTotal(c.total || 0);
            setCartVersion(c.version || 0);

            const s = msg.session || {};
            if (s.session_status === "completed") {
              if (s.order) { setOrderId(s.order.id); setOrderTotal(s.order.total_amount); }
              if (s.chef_eta_minutes && s.chef_eta_set_at) {
                setChefEtaMinutes(s.chef_eta_minutes);
                setChefEtaSetAt(s.chef_eta_set_at);
                setPhase("countdown");
              } else {
                setPhase("confirmed");
              }
            } else if (s.payment_lock) {
              setPaymentLocked(true);
              setPhase("payment");
            }
            // else: stay in current phase ("menu")
          }
          else if (msg.type === "cart_update" && msg.cart) {
            setCart(msg.cart.items || []);
            setCartTotal(msg.cart.total || 0);
            setCartVersion(msg.cart.version || 0);
          }
          else if (msg.type === "payment_locked") {
            setPaymentLocked(true);
            setPhase("payment");
          }
          else if (msg.type === "payment_unlocked") {
            setPaymentLocked(false);
            setPhase("menu");
          }
          else if (msg.type === "order_confirmed") {
            setOrderId(msg.order_id);
            setOrderTotal(msg.total);
            setPhase("confirmed");
          }
          else if (msg.type === "chef_eta") {
            setChefEtaMinutes(msg.minutes);
            setChefEtaSetAt(msg.set_at);
            setPhase("countdown");
          }
        } catch (e) {
          console.warn("WS parse error:", e);
        }
      };

      ws.onclose = () => {
        wsConnectedRef.current = false;
        if (pingInterval) clearInterval(pingInterval);
        if (alive && mountedRef.current) {
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(delay * 2, 30000);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      alive = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsConnectedRef.current = false;
    };
  }, [sessionId]);

  /* ── 4. Countdown timer tick ─────────────────────────── */
  useEffect(() => {
    if (phase !== "countdown" && phase !== "payment") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  /* ── Payment countdown (2 min) ───────────────────────── */
  useEffect(() => {
    if (phase !== "payment") { setPaymentCountdown(0); return; }
    const id = setInterval(() => {
      setPaymentCountdown((p) => {
        if (p <= 0) return 120;
        return p - 1;
      });
    }, 1000);
    setPaymentCountdown(120);
    return () => clearInterval(id);
  }, [phase]);

  /* ── Cart actions (with busy guard) ──────────────────── */
  const addToCart = async (menuItemId: number) => {
    if (paymentLocked || cartBusy) return;
    setCartBusy(true);
    try {
      const result = await apiPost("/cart/add", {
        session_id: sessionId,
        menu_item_id: menuItemId,
        quantity: 1,
        participant_id: participantId,
      });
      setCart(result.items || []);
      setCartTotal(result.total || 0);
      setCartVersion(result.version || 0);
    } catch { }
    setCartBusy(false);
  };

  const removeFromCart = async (cartItemId: string) => {
    if (paymentLocked || cartBusy) return;
    setCartBusy(true);
    try {
      const result = await apiPost("/cart/remove", { session_id: sessionId, cart_item_id: cartItemId });
      setCart(result.items || []);
      setCartTotal(result.total || 0);
    } catch { }
    setCartBusy(false);
  };

  const updateQty = async (cartItemId: string, qty: number) => {
    if (paymentLocked || cartBusy) return;
    setCartBusy(true);
    try {
      const result = await apiPost("/cart/update-quantity", { session_id: sessionId, cart_item_id: cartItemId, quantity: qty });
      setCart(result.items || []);
      setCartTotal(result.total || 0);
    } catch { }
    setCartBusy(false);
  };

  /* ── Payment actions ─────────────────────────────────── */
  const initiatePayment = async () => {
    try {
      await apiPost("/payment/lock", { session_id: sessionId, participant_id: participantId });
      setPaymentLocked(true);
      setPhase("payment");
    } catch (err: any) {
      setError(err.message || "Could not initiate payment");
    }
  };

  const confirmPayment = async () => {
    try {
      const result = await apiPost("/payment/confirm", { session_id: sessionId, participant_id: participantId });
      setOrderId(result.order_id);
      setOrderTotal(result.total);
      setPhase("confirmed");
    } catch (err: any) {
      setError(err.message || "Payment failed");
    }
  };

  /* ── Helpers ─────────────────────────────────────────── */
  const categories = [...new Set(menu.map((i) => i.category || "Other"))];
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  const formatCountdown = () => {
    if (!chefEtaSetAt || !chefEtaMinutes) return "";
    const end = new Date(chefEtaSetAt).getTime() + chefEtaMinutes * 60000;
    const rem = Math.max(0, end - now);
    if (rem <= 0) return "Your order is ready!";
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getCartQty = (menuItemId: number) => {
    const item = cart.find((c) => c.menu_item_id === menuItemId);
    return item ? item.quantity : 0;
  };

  const getCartItem = (menuItemId: number) => cart.find((c) => c.menu_item_id === menuItemId);

  /* ── RENDER ──────────────────────────────────────────── */

  // Loading
  if (phase === "loading")
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-extrabold text-xl mx-auto mb-4 animate-pulse" style={{ background: BRAND }}>N</div>
          <div className="text-slate-500">Connecting to restaurant...</div>
        </div>
      </div>
    );

  // Waiting for activation
  if (phase === "waiting")
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-6">
        <div className="text-center max-w-sm">
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-white text-3xl font-extrabold mx-auto mb-6 shadow-lg" style={{ background: BRAND }}>N</div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Welcome!</h1>
          <p className="text-slate-600 mb-1">{restaurantName}</p>
          <p className="text-slate-500 text-sm mb-6">Table {tableNumber}</p>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-semibold text-slate-700">Waiting for activation...</p>
            <p className="text-sm text-slate-400 mt-2">The waiter will activate your table shortly.</p>
          </div>
        </div>
      </div>
    );

  // Chef countdown
  if (phase === "countdown") {
    const countdownText = formatCountdown();
    const isReady = countdownText === "Your order is ready!";
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-6">
        <div className="text-center max-w-sm w-full">
          <h1 className="text-xl font-bold text-slate-900 mb-1">{restaurantName}</h1>
          <p className="text-slate-500 text-sm mb-6">Table {tableNumber}</p>
          <div className={`rounded-3xl shadow-2xl p-8 ${isReady ? "bg-green-500" : "bg-white"}`}>
            {isReady ? (
              <>
                <div className="text-6xl mb-4">🍽️</div>
                <h2 className="text-3xl font-extrabold text-white">Your order is ready!</h2>
                <p className="text-green-100 mt-2">Please wait for the waiter to serve.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-2">Estimated time remaining</p>
                <div className="text-6xl font-extrabold mb-3" style={{ color: BRAND }}>{countdownText}</div>
                <p className="text-slate-400 text-sm">Your food is being prepared with care</p>
                <div className="mt-4 text-xs text-slate-400">Order total: &#8377;{orderTotal}</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Order confirmed — waiting for chef
  if (phase === "confirmed")
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-6">
        <div className="text-center max-w-sm w-full">
          <h1 className="text-xl font-bold text-slate-900 mb-1">{restaurantName}</h1>
          <p className="text-slate-500 text-sm mb-6">Table {tableNumber}</p>
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Order Confirmed!</h2>
            <p className="text-slate-500 mb-4">Total: &#8377;{orderTotal}</p>
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Waiting for the chef to set preparation time...</p>
          </div>
        </div>
      </div>
    );

  // Payment in progress
  if (phase === "payment")
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-white p-6 flex items-center justify-center">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-1">{restaurantName}</h1>
          <p className="text-slate-500 text-sm mb-6">Table {tableNumber}</p>
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-5xl mb-4">💳</div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Payment in Progress</h2>
            <p className="text-3xl font-extrabold mb-3" style={{ color: BRAND }}>&#8377;{cartTotal}</p>

            {/* Timer */}
            <div className="text-sm text-slate-500 mb-4">
              Auto-cancels in: <span className="font-bold text-red-500">{Math.floor(paymentCountdown / 60)}:{(paymentCountdown % 60).toString().padStart(2, "0")}</span>
            </div>

            {/* Cart summary */}
            <div className="bg-slate-50 rounded-xl p-3 mb-5 text-left max-h-40 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between text-sm py-1">
                  <span className="text-slate-700">{item.dish_name} x{item.quantity}</span>
                  <span className="font-semibold text-slate-900">&#8377;{item.price * item.quantity}</span>
                </div>
              ))}
            </div>

            {/* Payment methods (simulated) */}
            <div className="space-y-3">
              <button onClick={confirmPayment}
                className="w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg active:scale-95 transition"
                style={{ background: BRAND }}>
                Pay with UPI
              </button>
              <button onClick={confirmPayment}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-base active:scale-95 transition">
                Pay with Card
              </button>
              <button onClick={confirmPayment}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-base active:scale-95 transition">
                Cash Payment
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  /* ── MENU PHASE (main view) ──────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white shadow-sm border-b border-slate-200">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">{restaurantName}</h1>
              <p className="text-xs text-slate-500">Table {tableNumber}</p>
            </div>
            <button onClick={() => setShowCart(true)} className="relative px-4 py-2 rounded-xl text-white font-semibold text-sm shadow" style={{ background: BRAND }}>
              Cart
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{cartItemCount}</span>
              )}
            </button>
          </div>

          {/* Category pills */}
          {categories.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-semibold transition ${activeCategory === cat ? "text-white shadow" : "text-slate-600 bg-white border border-slate-200"}`}
                  style={activeCategory === cat ? { background: BRAND } : {}}>
                  {cat || "Other"}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 bg-red-50 text-red-600 rounded-lg px-4 py-2 text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">✕</button>
        </div>
      )}

      {/* Menu items */}
      <div className="px-4 py-4 space-y-3">
        {menu
          .filter((i) => (i.category || "Other") === activeCategory)
          .map((item) => {
            const qty = getCartQty(item.id);
            const ci = getCartItem(item.id);
            return (
              <div key={item.id} className="bg-white rounded-2xl shadow p-4 flex items-center gap-4">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-3 h-3 rounded-sm border ${item.category_veg ? "border-green-500 bg-green-500" : "border-red-500 bg-red-500"}`} />
                    <span className="font-semibold text-slate-900 truncate">{item.dish_name}</span>
                  </div>
                  {item.variant_name && item.variant_name !== "Regular" && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 rounded mt-0.5 inline-block">{item.variant_name}</span>
                  )}
                  {item.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{item.description}</p>}
                  <div className="mt-1 font-bold text-slate-900">&#8377;{item.price}</div>
                </div>

                {/* Add / Qty controls */}
                <div className="flex-shrink-0">
                  {qty === 0 ? (
                    <button onClick={() => addToCart(item.id)}
                      className="px-6 py-2 rounded-xl text-white font-bold text-sm shadow active:scale-95 transition"
                      style={{ background: BRAND }}>
                      ADD
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-2 py-1">
                      <button onClick={() => ci && updateQty(ci.id, qty - 1)}
                        className="w-8 h-8 rounded-lg bg-white shadow text-lg font-bold text-slate-600 flex items-center justify-center active:scale-90">
                        −
                      </button>
                      <span className="w-6 text-center font-bold text-slate-900">{qty}</span>
                      <button onClick={() => addToCart(item.id)}
                        className="w-8 h-8 rounded-lg text-white shadow text-lg font-bold flex items-center justify-center active:scale-90"
                        style={{ background: BRAND }}>
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Floating cart bar */}
      {cartItemCount > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4">
          <button onClick={() => setShowCart(true)}
            className="w-full py-4 rounded-2xl text-white font-bold text-lg shadow-2xl flex items-center justify-between px-6 active:scale-[0.98] transition"
            style={{ background: BRAND }}>
            <span>{cartItemCount} item{cartItemCount > 1 ? "s" : ""}</span>
            <span>View Cart — &#8377;{cartTotal}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowCart(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 pt-4 pb-2 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-slate-900">Your Cart</h2>
              <button onClick={() => setShowCart(false)} className="text-slate-400 text-2xl">&times;</button>
            </div>

            {cart.length === 0 ? (
              <div className="p-10 text-center text-slate-400">Cart is empty</div>
            ) : (
              <div className="p-5 space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{item.dish_name}</div>
                      {item.variant_name !== "Regular" && <div className="text-xs text-slate-400">{item.variant_name}</div>}
                      <div className="text-sm text-slate-500">&#8377;{item.price} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-100 rounded-xl px-2 py-1">
                        <button onClick={() => updateQty(item.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-white shadow text-sm font-bold text-slate-600 flex items-center justify-center">−</button>
                        <span className="w-6 text-center font-bold text-sm text-slate-900">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg text-white shadow text-sm font-bold flex items-center justify-center"
                          style={{ background: BRAND }}>+</button>
                      </div>
                      <span className="font-bold text-slate-900 w-16 text-right">&#8377;{item.price * item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="sticky bottom-0 bg-white border-t border-slate-200 p-5">
                <div className="flex items-center justify-between text-lg font-bold text-slate-900 mb-4">
                  <span>Total</span>
                  <span>&#8377;{cartTotal}</span>
                </div>
                <button onClick={() => { setShowCart(false); initiatePayment(); }}
                  className="w-full py-4 rounded-2xl text-white font-bold text-lg shadow-xl active:scale-[0.98] transition"
                  style={{ background: BRAND }}>
                  Place Order &amp; Pay — &#8377;{cartTotal}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
