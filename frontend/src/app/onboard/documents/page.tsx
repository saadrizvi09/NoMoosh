// src/app/onboard/documents/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

function Sidebar({
  stepCompleted0 = false,
  stepCompleted1 = false,
  onDetails,
  onMenu,
  onCuisine,
  onTimeSlot,
  onDocuments,
}: {
  stepCompleted0?: boolean;
  stepCompleted1?: boolean;
  onDetails: () => void;
  onMenu: () => void;
  onCuisine: () => void;
  onTimeSlot: () => void;
  onDocuments: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <h3 className="text-lg font-semibold mb-6">Complete your registration</h3>

      <div className="space-y-4">
        {/* Step 0 - Restaurant info */}
        <button
          onClick={onDetails}
          className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ${
            stepCompleted0 ? "ring-1 ring-emerald-100 shadow" : "hover:shadow-sm"
          }`}
        >
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center ${
              stepCompleted0 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 2v10a2 2 0 0 1-2 2H3V2h4zm14 0v10a2 2 0 0 1-2 2h-2V2h4zM9 14h6v8H9v-8z" />
            </svg>
          </div>
          <div>
            <div
              className={`text-sm font-medium ${
                stepCompleted0 ? "text-emerald-600" : "text-slate-700"
              }`}
            >
              Restaurant information
            </div>
            <div className="text-xs text-slate-400">Basic details and location</div>
          </div>
        </button>

        {/* Step 1 - Menu */}
        <button
          onClick={onMenu}
          className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ${
            stepCompleted1 ? "ring-1 ring-emerald-100 shadow" : "ring-1 ring-sky-50 bg-sky-50"
          }`}
        >
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center ${
              stepCompleted1 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 4h18v2H3V4zm0 5h18v2H3V9zm0 5h18v6H3v-6z" />
            </svg>
          </div>
          <div>
            <div
              className={`text-sm font-medium ${
                stepCompleted1 ? "text-emerald-600" : "text-slate-700"
              }`}
            >
              Menu and operational details
            </div>
            <div className="text-xs text-slate-400">Upload your menu & images</div>
          </div>
        </button>

        {/* Step 2 - Cuisine */}
        <button
          onClick={onCuisine}
          className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow hover:shadow-sm"
        >
          <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
            🍴
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700">Cuisine & Time slots</div>
            <div className="text-xs text-slate-400">Select cuisine categories</div>
          </div>
        </button>

        

        {/* Step 4 - Documents (current) */}
        <button
          onClick={onDocuments}
          className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ring-1 ring-sky-50 bg-sky-50"
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
  );
}

const isPanValid = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan.trim());
const isIfscValid = (ifsc: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc.trim());
const isAccountValid = (acc: string) => /^\d{6,24}$/.test(acc.replace(/\s+/g, ""));

