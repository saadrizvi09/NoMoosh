"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* â”€â”€â”€ Types â”€â”€â”€ */
export type StepStatus = "completed" | "active" | "upcoming";

export type StepInfo = {
  label: string;
  subLabel: string;
  href: string;
  status: StepStatus;
  onClick?: () => void;
};

/* â”€â”€â”€ Helper: build steps array â”€â”€â”€ */
export function buildSteps(
  currentStep: number,
  completions: { details?: boolean; menu?: boolean; cuisine?: boolean; docs?: boolean },
  overrides?: Partial<Record<1 | 2 | 3 | 4, () => void>>
): StepInfo[] {
  const defs = [
    { label: "Restaurant Information", subLabel: "Name, contact & address", href: "/onboard/details" },
    { label: "Menu Details", subLabel: "Upload menu & images", href: "/onboard/menu" },
    { label: "Cuisine & Timings", subLabel: "Cuisines & delivery hours", href: "/onboard/cuisine" },
    { label: "Documents", subLabel: "PAN & bank details", href: "/onboard/documents" },
  ];
  const keys = ["details", "menu", "cuisine", "docs"] as const;

  return defs.map((d, idx) => {
    const n = (idx + 1) as 1 | 2 | 3 | 4;
    return {
      ...d,
      status:
        n === currentStep
          ? ("active" as const)
          : completions[keys[idx]]
          ? ("completed" as const)
          : ("upcoming" as const),
      onClick: overrides?.[n],
    };
  });
}

/* â”€â”€â”€ Header â”€â”€â”€ */
export function OnboardHeader({ currentStep = 1 }: { currentStep?: number }) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [userName, setUserName] = React.useState<string | null>(null);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [showSignOutModal, setShowSignOutModal] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setUserName(localStorage.getItem("nomoosh_name"));
      setUserEmail(localStorage.getItem("nomoosh_email"));
    }
  }, []);

  const handleSignOut = async () => {
    setShowSignOutModal(false);
    try { await supabase.auth.signOut(); } catch (e) { console.error("Supabase sign-out error:", e); }
    localStorage.removeItem("nomoosh_userId");
    localStorage.removeItem("nomoosh_name");
    localStorage.removeItem("nomoosh_email");
    localStorage.removeItem("nomoosh_phone");
    localStorage.removeItem("nomoosh_token");
    localStorage.removeItem("nomoosh_oauth_completed");
    localStorage.removeItem("nomoosh_failed_session");
    localStorage.removeItem("nomoosh_detailsForm");
    localStorage.removeItem("detailsCompleted");
    localStorage.removeItem("menuCompleted");
    window.location.href = "/onboard/res_details";
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-white border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[#f97316] text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
            N
          </div>
          <span className="font-bold text-slate-800 text-[15px]">Nomoosh</span>
          <span className="text-slate-400 text-xs ml-0.5 hidden sm:inline">for Business</span>
        </a>

        {/* Step progress (desktop) */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">
            Step {currentStep} of 4
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`h-1.5 w-7 rounded-full transition-all ${
                  n <= currentStep ? "bg-[#f97316]" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Right section: Help + User */}
        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-500 hidden sm:block">
            Need help?{" "}
            <a
              href="tel:7091863593"
              className="text-[#f97316] font-medium hover:underline"
            >
              7091863593
            </a>
          </div>

          {/* User Profile Icon */}
          {userName && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 hover:bg-slate-50 rounded-full p-1.5 pr-3 transition-colors"
                aria-label="User menu"
              >
                <div className="h-8 w-8 rounded-full bg-[#f97316] text-white flex items-center justify-center font-semibold text-sm">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <svg className="w-4 h-4 text-slate-600 hidden sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-[60]" 
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-[70]">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="font-medium text-slate-900 text-sm">{userName}</div>
                      {userEmail && <div className="text-xs text-slate-500 mt-0.5">{userEmail}</div>}
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* â”€â”€â”€ Sidebar â”€â”€â”€ */
export function OnboardSidebar({ steps }: { steps: StepInfo[] }) {
  const router = useRouter();

  return (
    <div className="sticky top-20">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Registration Steps
          </h3>
        </div>

        <div className="px-3 pb-4">
          {steps.map((step, idx) => {
            const stepNum = idx + 1;
            const isLast = idx === steps.length - 1;
            return (
              <div key={idx} className="relative">
                {/* Connecting line */}
                {!isLast && (
                  <div
                    className={`absolute left-[19px] top-[44px] w-[2px] h-3 ${
                      step.status === "completed"
                        ? "bg-emerald-300"
                        : "bg-slate-200"
                    }`}
                  />
                )}
                <button
                  onClick={() =>
                    step.onClick ? step.onClick() : router.push(step.href)
                  }
                  className={`w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-xl transition ${
                    step.status === "active"
                      ? "bg-blue-50/70"
                      : "hover:bg-slate-50"
                  }`}
                >
                  {/* Numbered circle */}
                  <div
                    className={`flex-shrink-0 h-[34px] w-[34px] rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                      step.status === "completed"
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : step.status === "active"
                        ? "bg-[#f97316] border-[#f97316] text-white"
                        : "bg-white border-slate-300 text-slate-400"
                    }`}
                  >
                    {step.status === "completed" ? (
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <path
                          d="M20 6L9 17l-5-5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </div>

                  <div className="min-w-0">
                    <div
                      className={`text-sm font-medium leading-tight ${
                        step.status === "completed"
                          ? "text-emerald-600"
                          : step.status === "active"
                          ? "text-slate-800"
                          : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {step.subLabel}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info card */}
      <div className="mt-4 bg-amber-50/80 rounded-xl p-4 border border-amber-100/80">
        <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          Required Documents
        </div>
        <div className="text-[11px] text-amber-700 mt-1.5 leading-relaxed">
          PAN card, bank account details, menu photos/PDFs
        </div>
      </div>

      {/* Referral card */}
      <div className="mt-3 bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
        <div className="text-xs text-slate-600">Did someone refer you?</div>
        <div className="text-xs text-[#f97316] font-medium mt-1 cursor-pointer hover:underline">
          Enter referral code
        </div>
      </div>
    </div>
  );
}

