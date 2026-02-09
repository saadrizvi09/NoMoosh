// src/app/onboard/cuisine-timings/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Cuisine & Time Slots page
 * - Sidebar with 4 steps (Details / Menu / Cuisine & Time slots / Documents)
 * - Cuisine picker (search + chips), max 8
 * - Open days (bold tick, dark blue)
 * - Day-wise time slots with add/remove; "Copy to all" shows once (first active day)
 * - Save & Continue posts to backend then navigates to /onboard/documents
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// ---- Static data ----
const ALL_CUISINES = [
  "North Indian", "South Indian", "Chinese", "Fast Food", "Biryani", "Pizza",
  "Bakery", "Street Food", "Burger", "Mughlai", "Momose", "Sandwich",
  "Fresh Veggie", "Kebab", "Ice Cream", "Cafe", "Healthy Food", "Italian",
  "Continental", "Lebanese", "Salad", "Shawarma", "Gujarati", "Andhra",
  "Waffle", "Coffee", "Rajasthani", "Wraps", "Mexican", "Bengali", "Sushi",
  "Lucknowi", "Goan", "Assamese", "American", "Mandi", "Chettinad", "Mishti",
  "Bar Food", "Malwani", "Odia", "Japanese", "Finger Food", "Korean",
  "North Eastern", "Thai", "Steak", "Frozen Yogurt", "Panini", "Parsi",
  "Sichuan", "Iranian", "Grilled Chicken", "French", "Raw Meats", "Drinks Only",
  "Vietnamese", "Liquor", "Greek", "Himachali", "Bohri", "Garhwali",
  "Cantonese", "Malaysian", "Belgian", "British", "African", "Spanish",
  "Manipur", "Egyptian",
];

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayKey = typeof DAY_KEYS[number];

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

type Slot = { open: string; close: string };
type Timings = Record<DayKey, Slot[]>;

const DEFAULT_SLOT: Slot = { open: "09:00", close: "18:00" };

