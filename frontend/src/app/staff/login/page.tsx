"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";

const BRAND = "#f97316";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiPost("/staff/login", {
        email,
        password,
        restaurant_id: parseInt(restaurantId),
      });
      // Store auth
      localStorage.setItem("nomoosh_staff_token", res.token);
      localStorage.setItem("nomoosh_staff_role", res.role);
      localStorage.setItem("nomoosh_staff_name", res.name);
      localStorage.setItem("nomoosh_staff_restaurant_id", String(res.restaurant_id));
      localStorage.setItem("nomoosh_staff_id", res.id);

      // Route to appropriate dashboard
      if (res.role === "owner") router.push("/dashboard/owner");
      else if (res.role === "chef") router.push("/dashboard/chef");
      else if (res.role === "waiter") router.push("/dashboard/waiter");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex h-14 w-14 rounded-2xl items-center justify-center text-white text-2xl font-extrabold shadow-lg mb-3"
            style={{ background: BRAND }}
          >
            N
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Staff Login</h1>
          <p className="text-slate-500 mt-1">Sign in to your restaurant dashboard</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-5"
        >
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
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Enter your restaurant ID"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transition disabled:opacity-50"
            style={{ background: BRAND }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <p className="text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <a href="/staff/signup" className="font-semibold" style={{ color: BRAND }}>
              Sign Up
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