/* â”€â”€â”€ Mobile Bottom Nav â”€â”€â”€ */
export function OnboardMobileNav({ steps }: { steps: StepInfo[] }) {
  const router = useRouter();
  const labels = ["Info", "Menu", "Cuisine", "Docs"];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-sm border-t border-slate-200 lg:hidden">
      <div className="grid grid-cols-4">
        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          return (
            <button
              key={idx}
              onClick={() =>
                step.onClick ? step.onClick() : router.push(step.href)
              }
              className={`py-2.5 flex flex-col items-center gap-1 text-[10px] font-medium transition ${
                step.status === "active"
                  ? "text-[#f97316]"
                  : step.status === "completed"
                  ? "text-emerald-600"
                  : "text-slate-400"
              }`}
            >
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step.status === "active"
                    ? "bg-[#f97316] text-white"
                    : step.status === "completed"
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {step.status === "completed" ? "âœ“" : stepNum}
              </div>
              <span>{labels[idx]}</span>
            </button>
          );
        })}
      </div>
      <div className="h-[calc(env(safe-area-inset-bottom,0px))]" />
    </nav>
  );
}

/* â”€â”€â”€ Onboard page shell (wraps form content) â”€â”€â”€ */
export function OnboardShell({
  currentStep,
  steps,
  children,
}: {
  currentStep: number;
  steps: StepInfo[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <OnboardHeader currentStep={currentStep} />
      <div className="h-14" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-24 lg:pb-8">
        <div className="grid grid-cols-12 gap-6 lg:gap-8">
          {/* Sidebar (desktop) */}
          <aside className="hidden lg:block col-span-3">
            <OnboardSidebar steps={steps} />
          </aside>

          {/* Main content */}
          <section className="col-span-12 lg:col-span-9 space-y-6">
            {children}
          </section>
        </div>
      </main>

      <OnboardMobileNav steps={steps} />
    </div>
  );
}