export default function DocumentsPage() {
  const router = useRouter();

  const [form, setForm] = useState({ pan: "", holder: "", account: "", ifsc: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCongratsModal, setShowCongratsModal] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [step0Completed, setStep0Completed] = useState(false);
  const [step1Completed, setStep1Completed] = useState(false);

  useEffect(() => {
    try {
      setStep0Completed(localStorage.getItem("detailsCompleted") === "true");
    } catch {}
    try {
      setStep1Completed(localStorage.getItem("menuCompleted") === "true");
    } catch {}
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((s) => ({ ...s, [e.target.name]: e.target.value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: "" }));
    setSubmitError(null);
  };

  const validateAll = () => {
    const newErrors: Record<string, string> = {};
    if (!form.pan.trim()) newErrors.pan = "PAN number is required";
    else if (!isPanValid(form.pan)) newErrors.pan = "Invalid PAN format (e.g. AAAAA9999A)";
    if (!form.holder.trim()) newErrors.holder = "Account holder name is required";
    if (!form.account.trim()) newErrors.account = "Account number is required";
    else if (!isAccountValid(form.account)) newErrors.account = "Enter a valid account number";
    if (!form.ifsc.trim()) newErrors.ifsc = "IFSC code is required";
    else if (!isIfscValid(form.ifsc)) newErrors.ifsc = "Invalid IFSC format";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleVerify = () => {
    if (!validateAll()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setShowConfirmModal(true);
  };

  const handleSubmitDocuments = async () => {
    setSubmitError(null);
    setSubmitLoading(true);
    try {
      if (!API_BASE) throw new Error("API base not configured");

      const restaurantId =
        localStorage.getItem("nomoosh_userId") ?? localStorage.getItem("restaurantId");

      const payload = {
        restaurantId,
        documents: {
          pan: form.pan.trim(),
          account_holder: form.holder.trim(),
          account_number: form.account.replace(/\s+/g, ""),
          ifsc: form.ifsc.trim(),
        },
      };

      const res = await fetch(`${API_BASE}/save-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);

      localStorage.setItem("documentsCompleted", "true");
      setShowConfirmModal(false);
      setShowCongratsModal(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Submit failed");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  const handleSkip = () => {
   setShowCongratsModal(true); // skip → home
  };

  return (
     <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="text-xl font-bold text-sky-600">Nomoosh Partner</div>
          <div className="text-sm text-sky-600">Need help? Call 7091863593</div>
        </div>
      </header>
      <div className="h-18" />

      <main className="max-w-7xl mx-auto px-6 py-8 pb-24 lg:pb-8">
        <div className="grid grid-cols-12 gap-8">
          <aside className="hidden lg:block col-span-3">
            <Sidebar
              stepCompleted0={step0Completed}
              stepCompleted1={step1Completed}
              onDetails={() => router.push("/onboard/details")}
              onMenu={() => router.push("/onboard/menu")}
              onCuisine={() => router.push("/onboard/cuisine")}
              onTimeSlot={() => router.push("/onboard/time-slot")}
              onDocuments={() => {}}
            />
          </aside>

          <section className="col-span-12 lg:col-span-9">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Bank account details</h2>
              <p className="text-sm text-slate-500 mb-6">
                Please provide valid details for payments. All fields are required.
              </p>

              <div className="grid grid-cols-1 gap-6">
                {/* PAN */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">PAN number</label>
                  <input
                    name="pan"
                    value={form.pan}
                    onChange={handleChange}
                    placeholder="Enter PAN number"
                    className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${
                      errors.pan ? "border-red-500" : "border-slate-200"
                    }`}
                  />
                  {errors.pan && <p className="text-sm text-red-500 mt-2">{errors.pan}</p>}
                </div>

                {/* Account holder */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Account holder name
                  </label>
                  <input
                    name="holder"
                    value={form.holder}
                    onChange={handleChange}
                    placeholder="Enter account holder name"
                    className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${
                      errors.holder ? "border-red-500" : "border-slate-200"
                    }`}
                  />
                  {errors.holder && <p className="text-sm text-red-500 mt-2">{errors.holder}</p>}
                </div>

                {/* Account number */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Account number
                  </label>
                  <input
                    name="account"
                    value={form.account}
                    onChange={handleChange}
                    placeholder="Enter bank account number"
                    className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${
                      errors.account ? "border-red-500" : "border-slate-200"
                    }`}
                  />
                  {errors.account && <p className="text-sm text-red-500 mt-2">{errors.account}</p>}
                </div>

                {/* IFSC */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">IFSC code</label>
                  <input
                    name="ifsc"
                    value={form.ifsc}
                    onChange={handleChange}
                    placeholder="Enter IFSC code"
                    className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${
                      errors.ifsc ? "border-red-500" : "border-slate-200"
                    }`}
                  />
                  {errors.ifsc && <p className="text-sm text-red-500 mt-2">{errors.ifsc}</p>}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 hover:shadow-sm"
                >
                  Skip
                </button>

                <button
                  onClick={handleVerify}
                  className={`px-6 py-3 bg-emerald-600 text-white rounded-xl shadow hover:bg-emerald-700 ${
                    verifying ? "opacity-80 cursor-wait" : ""
                  }`}
                  disabled={verifying}
                >
                  {verifying ? "Verifying..." : "Verify bank details"}
                </button>
              </div>

              {submitError && <div className="mt-4 text-sm text-red-600">{submitError}</div>}
            </div>
          </section>
        </div>
      </main>
      {/* Mobile sticky step bar */}
<nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-slate-200 lg:hidden">
  <div className="max-w-7xl mx-auto grid grid-cols-4">
    <button
      onClick={() => router.push("/onboard/details")}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
    >
      <span className="h-1 w-8 rounded-full bg-slate-200" />
      Info
    </button>

    <button
      onClick={() => router.push("/onboard/menu")}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
    >
      <span className="h-1 w-8 rounded-full bg-slate-200" />
      Menu
    </button>

    <button
      onClick={() => router.push("/onboard/cuisine")}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
    >
      <span className="h-1 w-8 rounded-full bg-slate-200" />
      Cuisine
    </button>

    <button
      onClick={() => {}}
      className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-sky-700"
    >
      <span className="h-1 w-8 rounded-full bg-sky-500" />
      Docs
    </button>
  </div>
  {/* Safe-area spacer for iOS */}
  <div className="h-[calc(env(safe-area-inset-bottom,0px))]" />
</nav>


      {/* Confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-lg border border-slate-100">
            <h3 className="text-xl font-semibold mb-3">Confirm bank details</h3>
            <p className="text-sm text-slate-500 mb-4">Please confirm before submitting.</p>
            <div className="grid grid-cols-1 gap-3 mb-4">
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div className="text-sm text-slate-600">PAN</div>
                <div className="font-medium">{form.pan || "—"}</div>
              </div>
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div className="text-sm text-slate-600">Account holder</div>
                <div className="font-medium">{form.holder || "—"}</div>
              </div>
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div className="text-sm text-slate-600">Account number</div>
                <div className="font-medium">
                  {form.account ? `••••${form.account.slice(-4)}` : "—"}
                </div>
              </div>
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div className="text-sm text-slate-600">IFSC</div>
                <div className="font-medium">{form.ifsc || "—"}</div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 hover:shadow-sm"
              >
                Close
              </button>
              <button
                onClick={handleSubmitDocuments}
                disabled={submitLoading}
                className="px-5 py-2 bg-emerald-600 text-white rounded-md shadow hover:bg-emerald-700"
              >
                {submitLoading ? "Submitting..." : "Submit"}
              </button>
            </div>
            {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
          </div>
        </div>
      )}

      {/* Congrats modal */}
      {showCongratsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg border text-center">
            <h3 className="text-2xl font-bold text-slate-800">
              Congratulations — you are now a Nomoosh partner!
            </h3>
            <p className="text-slate-600 mt-2">
              Your bank details have been submitted successfully.
            </p>
            <div className="mt-4 flex gap-3 justify-center">
              <button
                onClick={() => setShowCongratsModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-md text-slate-700 hover:shadow-sm"
              >
                Close
              </button>
              <button
                onClick={handleGoHome}
                className="px-6 py-2 bg-sky-600 text-white rounded-md shadow hover:bg-sky-700"
              >
                Go to home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
