"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";

const BRAND = "#f97316";

export default function StaffSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    restaurantId: "",
    role: "owner",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fromRegistration, setFromRegistration] = React.useState(false);

  // Pre-fill restaurant ID if coming from registration
  React.useEffect(() => {
    const pendingId = localStorage.getItem("pending_restaurant_id");
    if (pendingId) {
      setForm(prev => ({ ...prev, restaurantId: pendingId, role: "owner" }));
      setFromRegistration(true);
      // Clear it so it doesn't persist
      localStorage.removeItem("pending_restaurant_id");
    }
  }, []);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/staff/signup", {
        name: form.name,
        email: form.email,
        password: form.password,
        restaurant_id: parseInt(form.restaurantId),
        role: form.role,
      });
      localStorage.setItem("nomoosh_staff_token", res.token);
      localStorage.setItem("nomoosh_staff_role", res.role);
      localStorage.setItem("nomoosh_staff_name", res.name);
      localStorage.setItem("nomoosh_staff_restaurant_id", String(res.restaurant_id));
      localStorage.setItem("nomoosh_staff_id", res.id);

      if (res.role === "owner") router.push("/dashboard/owner");
      else if (res.role === "chef") router.push("/dashboard/chef");
      else router.push("/dashboard/waiter");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { value: "owner", label: "Owner", desc: "Full access — manage menu, tables, staff" },
    { value: "chef", label: "Chef", desc: "View orders, set preparation times" },
    { value: "waiter", label: "Waiter", desc: "Activate/deactivate tables" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="inline-flex h-14 w-14 rounded-2xl items-center justify-center text-white text-2xl font-extrabold shadow-lg mb-3"
            style={{ background: BRAND }}
          >
            N
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Staff Sign Up</h1>
          <p className="text-slate-500 mt-1">Create your staff account</p>
        </div>

        <form
          onSubmit={handleSignup}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-5"
        >
          {fromRegistration && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-green-800 mb-1">✅ Restaurant registered!</p>
              <p className="text-xs text-green-700">
                Now create your owner account to access your dashboard and manage your restaurant.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Restaurant ID
            </label>
            <input
              type="number"
              required
              value={form.restaurantId}
              onChange={(e) => set("restaurantId", e.target.value)}
              readOnly={fromRegistration}
              className={`w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                fromRegistration ? "bg-slate-50 cursor-not-allowed" : ""
              }`}
              placeholder={fromRegistration ? "" : "Ask your restaurant owner for the ID"}
            />
            {fromRegistration && (
              <p className="text-xs text-slate-500 mt-1">
                ℹ️ This is your registered restaurant ID
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Min 6 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Role
            </label>
            <div className="grid grid-cols-3 gap-3">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => set("role", r.value)}
                  className={`rounded-xl border-2 p-3 text-center transition ${
                    form.role === r.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="font-bold text-sm text-slate-900">{r.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transition disabled:opacity-50"
            style={{ background: BRAND }}
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <a href="/staff/login" className="font-semibold" style={{ color: BRAND }}>
              Sign In
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