// ---- Component ----
export default function CuisineTimingsPage() {
  const router = useRouter();

  // Sidebar completion flags (from prior steps)
  const [detailsCompleted, setDetailsCompleted] = useState(false);
  const [menuCompleted, setMenuCompleted] = useState(false);

  // Restaurant/user id (you asked to keep `restaurant_id` as the user_id)
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Cuisines
  const [search, setSearch] = useState("");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);

  // Open days
  const [daysOpen, setDaysOpen] = useState<Record<DayKey, boolean>>({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: false,
  });

  // Timings per day
  const [timings, setTimings] = useState<Timings>(() =>
    DAY_KEYS.reduce((acc, k) => {
      acc[k] = [{ ...DEFAULT_SLOT }];
      return acc;
    }, {} as Timings)
  );

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted flags and ids
  useEffect(() => {
    try {
      setDetailsCompleted(localStorage.getItem("detailsCompleted") === "true");
    } catch {}
    try {
      setMenuCompleted(localStorage.getItem("menuCompleted") === "true");
    } catch {}
    try {
      const uid = localStorage.getItem("nomoosh_userId") ?? localStorage.getItem("restaurantId");
      if (uid) setRestaurantId(uid);
    } catch {}
    try {
      const raw = localStorage.getItem("cuisineTimesDraft");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.selectedCuisines) setSelectedCuisines(parsed.selectedCuisines);
        if (parsed?.daysOpen) setDaysOpen(parsed.daysOpen);
        if (parsed?.timings) setTimings(parsed.timings);
      }
    } catch {}
  }, []);

  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(
        "cuisineTimesDraft",
        JSON.stringify({ selectedCuisines, daysOpen, timings })
      );
    } catch {}
  }, [selectedCuisines, daysOpen, timings]);

  // Filter cuisines by search
  const filteredCuisines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_CUISINES;
    return ALL_CUISINES.filter((c) => c.toLowerCase().includes(q));
  }, [search]);

  // Cuisine handlers
  const toggleCuisine = (c: string) => {
    setSelectedCuisines((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      if (prev.length >= 8) return prev; // max 8
      return [...prev, c];
    });
  };

  // Open days handlers
  const toggleDay = (day: DayKey) => {
    setDaysOpen((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  // Timing handlers
  const updateSlot = (day: DayKey, idx: number, key: keyof Slot, value: string) => {
    setTimings((prev) => {
      const copy = { ...prev };
      const daySlots = [...copy[day]];
      const slot = { ...daySlots[idx], [key]: value };
      daySlots[idx] = slot;
      copy[day] = daySlots;
      return copy;
    });
  };

  const addSlot = (day: DayKey) => {
    setTimings((prev) => {
      const copy = { ...prev };
      copy[day] = [...copy[day], { ...DEFAULT_SLOT }];
      return copy;
    });
  };

  const removeSlot = (day: DayKey, idx: number) => {
    setTimings((prev) => {
      const copy = { ...prev };
      copy[day] = copy[day].filter((_, i) => i !== idx);
      if (copy[day].length === 0) copy[day] = [{ ...DEFAULT_SLOT }];
      return copy;
    });
  };

  const handleCopyToAll = (source: DayKey) => {
    const src = timings[source];
    setTimings((prev) => {
      const copy = { ...prev };
      DAY_KEYS.forEach((k) => {
        if (daysOpen[k]) copy[k] = JSON.parse(JSON.stringify(src));
      });
      return copy;
    });
  };

  // First active day index for showing "Copy to all" once
  const firstActiveDayIndex = useMemo(() => {
    return DAY_KEYS.findIndex((d) => daysOpen[d]);
  }, [daysOpen]);

  // Validate inputs before submit
  const validate = () => {
    if (!restaurantId) {
      setError("Missing restaurant_id. Please re-login or restart onboarding.");
      return false;
    }
    if (selectedCuisines.length === 0) {
      setError("Please select at least one cuisine (up to 8).");
      return false;
    }
    // basic check: open < close per slot
    for (const day of DAY_KEYS) {
      if (!daysOpen[day]) continue;
      for (const s of timings[day]) {
        if (!s.open || !s.close) {
          setError(`Please set both open and close times for ${DAY_LABELS[day]}.`);
          return false;
        }
        if (s.open === s.close) {
          setError(`Open and close times cannot be the same for ${DAY_LABELS[day]}.`);
          return false;
        }
      }
    }
    setError(null);
    return true;
  };

  // Submit
  const handleSaveContinue = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);

    try {
      if (!API_BASE) throw new Error("API base not configured (NEXT_PUBLIC_API_BASE).");

      // You asked: "restaurant_id keep this user_id"
      const payload = {
        restaurant_id: restaurantId, // ← kept as user_id from storage
        cuisines: selectedCuisines,
        open_days: Object.fromEntries(DAY_KEYS.map((k) => [k, daysOpen[k]])),
        timings: DAY_KEYS.reduce((acc, k) => {
          if (!daysOpen[k]) return acc;
          acc[k] = timings[k]; // [{ open: "09:00", close: "18:00" }, ...]
          return acc;
        }, {} as Record<string, Slot[]>),
      };

      const res = await fetch(`${API_BASE}/save-cuisines-and-times`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Save failed (${res.status})`);
      }

      try {
        localStorage.setItem("cuisineTimesCompleted", "true");
      } catch {}

      router.push("/onboard/documents");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Sidebar navigation
  const gotoDetails = () => router.push("/onboard/details");
  const gotoMenu = () => router.push("/onboard/menu");

  // ✅ Guard: block navigation to Documents until cuisine & time slots completed
  const gotoDocuments = () => {
    const done = typeof window !== "undefined" && localStorage.getItem("cuisineTimesCompleted") === "true";
    if (!done) {
      alert("Please complete Cuisine & Time slots before continuing to Documents.");
      return;
    }
    router.push("/onboard/documents");
  };

  const gotoCurrent = () => {}; // current page

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="text-xl font-bold text-sky-600">Nomoosh Partner</div>
          <div className="text-sm text-sky-600">Need help? Call 7091863593</div>
        </div>
      </header>
      <div className="h-18" />

      {/* Add extra bottom padding on mobile so content doesn't hide behind sticky mobile bar */}
      <main className="max-w-7xl mx-auto px-6 py-8 pb-24 lg:pb-8">
        <div className="grid grid-cols-12 gap-8">
          {/* Sidebar: hide on mobile, sticky on desktop */}
          <aside className="hidden lg:block col-span-3">
            <div className="sticky top-8">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-semibold mb-6">Complete your registration</h3>

                <div className="space-y-4">
                  {/* Step 0 */}
                  <button
                    onClick={gotoDetails}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ${
                      detailsCompleted ? "ring-1 ring-emerald-100 shadow" : "hover:shadow-sm"
                    }`}
                  >
                    <div
                      className={`h-9 w-9 rounded-full flex items-center justify-center ${
                        detailsCompleted ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
                      }`}
                      aria-hidden
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 2v10a2 2 0 0 1-2 2H3V2h4zm14 0v10a2 2 0 0 1-2 2h-2V2h4zM9 14h6v8H9v-8z" />
                      </svg>
                    </div>
                    <div>
                      <div
                        className={`text-sm font-medium ${
                          detailsCompleted ? "text-emerald-600" : "text-slate-700"
                        }`}
                      >
                        Restaurant information
                      </div>
                      <div className="text-xs text-slate-400">Basic details & location</div>
                    </div>
                  </button>

                  {/* Step 1 */}
                  <button
                    onClick={gotoMenu}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ${
                      menuCompleted ? "ring-1 ring-emerald-100 shadow" : "hover:shadow-sm"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 4h18v2H3V4zm0 5h18v2H3V9zm0 5h18v6H3v-6z" />
                      </svg>
                    </div>
                    <div>
                      <div
                        className={`text-sm font-medium ${
                          menuCompleted ? "text-emerald-600" : "text-slate-700"
                        }`}
                      >
                        Menu & operational details
                      </div>
                      <div className="text-xs text-slate-400">Upload menu & images</div>
                    </div>
                  </button>

                  {/* Step 2 (current) */}
                  <button
                    onClick={gotoCurrent}
                    className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ring-1 ring-sky-100 bg-sky-50 shadow-sm"
                  >
                    <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700">Cuisine & Time slots</div>
                      <div className="text-xs text-slate-400">Cuisines, open days & timings</div>
                    </div>
                  </button>

                  {/* Step 3 */}
                  <button
                    onClick={gotoDocuments}
                    className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow hover:shadow-sm"
                  >
                    <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 3h16v14H4zM4 21h16v2H4z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700">Restaurant documents</div>
                      <div className="text-xs text-slate-400">PAN, bank account details</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <div className="text-sm font-semibold">Tip</div>
                  <div className="text-xs text-slate-400 mt-2">
                    Select up to 8 cuisines. Add multiple time windows per day if needed.
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main */}
          <section className="col-span-12 lg:col-span-9 space-y-8">
            {/* Cuisines */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-extrabold text-slate-800">Select cuisines</h2>
              <p className="text-sm text-slate-500 mt-1">
                Your restaurant will appear in searches for these cuisines (max 8).
              </p>

              <div className="mt-5 flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search for cuisines"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 pl-10 focus:ring focus:ring-sky-100 focus:border-sky-400"
                  />
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="M21 21l-4.3-4.3"></path>
                  </svg>
                </div>

                <div className="text-xs text-slate-500">
                  Selected: <span className="font-semibold">{selectedCuisines.length}/8</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredCuisines.map((c) => {
                  const active = selectedCuisines.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleCuisine(c)}
                      className={`px-4 py-2 rounded-xl border text-sm transition 
                        ${active
                          ? "border-sky-500 bg-sky-50 text-sky-700 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Open days */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-extrabold text-slate-800">Restaurant delivery timings</h2>

              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-800">Mark open days</h3>
                <p className="text-sm text-slate-500">Don&apos;t forget to uncheck your off-day</p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {DAY_KEYS.map((day) => {
                    const active = daysOpen[day];
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={`group flex items-center gap-3 rounded-2xl border px-4 py-3 text-base font-medium transition
                          ${active
                            ? "border-sky-500 bg-sky-50 text-slate-800 shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border
                            ${active
                              ? "border-sky-600 bg-sky-600 text-white"
                              : "border-slate-300 bg-white text-transparent group-hover:text-slate-300"}`}
                        >
                          {/* dark blue tick */}
                          <svg viewBox="0 0 24 24" className="h-4 w-4">
                            <path
                              d="M20 6L9 17l-5-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {DAY_LABELS[day]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Day wise timings */}
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-slate-800 mb-3">Day wise timings</h3>

                <div className="space-y-6">
                  {DAY_KEYS.map((day) => {
                    if (!daysOpen[day]) return null;
                    const slots = timings[day] || [{ ...DEFAULT_SLOT }];

                    // index for first active day is computed above (kept as-is)
                    const renderedIndex =
                      DAY_KEYS.filter((k) => daysOpen[k]).findIndex((k) => k === day);

                    return (
                      <div key={day} className="border rounded-xl p-5 shadow-sm bg-white">
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-base font-medium text-slate-700">{DAY_LABELS[day]}</div>

                          {/* Only show copy to all once — on first active day */}
                          {renderedIndex === 0 && (
                            <button
                              onClick={() => handleCopyToAll(day)}
                              className="text-xs font-medium text-sky-700 hover:underline"
                              title="Copy these slots to all open days"
                            >
                              Copy to all
                            </button>
                          )}
                        </div>

                        <div className="space-y-4">
                          {slots.map((slot, i) => (
                            <div key={i} className="flex items-center gap-4">
                              {/* Open */}
                              <div className="flex-1">
                                <label className="text-xs text-slate-500">Open time</label>
                                <input
                                  type="time"
                                  value={slot.open}
                                  onChange={(e) => updateSlot(day, i, "open", e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring focus:ring-sky-100"
                                />
                              </div>

                              {/* Close */}
                              <div className="flex-1">
                                <label className="text-xs text-slate-500">Close time</label>
                                <input
                                  type="time"
                                  value={slot.close}
                                  onChange={(e) => updateSlot(day, i, "close", e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring focus:ring-sky-100"
                                />
                              </div>

                              {/* Delete slot */}
                              {slots.length > 1 && (
                                <button
                                  onClick={() => removeSlot(day, i)}
                                  className="h-9 w-9 flex items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                                  title="Remove slot"
                                >
                                  <svg viewBox="0 0 24 24" className="h-5 w-5">
                                    <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Add slot */}
                        <button
                          onClick={() => addSlot(day)}
                          className="mt-4 inline-flex items-center gap-2 text-sm text-sky-700 hover:text-sky-800"
                        >
                          <span className="h-5 w-5 flex items-center justify-center rounded-full border border-sky-400 text-sky-600">
                            +
                          </span>
                          Add more time slots
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

              {/* Footer actions */}
              <div className="mt-8 flex justify-end">
                <button
                  onClick={handleSaveContinue}
                  disabled={saving}
                  className={`px-6 py-3 bg-emerald-600 text-white rounded-xl shadow hover:bg-emerald-700 ${
                    saving ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  {saving ? "Saving…" : "Save & Continue"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Mobile sticky step bar */}
      {/* Mobile sticky step bar */}
<nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-slate-200 lg:hidden">
  <div className="max-w-7xl mx-auto grid grid-cols-4">
    <button
      onClick={gotoDetails}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
    >
      <span className="h-1 w-8 rounded-full bg-slate-200" />
      Info
    </button>

    <button
      onClick={gotoMenu}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
    >
      <span className="h-1 w-8 rounded-full bg-slate-200" />
      Menu
    </button>

    {/* ✅ Cuisine step (current) */}
    <button
      onClick={gotoCurrent}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-sky-700"
    >
      <span className="h-1 w-8 rounded-full bg-sky-500" />
      Cuisine
    </button>

    <button
      onClick={gotoDocuments}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
    >
      <span className="h-1 w-8 rounded-full bg-slate-200" />
      Docs
    </button>
  </div>
  {/* Safe-area spacer for iOS home bar */}
  <div className="h-[calc(env(safe-area-inset-bottom,0px))]" />
</nav>

    </div>
  );
}
