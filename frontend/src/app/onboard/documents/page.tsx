// src/app/onboard/documents/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardShell, buildSteps } from "../components";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

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

  const steps = buildSteps(4, {
    details: step0Completed,
    menu: step1Completed,
    cuisine: typeof window !== "undefined" && localStorage.getItem("cuisineTimesCompleted") === "true",
    docs: typeof window !== "undefined" && localStorage.getItem("documentsCompleted") === "true",
  });

  return (
    <OnboardShell currentStep={4} steps={steps}>
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
                  className={`px-6 py-3 bg-[#1c37b3] text-white rounded-xl shadow hover:opacity-90 transition ${
                    verifying ? "opacity-80 cursor-wait" : ""
                  }`}
                  disabled={verifying}
                >
                  {verifying ? "Verifying..." : "Verify & Submit →"}
                </button>
              </div>

              {submitError && <div className="mt-4 text-sm text-red-600">{submitError}</div>}
            </div>


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
    </OnboardShell>
  );
}
