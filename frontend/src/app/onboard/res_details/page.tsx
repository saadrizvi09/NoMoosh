"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { restoreOnboardingStatus } from "@/lib/onboardingStatus";

/*
  Landing page (hero, CTAs, overlapping info card, features, FAQ).
  NOTE: Per user request — **NO LOGIC CHANGES**. Only UI/UX enhancements for the header.
  - Sticky/shrinking header that feels like a separate section and remains visible on scroll
  - All other logic/flows remain exactly the same
*/

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export default function Page() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // modal state
  const [showModal, setShowModal] = useState(false);
  // modalSub: "emailEntry" (default screen: name+email), "phoneEntry"
  const [modalSub, setModalSub] = useState<"emailEntry" | "phoneEntry">("emailEntry");

  // shared fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // OTP mock state
  const [otpStep, setOtpStep] = useState<"none" | "sent" | "verifying">("none");
  const [otpValue, setOtpValue] = useState("");

  // loading & errors
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [oauthProcessing, setOauthProcessing] = useState(false);

  // User menu state
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loggedInUserName, setLoggedInUserName] = useState<string | null>(null);
  const [loggedInUserEmail, setLoggedInUserEmail] = useState<string | null>(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  // NEW: sticky/shrinking header state
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Load logged-in user info
  useEffect(() => {
    if (typeof window !== "undefined") {
      const userId = localStorage.getItem("nomoosh_userId");
      if (userId) {
        setLoggedInUserName(localStorage.getItem("nomoosh_name"));
        setLoggedInUserEmail(localStorage.getItem("nomoosh_email"));
      }
    }
  }, []);

  // Handle sign out — must also clear Supabase session to prevent auto-re-login
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
    setLoggedInUserName(null);
    setLoggedInUserEmail(null);
    setShowUserMenu(false);
    window.location.reload();
  };

  // Redirect if user already has an account
  useEffect(() => {
    const userId = localStorage.getItem("nomoosh_userId");
    if (userId) {
      // Check if registration is already complete before redirecting
      restoreOnboardingStatus().then((status) => {
        if (status.completed) {
          // Registration is done — go to staff signup
          if (status.restaurant_id) {
            localStorage.setItem("pending_restaurant_id", String(status.restaurant_id));
          }
          console.log("Registration already complete, redirecting to staff signup");
          router.replace("/staff/signup");
        } else {
          console.log("User logged in, resuming onboarding");
          router.replace("/onboard/details");
        }
      });
    }
  }, [router]);

  // Detect Google OAuth redirect — auto-login if a Supabase session exists
  useEffect(() => {
    const checkOAuthSession = async () => {
      try {
        // Check if we've already processed OAuth successfully
        const oauthCompleted = localStorage.getItem("nomoosh_oauth_completed");
        if (oauthCompleted) {
          console.log("OAuth already completed, skipping check");
          return;
        }

        const result = await supabase.auth.getSession();
        if (!result?.data?.session?.user) {
          console.log("No OAuth session found");
          return;
        }
        const session = result.data.session;
        console.log("OAuth session detected:", session.user.id);

        // Already have a userId → nothing to do
        const existingUserId = localStorage.getItem("nomoosh_userId");
        if (existingUserId) {
          console.log("User already has userId, skipping OAuth setup");
          localStorage.setItem("nomoosh_oauth_completed", "true");
          return;
        }

        setOauthProcessing(true);

        // Prevent retry loop - check if we already failed this session
        const failedSessionId = localStorage.getItem("nomoosh_failed_session");
        if (failedSessionId === session.user.id) {
          console.log("This session already failed before, signing out");
          // Already tried and failed - sign out to break the loop
          await supabase.auth.signOut();
          localStorage.removeItem("nomoosh_failed_session");
          localStorage.removeItem("nomoosh_oauth_completed"); // Allow retry
          setModalError("Backend error occurred. Please try signing in again or contact support.");
          setShowModal(true);
          setOauthProcessing(false);
          return;
        }

        const pendingName =
          localStorage.getItem("nomoosh_pending_name") ||
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          "User";
        localStorage.removeItem("nomoosh_pending_name");

        const payload = {
          name: pendingName,
          email: session.user.email ?? null,
          supabase_uid: session.user.id,
        };
        console.log("Creating user on backend with payload:", payload);
        localStorage.setItem("nomoosh_token", session.access_token);

        const data = await createUserOnBackend(payload);
        console.log("Backend response:", data);
        const userId = (data as any).userId ?? (data as any).user_id ?? null;
        if (!userId) {
          console.error("Backend returned no userId:", data);
          // Mark this session as failed to prevent retry loop
          localStorage.setItem("nomoosh_failed_session", session.user.id);
          localStorage.removeItem("nomoosh_oauth_completed"); // Allow retry
          await supabase.auth.signOut();
          setModalError("Account creation failed. Please try signing in again or contact support.");
          setShowModal(true);
          setOauthProcessing(false);
          return;
        }
        
        localStorage.setItem("nomoosh_userId", userId);
        localStorage.setItem("nomoosh_name", pendingName);
        if (session.user.email) localStorage.setItem("nomoosh_email", session.user.email);
        localStorage.removeItem("nomoosh_failed_session"); // Clear any old failure flag
        localStorage.setItem("nomoosh_oauth_completed", "true"); // Mark OAuth as completed
        
        // Use replace instead of push to prevent back button issues
        router.replace("/onboard/details");
      } catch (err: any) {
        console.error("Auto-login after OAuth failed:", err);
        // Mark this session as failed to prevent retry loop
        try {
          const result = await supabase.auth.getSession();
          if (result?.data?.session?.user) {
            localStorage.setItem("nomoosh_failed_session", result.data.session.user.id);
            await supabase.auth.signOut();
          }
        } catch (signOutErr) {
          console.error("Sign out failed:", signOutErr);
        }
        // Clear completion flag so user can try again
        localStorage.removeItem("nomoosh_oauth_completed");
        setModalError(err?.message || "Auto-login failed. Please sign in again or contact support.");
        setShowModal(true);
        setOauthProcessing(false);
      }
    };
    checkOAuthSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const faqs = [
    { q: "What documents are required to start?", a: "Restaurant details, Menu details, PAN card and bank account details" },
    { q: "How long until my restaurant goes live?", a: "Typically 1–3 business days once documents and bank verification are submitted." },
    { q: "Is there an onboarding fee?", a: "No mandatory onboarding fee for standard onboarding; premium services may have charges." },
    { q: "How can I get help?", a: "Email support@nomoosh.com or use the help chat once you sign up." },
  ];

  async function createUserOnBackend(payload: { name: string; email?: string | null; phone?: string | null; supabase_uid?: string | null }) {
    if (!BACKEND_BASE) throw new Error("NEXT_PUBLIC_API_BASE not configured");
    const token = typeof window !== "undefined" ? localStorage.getItem("nomoosh_token") : null;
    console.log("Calling backend:", `${BACKEND_BASE}/create_user`);
    const res = await fetch(`${BACKEND_BASE}/create_user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("Backend error response:", txt);
      throw new Error(txt || `Create user failed (${res.status})`);
    }
    const data = await res.json();
    return data;
  }

  async function finishSignupAfterVerification() {
    setModalError(null);
    setLoading(true);

    try {
      // Get the session (should exist after OTP verification)
      const result = await supabase.auth.getSession();
      const session = result?.data?.session ?? null;

      const payload: { name: string; email?: string | null; phone?: string | null; supabase_uid?: string | null } = {
        name: name.trim() || "Unknown",
        supabase_uid: session?.user?.id ?? null,
      };
      if (modalSub === "emailEntry") {
        payload.email = email && email.trim() !== "" ? email.trim() : null;
      } else {
        payload.phone = phone && phone.trim() !== "" ? phone.trim() : null;
      }

      if (session?.access_token) {
        localStorage.setItem("nomoosh_token", session.access_token);
      }

      const data = await createUserOnBackend(payload);
      const userId = (data as any).userId ?? (data as any).user_id ?? null;
      if (!userId) throw new Error("User creation failed (no userId returned)");

      try {
        localStorage.setItem("nomoosh_userId", userId);
        localStorage.setItem("nomoosh_name", payload.name);
        if (payload.email) localStorage.setItem("nomoosh_email", payload.email);
        if (payload.phone) localStorage.setItem("nomoosh_phone", payload.phone);
      } catch {}

      setShowModal(false);
      router.push("/onboard/details");
    } catch (err: any) {
      console.error("Signup failed", err);
      setModalError(err?.message || "Signup failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function openRegisterModal() {
    // Clear OAuth completion flag to allow retry
    localStorage.removeItem("nomoosh_oauth_completed");
    setModalSub("emailEntry");
    setOtpStep("none");
    setOtpValue("");
    setModalError(null);
    setShowModal(true);
  }
  function handleContinueAsPhone() {
    setModalSub("phoneEntry");
    setOtpStep("none");
    setOtpValue("");
    setModalError(null);
  }
  function handleContinueAsEmail() {
    setModalSub("emailEntry");
    setOtpStep("none");
    setOtpValue("");
    setModalError(null);
  }
  async function handleContinueWithGmail() {
    setModalError(null);
    setLoading(true);
    try {
      // Store the name so we can use it after redirect
      if (name?.trim()) localStorage.setItem("nomoosh_pending_name", name.trim());
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/onboard/res_details" },
      });
      if (error) throw error;
      // Browser will redirect to Google — loading stays true
    } catch (err: any) {
      console.error("Gmail flow failed", err);
      setModalError(err?.message || "Gmail sign-in failed");
      setLoading(false);
    }
  }
  async function handleEmailSendOtp() {
    setModalError(null);
    if (!name?.trim()) return setModalError("Please enter your name.");
    if (!email || !/^\S+@\S+\.\S+$/.test(email.trim())) return setModalError("Enter a valid email.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      setOtpStep("sent");
    } catch (err: any) {
      setModalError(err?.message || "Failed to send verification code. Try again.");
    } finally {
      setLoading(false);
    }
  }
  async function handlePhoneSendOtp() {
    setModalError(null);
    if (!name?.trim()) return setModalError("Please enter your name.");
    if (!phone || !/^\d{7,15}$/.test(phone.replace(/\D/g, ""))) return setModalError("Enter a valid phone number (7\u201315 digits).");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
      if (error) throw error;
      setOtpStep("sent");
    } catch (err: any) {
      setModalError(err?.message || "Failed to send OTP. Phone auth may require additional setup.");
    } finally {
      setLoading(false);
    }
  }
  async function handleVerifyOtp() {
    setModalError(null);
    if (!otpValue || otpValue.length < 6) return setModalError("Please enter the 6-digit code sent to you.");
    setLoading(true);
    try {
      const isEmail = modalSub === "emailEntry";
      let verifyResult;
      if (isEmail) {
        verifyResult = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpValue,
          type: "email" as const,
        });
      } else {
        verifyResult = await supabase.auth.verifyOtp({
          phone: phone.trim(),
          token: otpValue,
          type: "sms" as const,
        });
      }
      const { data, error } = verifyResult;
      if (error) throw error;
      if (data.session?.access_token) {
        localStorage.setItem("nomoosh_token", data.session.access_token);
      }
      await finishSignupAfterVerification();
    } catch (err: any) {
      setModalError(err?.message || "Verification failed. Check the code and try again.");
      setLoading(false);
    }
  }

  // ---------------- UI ----------------
  return (
    <main className="min-h-screen w-full text-gray-900 bg-white selection:bg-amber-200/60 selection:text-gray-900">
      {/* Decorative global background */}
      <div aria-hidden className="fixed inset-0 -z-10">
        <div className="absolute inset-x-0 top-[-10%] h-[50vh] bg-[radial-gradient(60%_60%_at_50%_0%,#1e3a8a_0%,#1e3a8a00_70%)] blur-3xl opacity-30" />
        <div className="absolute -right-32 top-1/3 h-64 w-64 rounded-full bg-gradient-to-br from-amber-400/40 to-pink-400/30 blur-2xl" />
        <div className="absolute -left-24 bottom-10 h-72 w-72 rounded-full bg-gradient-to-br from-sky-400/40 to-emerald-300/30 blur-2xl" />
      </div>

      {/* HERO */}
      <section className="relative w-full">
        {/* full-bleed background with gradient overlay */}
        <div
          className="w-full relative bg-center bg-cover h-[520px] md:h-[620px]"
          style={{ backgroundImage: `url('/hero.jpg')`, backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/40 z-0" />

          {/* Sticky/shrinking header */}
          <header className="fixed inset-x-0 top-0 z-50">
            <div
              className={[
                "mx-auto transition-all duration-300",
                "backdrop-blur supports-[backdrop-filter]:bg-black/30 bg-black/40",
                "ring-1 ring-white/10",
                scrolled ? "max-w-6xl rounded-2xl mt-2 px-4 sm:px-6 h-12 sm:h-14"
                         : "max-w-7xl rounded-none mt-0 px-4 sm:px-6 md:px-12 h-16 sm:h-20"
              ].join(" ")}
            >
              <div className="flex items-center justify-between h-full">
                {/* left brand */}
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[#1c37b3] text-white flex items-center justify-center font-extrabold text-xs sm:text-sm shadow-sm">N</div>
                  <a href="/" className="text-white font-bold text-base sm:text-xl hover:opacity-90">
                    Nomoosh
                  </a>
                </div>

                {/* desktop nav */}
                <nav className="hidden md:flex items-center gap-6 text-sm">
                  <a href="#how" className="text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded px-1">Get started</a>
                  <a href="#faq" className="text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded px-1">FAQ</a>
                  
                  {/* Show user icon if logged in, otherwise show register button */}
                  {loggedInUserName ? (
                    <div className="relative">
                      <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-2 hover:bg-white/10 rounded-full p-1.5 pr-3 transition-colors"
                        aria-label="User menu"
                      >
                        <div className="h-8 w-8 rounded-full bg-white text-[#1c37b3] flex items-center justify-center font-semibold text-sm shadow">
                          {loggedInUserName.charAt(0).toUpperCase()}
                        </div>
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                              <div className="font-medium text-slate-900 text-sm">{loggedInUserName}</div>
                              {loggedInUserEmail && <div className="text-xs text-slate-500 mt-0.5">{loggedInUserEmail}</div>}
                            </div>
                            <a
                              href="/onboard/details"
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Continue Registration
                            </a>
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
                  ) : (
                    <button
                      onClick={openRegisterModal}
                      className="group relative overflow-hidden bg-white text-gray-900 px-5 py-2 rounded-full font-medium shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    >
                      <span className="absolute inset-0 translate-y-10 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all bg-gradient-to-r from-amber-200 to-rose-200" />
                      <span className="relative">Register your restaurant</span>
                    </button>
                  )}
                </nav>

                {/* mobile CTA or user icon */}
                {loggedInUserName ? (
                  <div className="md:hidden relative">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center gap-2 hover:bg-white/10 rounded-full p-1 transition-colors"
                      aria-label="User menu"
                    >
                      <div className="h-8 w-8 rounded-full bg-white text-[#1c37b3] flex items-center justify-center font-semibold text-sm shadow">
                        {loggedInUserName.charAt(0).toUpperCase()}
                      </div>
                    </button>

                    {/* Mobile Dropdown Menu */}
                    {showUserMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-[60]" 
                          onClick={() => setShowUserMenu(false)}
                        />
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-[70]">
                          <div className="px-4 py-3 border-b border-slate-100">
                            <div className="font-medium text-slate-900 text-sm">{loggedInUserName}</div>
                            {loggedInUserEmail && <div className="text-xs text-slate-500 mt-0.5">{loggedInUserEmail}</div>}
                          </div>
                          <a
                            href="/onboard/details"
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Continue Registration
                          </a>
                          <button
                            onClick={() => setShowSignOutModal(true)}
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
                ) : (
                  <button
                    onClick={openRegisterModal}
                    className="md:hidden bg-white/95 text-gray-900 px-4 py-2 rounded-full font-medium shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    aria-label="Register"
                  >
                    Register
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* spacer so content doesn't jump under fixed header */}
          <div className={scrolled ? "h-12 sm:h-14" : "h-16 sm:h-20"} />

          {/* hero copy */}
          <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 md:px-12 h-full flex items-start pt-4 sm:pt-6 md:pt-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="max-w-3xl"
            >
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight text-white drop-shadow-lg">
                Elevate your dining experience with <span className="text-amber-300">nomoosh</span>
              </h1>

              <p className="mt-4 text-white/90 text-base sm:text-lg md:text-xl">
                Quick onboarding and smooth QR ordering system for your customers.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={openRegisterModal}
                  className="relative inline-flex items-center justify-center gap-2 bg-[#1c37b3] hover:opacity-90 text-white px-6 py-3 rounded-xl font-semibold shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <span className="i-heroicon-qr-code" aria-hidden />
                  Register your restaurant
                </button>

                <a
                  href="#applications"
                  className="px-6 py-3 rounded-xl border border-white/70 text-white/90 inline-flex items-center justify-center backdrop-blur-sm hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  View existing applications
                </a>
              </div>
            </motion.div>
          </div>
        </div>

        {/* overlapping card */}
        
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12 -mt-14 sm:-mt-16 md:-mt-20 relative z-30">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4 }}
            className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl ring-1 ring-black/5 p-5 sm:p-6 md:p-8"
          >
            <div className="md:flex items-center gap-8">
              <div className="flex-1">
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Start serving smarter — onboard in 10 minutes</h3>
                <p className="text-gray-600 mt-2">Please keep these documents and details ready for a smooth sign-up</p>

                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 sm:mt-6 text-sm text-gray-700">
                  {[
                    "PAN card",
                    "Bank account details",
                    "Menu & profile food image",
                    "Restaurant images",
                    "Owner contact",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</span>
                      <div><strong>{item}</strong></div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="w-full sm:w-72 mt-6 sm:mt-0">
                <div className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl h-40 flex items-center justify-center ring-1 ring-black/5">
                  <svg className="w-12 h-12 text-red-500" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M14 12l-6 4V8l6 4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="ml-3 text-sm text-gray-600">Intro video</span>
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-red-200/40 blur-xl" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section
  className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 mt-12 md:mt-16 pb-16"
  id="how"
>
  <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 sm:mb-8">
    Why should you partner with Nomoosh?
  </h2>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
    <Feature
      title="Simplified Ordering Experience"
      text="Customers scan a QR code to view the digital menu and place orders instantly, reducing wait times and errors."
      icon={
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4h18v2H3zM3 9h18v2H3zM3 14h18v6H3z" />
        </svg>
      }
    />
    <Feature
      title="Seamless Manager & Kitchen Coordination"
      text="Orders are synced between manager and kitchen apps, ensuring smooth communication and faster service."
      icon={
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      }
    />
    <Feature
      title="Real-Time Order Tracking"
      text="Customers get live updates with a timer for their order status, improving transparency and satisfaction."
      icon={
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      }
    />
  </div>
</section>


      {/* FAQ */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 md:px-12 pb-24">
        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-6 sm:mb-8">Frequently asked questions</h3>
        <div className="space-y-4">
          {faqs.map((f, i) => (
            <div key={i} className="bg-white/90 backdrop-blur rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left px-4 sm:px-6 py-4 flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                aria-expanded={openFaq === i}
                aria-controls={`faq-${i}`}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">{i + 1}</span>
                  <div className="font-medium text-gray-900">{f.q}</div>
                </div>
                <div className="text-gray-400 text-xl">{openFaq === i ? "−" : "+"}</div>
              </button>
              <motion.div
                initial={false}
                animate={{ height: openFaq === i ? "auto" : 0, opacity: openFaq === i ? 1 : 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                id={`faq-${i}`}
                className="px-4 sm:px-6 overflow-hidden"
              >
                {openFaq === i && <div className="pb-4 text-gray-600">{f.a}</div>}
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="border-t pt-8 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Nomoosh — no mess · smooth ordering
        </div>
      </footer>

      {/* Modal (higher z-index to avoid being hidden by hero/overlay) */}
      {showModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          {/* dim backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-[110]" onClick={() => setShowModal(false)} />
          {/* panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-[120] bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 ring-1 ring-black/5"
            role="dialog"
            aria-modal="true"
            aria-label="Register your restaurant"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#1c37b3] text-white text-sm font-bold">1</span>
                <h4 className="text-lg font-semibold">Register your restaurant</h4>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded">✕</button>
            </div>

            <div className="mt-4">
              {modalSub === "emailEntry" && (
                <>
                  <Label>Full name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant owner / manager name" autoFocus />

                  <Label className="mt-3">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@restaurant.com" type="email" />

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <PrimaryButton onClick={handleEmailSendOtp} disabled={loading}>
                      {loading ? <Spinner /> : "Continue (verify email)"}
                    </PrimaryButton>
                    <GhostButton onClick={handleContinueAsPhone}>Continue as phone no.</GhostButton>
                  </div>

                  <div className="mt-3">
                    <GhostButton onClick={handleContinueWithGmail} disabled={loading} className="w-full">
                      <span className="inline-flex items-center gap-2 justify-center w-full">
                        <img src="https://www.svgrepo.com/show/355037/google.svg" alt="Google" className="w-5 h-5" /> Continue with Gmail
                      </span>
                    </GhostButton>
                  </div>
                </>
              )}

              {modalSub === "phoneEntry" && (
                <>
                  <Label>Full name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant owner / manager name" autoFocus />

                  <Label className="mt-3">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" />

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <PrimaryButton onClick={handlePhoneSendOtp} disabled={loading}>
                      {loading ? <Spinner /> : "Continue (verify phone)"}
                    </PrimaryButton>
                    <GhostButton onClick={handleContinueAsEmail}>Continue as email</GhostButton>
                  </div>

                  <div className="mt-3">
                    <GhostButton onClick={handleContinueWithGmail} disabled={loading} className="w-full">
                      <span className="inline-flex items-center gap-2 justify-center w-full">
                        <img src="https://www.svgrepo.com/show/355037/google.svg" alt="Google" className="w-5 h-5" /> Continue with Gmail
                      </span>
                    </GhostButton>
                  </div>
                </>
              )}

              {otpStep === "sent" && (
                <div className="mt-4">
                  <Label>Enter verification code</Label>
                  <input
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value)}
                    className="w-full border border-gray-300 focus:border-[#1c37b3] focus:ring-2 focus:ring-blue-200 rounded-lg p-3 mt-1 tracking-[0.3em] text-center font-semibold text-sm"
                    placeholder="0 0 0 0 0 0 0 0"
                    inputMode="numeric"
                    maxLength={8}
                    aria-label="Enter verification code"
                  />
                  <div className="mt-3 flex gap-2">
                    <PrimaryButton onClick={handleVerifyOtp} disabled={loading} className="flex-1">
                      {loading ? <Spinner /> : "Verify & Continue"}
                    </PrimaryButton>
                    <GhostButton onClick={() => { setOtpValue(""); setOtpStep("none"); }}>Cancel</GhostButton>
                  </div>
                </div>
              )}

              {modalError && (
                <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2" role="alert">
                  {modalError}
                </div>
              )}
            </div>

            <div className="mt-4 text-xs text-gray-500">
              By continuing you agree to our terms.
            </div>
          </motion.div>
        </div>
      )}

      {/* OAuth Processing Overlay */}
      {oauthProcessing && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 shadow-2xl text-center max-w-sm mx-4">
            <div className="flex justify-center mb-4">
              <Spinner />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Signing you in...</h3>
            <p className="text-sm text-gray-600">Please wait while we set up your account</p>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Modal */}
      {showSignOutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Sign Out?</h3>
            </div>
            <p className="text-slate-600 mb-6">Are you sure you want to sign out? You'll need to log in again to continue.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSignOutModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* small helper components (UI-only) */
function Feature({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.35 }}
      whileHover={{ scale: 1.05 }}   // 👈 grow slightly on hover
      whileTap={{ scale: 0.98 }}     // 👈 shrink a bit on tap
      className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-gray-100 text-left cursor-pointer"
    >
      <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-xl bg-blue-50 text-[#1c37b3]">
        {icon}
      </div>
      <h4 className="font-semibold text-lg mb-2 tracking-tight">{title}</h4>
      <p className="text-gray-600 text-sm leading-relaxed">{text}</p>
    </motion.div>
  );
}



function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-gray-700 ${className}`}>{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`w-full border border-gray-300 focus:border-[#1c37b3] focus:ring-2 focus:ring-blue-200 rounded-lg p-3 mt-1 placeholder:text-gray-400 ${className}`}
      {...rest}
    />
  );
}

function PrimaryButton({ children, className = "", ...rest }: any) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 bg-[#1c37b3] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, className = "", ...rest }: any) {
  return (
    <button
      className={`px-3 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
    </svg>
  );
}
