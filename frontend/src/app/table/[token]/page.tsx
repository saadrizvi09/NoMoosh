"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, getWsBase } from "@/lib/api";

const BRAND = "#f97316";

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

type Phase = "loading" | "waiting" | "menu" | "payment" | "confirmed" | "countdown" | "done";

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
  const [paymentLockedBy, setPaymentLockedBy] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orderTotal, setOrderTotal] = useState(0);
  const [chefEtaMinutes, setChefEtaMinutes] = useState(0);
  const [chefEtaSetAt, setChefEtaSetAt] = useState("");
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [paymentCountdown, setPaymentCountdown] = useState(0);
  const [activeCategory, setActiveCategory] = useState("");
  const [cartBusy, setCartBusy] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [showSplit, setShowSplit] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  /* ── 1. Scan / Check table ───────────────────────────── */
  const checkTable = useCallback(async () => {
    try {
      const data = await apiGet(`/tables/scan/${qrToken}`);
      setRestaurantName(data.restaurant_name || "");
      setTableNumber(data.table_number || "");

      if (data.status === "inactive") {
        localStorage.removeItem(`nomoosh_session_${qrToken}`);
        localStorage.removeItem(`nomoosh_participant_${qrToken}`);
        setPhase("waiting");
        return;
      }

      setRestaurantId(data.restaurant_id);
      setMenu(data.menu || []);
      if (data.menu?.length) setActiveCategory(data.menu[0].category || "");

      const currentSessionId = data.session_id;
      const storedSession = localStorage.getItem(`nomoosh_session_${qrToken}`);
      const storedParticipant = localStorage.getItem(`nomoosh_participant_${qrToken}`);

      // FIX: If stored session differs from current active one, table was reactivated
      if (storedSession && storedSession !== currentSessionId) {
        localStorage.removeItem(`nomoosh_session_${qrToken}`);
        localStorage.removeItem(`nomoosh_participant_${qrToken}`);
        // fall through to join new session
      } else if (storedSession && storedParticipant && storedSession === currentSessionId) {
        setSessionId(storedSession);
        setParticipantId(storedParticipant);
        try {
          const status = await apiGet(`/sessions/${storedSession}/status`);
          if (status.participant_count) setParticipantCount(status.participant_count);
          if (status.session_status === "completed") {
            if (status.chef_eta_minutes && status.chef_eta_set_at) {
              setChefEtaMinutes(status.chef_eta_minutes);
              setChefEtaSetAt(status.chef_eta_set_at);
              setPhase("countdown");
            } else {
              setPhase("confirmed");
            }
            if (status.order) { setOrderId(status.order.id); setOrderTotal(status.order.total_amount); }
            return;
          }
          if (status.payment_lock) {
            setPaymentLocked(true);
            setPaymentLockedBy(status.payment_locked_by || "");
            setPhase("payment");
            return;
          }
        } catch {
          localStorage.removeItem(`nomoosh_session_${qrToken}`);
          localStorage.removeItem(`nomoosh_participant_${qrToken}`);
        }
        setPhase("menu");
        return;
      }

      if (currentSessionId) {
        try {
          const joined = await apiPost(`/sessions/join/${qrToken}`);
          setSessionId(joined.session_id);
          setParticipantId(joined.participant_id);
          localStorage.setItem(`nomoosh_session_${qrToken}`, joined.session_id);
          localStorage.setItem(`nomoosh_participant_${qrToken}`, joined.participant_id);
          setPhase("menu");
        } catch { setPhase("menu"); }
      } else {
        setPhase("menu");
      }
    } catch {
      setError("Could not connect to restaurant. Please try again.");
    }
  }, [qrToken]);

  useEffect(() => { checkTable(); }, [checkTable]);

  /* ── 2. Waiting WS ─────────────────────────────────── */
  useEffect(() => {
    if (phase !== "waiting") return;
    let alive = true;
    let ws: WebSocket | null = null;
    let pi: NodeJS.Timeout | null = null;
    let rt: NodeJS.Timeout | null = null;
    let rd = 2000;
    const connect = () => {
      if (!alive) return;
      ws = new WebSocket(`${getWsBase()}/ws/table/${qrToken}`);
      ws.onopen = () => { rd = 2000; pi = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); }, 30000); };
      ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.type === "table_activated") checkTable(); } catch {} };
      ws.onclose = () => { if (pi) clearInterval(pi); if (alive) { rt = setTimeout(connect, rd); rd = Math.min(rd * 2, 30000); } };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => { alive = false; if (pi) clearInterval(pi); if (rt) clearTimeout(rt); ws?.close(); };
  }, [phase, qrToken, checkTable]);

  /* ── 3. Session WS ─────────────────────────────────── */
  const rdRef = useRef(1000);
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    let pi: NodeJS.Timeout | null = null;
    const connect = () => {
      if (!alive || !mountedRef.current) return;
      const ws = new WebSocket(`${getWsBase()}/ws/${sessionId}`);
      wsRef.current = ws;
      ws.onopen = () => { wsConnectedRef.current = true; rdRef.current = 1000; pi = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); }, 30000); };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "pong") return;
          if (msg.type === "init") {
            const c = msg.cart || {}; setCart(c.items || []); setCartTotal(c.total || 0); setCartVersion(c.version || 0);
            const s = msg.session || {};
            if (s.session_status === "completed") {
              if (s.order) { setOrderId(s.order.id); setOrderTotal(s.order.total_amount); }
              if (s.chef_eta_minutes && s.chef_eta_set_at) { setChefEtaMinutes(s.chef_eta_minutes); setChefEtaSetAt(s.chef_eta_set_at); setPhase("countdown"); }
              else setPhase("confirmed");
            } else if (s.payment_lock) { setPaymentLocked(true); setPaymentLockedBy(s.payment_locked_by || ""); setPhase("payment"); }
          }
          else if (msg.type === "cart_update" && msg.cart) { setCart(msg.cart.items || []); setCartTotal(msg.cart.total || 0); setCartVersion(msg.cart.version || 0); }
          else if (msg.type === "payment_locked") { setPaymentLocked(true); setPaymentLockedBy(msg.locked_by || ""); setPhase("payment"); }
          else if (msg.type === "payment_unlocked") { setPaymentLocked(false); setPaymentLockedBy(""); setPhase("menu"); }
          else if (msg.type === "order_confirmed") { setOrderId(msg.order_id); setOrderTotal(msg.total); setPhase("confirmed"); }
          else if (msg.type === "chef_eta") { setChefEtaMinutes(msg.minutes); setChefEtaSetAt(msg.set_at); setPhase("countdown"); }
        } catch {}
      };
      ws.onclose = () => { wsConnectedRef.current = false; if (pi) clearInterval(pi); if (alive && mountedRef.current) { const d = rdRef.current; rdRef.current = Math.min(d * 2, 30000); reconnectTimerRef.current = setTimeout(connect, d); } };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { alive = false; if (pi) clearInterval(pi); if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); wsRef.current?.close(); wsConnectedRef.current = false; };
  }, [sessionId]);

  /* ── 4. Timers ─────────────────────────────────────── */
  useEffect(() => { if (phase !== "countdown" && phase !== "payment") return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [phase]);
  useEffect(() => { if (phase !== "payment") { setPaymentCountdown(0); return; } const id = setInterval(() => setPaymentCountdown(p => p <= 0 ? 120 : p - 1), 1000); setPaymentCountdown(120); return () => clearInterval(id); }, [phase]);

  /* ── Cart actions — OPTIMISTIC ──────────────────────── */
  const addToCart = async (menuItemId: number) => {
    if (paymentLocked || cartBusy) return;
    setCartBusy(true);
    const mi = menu.find(m => m.id === menuItemId);
    if (mi) {
      setCart(prev => {
        const ex = prev.find(c => c.menu_item_id === menuItemId);
        if (ex) return prev.map(c => c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + 1 } : c);
        return [...prev, { id: `t_${Date.now()}`, menu_item_id: menuItemId, quantity: 1, dish_name: mi.dish_name, price: mi.price, category: mi.category, variant_name: mi.variant_name }];
      });
      setCartTotal(p => p + mi.price);
    }
    try { 
      const r = await apiPost("/cart/add", { session_id: sessionId, menu_item_id: menuItemId, quantity: 1, participant_id: participantId }); 
      // Only reconcile if this response is newer than current state (prevents slow API responses from overwriting fast WS updates)
      setCartVersion(prev => {
        if ((r.version || 0) > prev) {
          setCart(r.items || []);
          setCartTotal(r.total || 0);
          return r.version || 0;
        }
        return prev;
      });
    } catch {}
    setCartBusy(false);
  };

  const removeFromCart = async (cartItemId: string) => {
    if (paymentLocked || cartBusy) return;
    setCartBusy(true);
    const it = cart.find(c => c.id === cartItemId);
    if (it) { setCart(prev => prev.filter(c => c.id !== cartItemId)); setCartTotal(p => p - it.price * it.quantity); }
    try { 
      const r = await apiPost("/cart/remove", { session_id: sessionId, cart_item_id: cartItemId }); 
      setCartVersion(prev => {
        if ((r.version || 0) > prev) {
          setCart(r.items || []);
          setCartTotal(r.total || 0);
          return r.version || 0;
        }
        return prev;
      });
    } catch {}
    setCartBusy(false);
  };

  const updateQty = async (cartItemId: string, qty: number) => {
    if (paymentLocked || cartBusy) return;
    setCartBusy(true);
    const it = cart.find(c => c.id === cartItemId);
    if (it) {
      if (qty <= 0) { setCart(prev => prev.filter(c => c.id !== cartItemId)); setCartTotal(p => p - it.price * it.quantity); }
      else { setCart(prev => prev.map(c => c.id === cartItemId ? { ...c, quantity: qty } : c)); setCartTotal(p => p + it.price * (qty - it.quantity)); }
    }
    try { 
      const r = await apiPost("/cart/update-quantity", { session_id: sessionId, cart_item_id: cartItemId, quantity: qty }); 
      setCartVersion(prev => {
        if ((r.version || 0) > prev) {
          setCart(r.items || []);
          setCartTotal(r.total || 0);
          return r.version || 0;
        }
        return prev;
      });
    } catch {}
    setCartBusy(false);
  };

  /* ── Payment ──────────────────────────────────────── */
  const initiatePayment = async () => {
    try { await apiPost("/payment/lock", { session_id: sessionId, participant_id: participantId }); setPaymentLocked(true); setPaymentLockedBy(participantId); setPhase("payment"); }
    catch (err: any) { setError(err.message || "Could not initiate payment"); }
  };
  const cancelPayment = async () => {
    try { await apiPost("/payment/unlock", { session_id: sessionId, participant_id: participantId }); setPaymentLocked(false); setPaymentLockedBy(""); setPhase("menu"); }
    catch (err: any) { setError(err.message || "Could not cancel"); }
  };
  const confirmPayment = async () => {
    try { const r = await apiPost("/payment/confirm", { session_id: sessionId, participant_id: participantId }); setOrderId(r.order_id); setOrderTotal(r.total); setPhase("confirmed"); }
    catch (err: any) { setError(err.message || "Payment failed"); }
  };

  /* ── Helpers ─────────────────────────────────────── */
  const categories = [...new Set(menu.map(i => i.category || "Other"))];
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const isMyLock = paymentLockedBy === participantId;
  const splitAmt = participantCount > 1 ? Math.ceil(cartTotal / participantCount) : cartTotal;

  const fmtCD = () => {
    if (!chefEtaSetAt || !chefEtaMinutes) return "";
    const end = new Date(chefEtaSetAt).getTime() + chefEtaMinutes * 60000;
    const rem = Math.max(0, end - now);
    if (rem <= 0) return "ready";
    return `${Math.floor(rem / 60000)}:${Math.floor((rem % 60000) / 1000).toString().padStart(2, "0")}`;
  };

  const getQty = (id: number) => cart.find(c => c.menu_item_id === id)?.quantity || 0;
  const getCI = (id: number) => cart.find(c => c.menu_item_id === id);
  const filtered = menu.filter(i => { const ok = (i.category || "Other") === activeCategory; return !searchQuery ? ok : ok && i.dish_name.toLowerCase().includes(searchQuery.toLowerCase()); });

  /* ═══════ RENDER ═══════ */

  if (phase === "loading")
    return (<div className="min-h-screen flex items-center justify-center bg-white"><div className="text-center"><div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-extrabold text-xl mx-auto mb-4 animate-pulse" style={{ background: BRAND }}>N</div><div className="text-gray-400 text-sm">Connecting...</div></div></div>);

  if (phase === "waiting")
    return (<div className="min-h-screen flex items-center justify-center bg-white p-6"><div className="text-center max-w-xs"><div className="h-14 w-14 rounded-full flex items-center justify-center text-white text-2xl font-extrabold mx-auto mb-5" style={{ background: BRAND }}>N</div><h1 className="text-xl font-bold text-gray-900 mb-1">Welcome!</h1><p className="text-gray-600 text-sm">{restaurantName}</p><p className="text-gray-400 text-xs mb-5">Table {tableNumber}</p><div className="bg-orange-50 rounded-2xl p-6 border border-orange-100"><div className="w-10 h-10 border-[3px] border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" /><p className="font-semibold text-gray-700 text-sm">Waiting for activation</p><p className="text-xs text-gray-400 mt-1">The waiter will activate your table shortly</p></div></div></div>);

  if (phase === "countdown") {
    const cd = fmtCD(); const ready = cd === "ready";
    return (<div className="min-h-screen flex items-center justify-center bg-white p-6"><div className="text-center max-w-xs w-full"><p className="text-sm font-semibold text-gray-500 mb-1">{restaurantName}</p><p className="text-xs text-gray-400 mb-6">Table {tableNumber}</p>
      {ready ? (<div className="rounded-2xl p-8 bg-green-500"><div className="text-5xl mb-3">🍽️</div><h2 className="text-2xl font-bold text-white">Order is ready!</h2><p className="text-green-100 text-sm mt-2">The waiter will serve you shortly</p></div>)
      : (<div className="rounded-2xl p-8 bg-orange-50 border border-orange-100"><p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-semibold">Estimated time</p><div className="text-5xl font-bold mb-2" style={{ color: BRAND }}>{cd}</div><p className="text-gray-400 text-xs">Your food is being prepared</p>{chefEtaMinutes > 0 && <p className="text-xs text-gray-400 mt-2">Chef estimated {chefEtaMinutes} min</p>}<div className="mt-4 pt-3 border-t border-orange-100 text-xs text-gray-500">Total: <span className="font-bold text-gray-700">&#8377;{orderTotal}</span></div></div>)}
    </div></div>);
  }

  if (phase === "confirmed")
    return (<div className="min-h-screen flex items-center justify-center bg-white p-6"><div className="text-center max-w-xs w-full"><p className="text-sm font-semibold text-gray-500 mb-1">{restaurantName}</p><p className="text-xs text-gray-400 mb-6">Table {tableNumber}</p><div className="bg-orange-50 rounded-2xl p-8 border border-orange-100"><div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: BRAND }}><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg></div><h2 className="text-xl font-bold text-gray-900 mb-1">Order Confirmed!</h2><p className="text-gray-500 text-sm mb-4">Total: &#8377;{orderTotal}</p><div className="w-8 h-8 border-[3px] border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-2" /><p className="text-xs text-gray-400">Waiting for chef to set prep time...</p></div></div></div>);

  if (phase === "payment") {
    if (!isMyLock && paymentLockedBy)
      return (<div className="min-h-screen flex items-center justify-center bg-white p-6"><div className="text-center max-w-xs w-full"><p className="text-sm font-semibold text-gray-500 mb-1">{restaurantName}</p><p className="text-xs text-gray-400 mb-6">Table {tableNumber}</p><div className="bg-orange-50 rounded-2xl p-8 border border-orange-100"><div className="text-4xl mb-3">💳</div><h2 className="text-lg font-bold text-gray-900 mb-2">Payment in Progress</h2><p className="text-gray-500 text-sm">Someone at your table is completing the payment.</p><div className="mt-4 w-8 h-8 border-[3px] border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto" /></div></div></div>);

    return (<div className="min-h-screen bg-white p-4"><div className="max-w-sm mx-auto">
      <button onClick={cancelPayment} className="flex items-center gap-1 text-sm font-semibold text-gray-600 mb-4 active:opacity-60"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Back to menu</button>
      <h1 className="text-lg font-bold text-gray-900 mb-1">Confirm Payment</h1>
      <p className="text-xs text-gray-400 mb-4">{restaurantName} &middot; Table {tableNumber}</p>
      <div className="bg-red-50 rounded-xl px-3 py-2 mb-4 flex items-center justify-between"><span className="text-xs text-red-600 font-medium">Auto-cancels in</span><span className="text-sm font-bold text-red-600">{Math.floor(paymentCountdown / 60)}:{(paymentCountdown % 60).toString().padStart(2, "0")}</span></div>
      <div className="bg-gray-50 rounded-xl p-3 mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Order Summary</div>
        {cart.map(item => (<div key={item.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0"><div className="flex-1 min-w-0"><span className="text-gray-800">{item.dish_name}</span>{item.variant_name !== "Regular" && <span className="text-gray-400 ml-1 text-xs">({item.variant_name})</span>}<span className="text-gray-400 ml-1">x{item.quantity}</span></div><span className="font-semibold text-gray-900 ml-2">&#8377;{item.price * item.quantity}</span></div>))}
        <div className="flex justify-between font-bold text-gray-900 pt-2 mt-1 border-t border-gray-200"><span>Total</span><span>&#8377;{cartTotal}</span></div>
      </div>
      {participantCount > 1 && (<button onClick={() => setShowSplit(!showSplit)} className="w-full mb-3 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-sm font-semibold active:bg-orange-100" style={{ color: BRAND }}>{showSplit ? "Hide" : "Split"} Bill &middot; {participantCount} people</button>)}
      {showSplit && participantCount > 1 && (<div className="bg-orange-50 rounded-xl p-3 mb-4 border border-orange-100"><div className="text-xs text-gray-500 mb-1">Split equally among {participantCount} people</div><div className="text-2xl font-bold" style={{ color: BRAND }}>&#8377;{splitAmt} <span className="text-sm font-normal text-gray-400">per person</span></div></div>)}
      <div className="space-y-2.5">
        <button onClick={confirmPayment} className="w-full py-3.5 rounded-xl text-white font-bold text-base active:scale-[0.98] transition shadow-sm" style={{ background: BRAND }}>Pay with UPI &middot; &#8377;{cartTotal}</button>
        <button onClick={confirmPayment} className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm active:scale-[0.98] transition">Pay with Card</button>
        <button onClick={confirmPayment} className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm active:scale-[0.98] transition">Cash Payment</button>
      </div>
    </div></div>);
  }

  /* ═══════ MENU PHASE ═══════ */
  return (
    <div className="min-h-screen bg-white pb-24">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="px-4 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <div><h1 className="text-base font-bold text-gray-900 leading-tight">{restaurantName}</h1><p className="text-[11px] text-gray-400">Table {tableNumber}</p></div>
            <button onClick={() => setShowCart(true)} className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs text-white active:scale-95 transition" style={{ background: cartItemCount > 0 ? BRAND : "#9ca3af" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
              Cart
              {cartItemCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">{cartItemCount}</span>}
            </button>
          </div>
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Search dishes..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-50 text-xs text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-orange-200 border border-gray-100" />
          </div>
          {categories.length > 1 && (<div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">{categories.map(cat => (<button key={cat} onClick={() => { setActiveCategory(cat); setSearchQuery(""); }} className={`whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-semibold transition border ${activeCategory === cat ? "text-white border-transparent" : "text-gray-600 bg-white border-gray-200"}`} style={activeCategory === cat ? { background: BRAND, borderColor: BRAND } : {}}>{cat || "Other"}</button>))}</div>)}
        </div>
      </header>

      {error && (<div className="mx-4 mt-2 bg-red-50 text-red-600 rounded-lg px-3 py-2 text-xs flex justify-between">{error}<button onClick={() => setError("")} className="ml-2 font-bold">×</button></div>)}

      <div className="px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(item => {
            const q = getQty(item.id), ci = getCI(item.id);
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="p-2.5 flex flex-col h-full">
                  <div className="flex items-start gap-1 mb-0.5">
                    <span className={`mt-0.5 shrink-0 inline-flex w-3 h-3 rounded-sm border-2 items-center justify-center ${item.category_veg ? "border-green-600" : "border-red-600"}`}><span className={`w-1.5 h-1.5 rounded-full ${item.category_veg ? "bg-green-600" : "bg-red-600"}`} /></span>
                    <span className="font-semibold text-gray-900 text-xs leading-snug line-clamp-2">{item.dish_name}</span>
                  </div>
                  {item.variant_name && item.variant_name !== "Regular" && <span className="text-[10px] text-gray-400">{item.variant_name}</span>}
                  {item.description && <p className="text-[10px] text-gray-400 line-clamp-2 mt-0.5">{item.description}</p>}
                  <div className="mt-auto pt-2 flex items-end justify-between">
                    <span className="text-sm font-bold text-gray-900">&#8377;{item.price}</span>
                    {q === 0
                      ? <button onClick={() => addToCart(item.id)} className="px-3.5 py-1 rounded-lg text-[11px] font-bold border-2 active:scale-95 transition" style={{ color: BRAND, borderColor: BRAND }}>ADD</button>
                      : <div className="flex items-center rounded-lg overflow-hidden border-2" style={{ borderColor: BRAND }}>
                          <button onClick={() => ci && updateQty(ci.id, q - 1)} className="w-6 h-6 flex items-center justify-center text-xs font-bold active:bg-orange-50" style={{ color: BRAND }}>−</button>
                          <span className="w-4 text-center text-[11px] font-bold" style={{ color: BRAND }}>{q}</span>
                          <button onClick={() => addToCart(item.id)} className="w-6 h-6 flex items-center justify-center text-white text-xs font-bold active:opacity-80" style={{ background: BRAND }}>+</button>
                        </div>
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">No dishes found</div>}
      </div>

      {/* Floating cart bar */}
      {cartItemCount > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
          <button onClick={() => setShowCart(true)} className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-between px-4 active:scale-[0.98] transition shadow-lg" style={{ background: BRAND }}>
            <span className="flex items-center gap-2"><span className="bg-white/20 text-[11px] rounded px-1.5 py-0.5">{cartItemCount}</span>item{cartItemCount > 1 ? "s" : ""} added</span>
            <span className="flex items-center gap-1">&#8377;{cartTotal}<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowCart(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-4 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Your Cart</h2>
              <button onClick={() => setShowCart(false)} className="text-gray-400 text-xl p-1">&times;</button>
            </div>
            {cart.length === 0 ? (<div className="p-10 text-center text-gray-400 text-sm">Cart is empty</div>) : (
              <div className="p-4 space-y-2">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-1">
                    <div className="flex-1 min-w-0 mr-3"><div className="font-semibold text-gray-900 text-sm truncate">{item.dish_name}</div>{item.variant_name !== "Regular" && <div className="text-[11px] text-gray-400">{item.variant_name}</div>}<div className="text-xs text-gray-500">&#8377;{item.price}</div></div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg overflow-hidden border-2" style={{ borderColor: BRAND }}>
                        <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-7 h-7 flex items-center justify-center text-sm font-bold active:bg-orange-50" style={{ color: BRAND }}>−</button>
                        <span className="w-5 text-center font-bold text-xs" style={{ color: BRAND }}>{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-7 h-7 flex items-center justify-center text-white text-sm font-bold active:opacity-80" style={{ background: BRAND }}>+</button>
                      </div>
                      <span className="font-bold text-gray-900 text-sm w-14 text-right">&#8377;{item.price * item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cart.length > 0 && (
              <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
                <div className="flex items-center justify-between text-sm font-bold text-gray-900 mb-3"><span>Total</span><span>&#8377;{cartTotal}</span></div>
                <button onClick={() => { setShowCart(false); initiatePayment(); }} className="w-full py-3.5 rounded-xl text-white font-bold text-sm active:scale-[0.98] transition shadow-sm" style={{ background: BRAND }}>Place Order &amp; Pay &middot; &#8377;{cartTotal}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
