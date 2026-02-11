// src/app/onboard/details/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardShell, buildSteps } from "../components";
import { restoreOnboardingStatus, restoreOnboardingData } from "@/lib/onboardingStatus";

/* --- Helpers --- */
const emailIsValid = (email: string) => /^\S+@\S+\.\S+$/.test(email.trim());
const phoneIsValid = (phone: string) => /^\d{10}$/.test(phone.replace(/\D/g, ""));

// --------------------
// BACKEND URL (env)
// --------------------
const BACKEND_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

/**
 * MockMap component (keeps behavior from your existing code).
 * If you have NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY it will try to load the SDK;
 * otherwise it falls back to an iframe embed.
 */
function MockMap({
  lat = 28.6139,
  lng = 77.209,
  onMarkerMoved,
}: {
  lat?: number;
  lng?: number;
  onMarkerMoved?: (pos: { lat: number; lng: number }) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const initCalledRef = useRef(false);

  const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY;

  const loadGoogleMapsScript = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (typeof window === "undefined") return reject(new Error("window undefined"));
      if ((window as any).google && (window as any).google.maps) return resolve();
      const id = "gmaps-sdk";
      const existing = document.getElementById(id) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => {
          if ((window as any).google && (window as any).google.maps) resolve();
          else reject(new Error("google.maps not available after script load"));
        });
        existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load")));
        return;
      }
      const s = document.createElement("script");
      s.id = id;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}`;
      s.async = true;
      s.defer = true;
      s.onload = () => {
        if ((window as any).google && (window as any).google.maps) resolve();
        else reject(new Error("google.maps not available after load"));
      };
      s.onerror = () => reject(new Error("Google Maps script failed to load"));
      document.head.appendChild(s);
    });

  const initMap = () => {
    if (initCalledRef.current) return;
    if (!mapContainerRef.current) return;
    if (!(window as any).google?.maps) return;

    initCalledRef.current = true;
    const gmaps = (window as any).google.maps;
    const center = { lat, lng };

    mapRef.current = new gmaps.Map(mapContainerRef.current, {
      center,
      zoom: 16,
      streetViewControl: false,
      mapTypeControl: false,
    });

    markerRef.current = new gmaps.Marker({
      position: center,
      map: mapRef.current,
      draggable: true,
      title: "Drag to set restaurant location",
    });

    markerRef.current.addListener("dragend", (ev: any) => {
      const newPos = { lat: ev.latLng.lat(), lng: ev.latLng.lng() };
      onMarkerMoved?.(newPos);
    });

    mapRef.current.addListener("click", (e: any) => {
      const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      markerRef.current.setPosition(newPos);
      onMarkerMoved?.(newPos);
    });
  };

  React.useEffect(() => {
    if (!GOOGLE_KEY) return;
    let mounted = true;
    loadGoogleMapsScript()
      .then(() => {
        if (!mounted) return;
        initMap();
      })
      .catch((err) => {
        console.warn("Google Maps load error:", err);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GOOGLE_KEY]);

  React.useEffect(() => {
    if (markerRef.current && typeof lat === "number" && typeof lng === "number") {
      try {
        markerRef.current.setPosition({ lat, lng });
        mapRef.current?.panTo({ lat, lng });
      } catch {
        // ignore
      }
    }
  }, [lat, lng]);

  if (GOOGLE_KEY) {
    return (
      <div
        ref={mapContainerRef}
        className="w-full rounded-lg overflow-hidden border border-slate-200 shadow-sm h-56 sm:h-64 md:h-72"
      />
    );
  }

  const src = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  return (
    <div className="w-full rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      <iframe
        title="map-mock"
        src={src}
        width="100%"
        className="block w-full h-56 sm:h-64 md:h-72"
      />
    </div>
  );
}

export default function OnboardDetailsPage() {
  const router = useRouter();

  // canonical shape / defaults
  const defaultForm = {
    restaurantName: "",
    restaurantPhone:"",
    restaurantIntro:"",
    ownerName: "",
    email: "",
    phone: "",
    street: "",
    locality: "",
    city: "",
    pincode: "",
    landmark: "",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
  };

  const [form, setForm] = useState<typeof defaultForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeStep, setActiveStep] = useState<number>(0);

  // new state for geolocation & UI flags
  const [locLoading, setLocLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});

  // user info from first page (signup)
  const [userId, setUserId] = useState<string | null>(null);
  const [prefilledEmail, setPrefilledEmail] = useState<string | null>(null);
  const [prefilledPhone, setPrefilledPhone] = useState<string | null>(null);
  const [prefilledName, setPrefilledName] = useState<string | null>(null);

  // Loading flag for submit
  const [saving, setSaving] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState<string | null>(null);

  // Restore onboarding status from database on mount
  useEffect(() => {
    restoreOnboardingStatus().then((status) => {
      // If registration is already complete, redirect to staff signup
      if (status.completed) {
        if (status.restaurant_id) {
          localStorage.setItem("pending_restaurant_id", String(status.restaurant_id));
        }
        router.replace("/staff/signup");
        return;
      }
    });
    
    // Also restore form data from database
    restoreOnboardingData().then((data) => {
      if (data?.temp) {
        const temp = data.temp;
        // Update form with data from database
        setForm((prev) => ({
          ...prev,
          restaurantName: temp.restaurant_name || prev.restaurantName,
          restaurantPhone: temp.rest_mob_number || prev.restaurantPhone,
          restaurantIntro: temp.description || prev.restaurantIntro,
          ownerName: temp.owner_name || prev.ownerName,
          email: temp.owner_email || prev.email,
          phone: temp.owner_mobile || prev.phone,
          street: temp.street || prev.street,
          locality: temp.locality || prev.locality,
          city: temp.city || prev.city,
          pincode: temp.pincode || prev.pincode,
          landmark: temp.landmark || prev.landmark,
          latitude: temp.latitude ? parseFloat(temp.latitude) : prev.latitude,
          longitude: temp.longitude ? parseFloat(temp.longitude) : prev.longitude,
        }));
        
        // Update coords for map
        if (temp.latitude && temp.longitude) {
          setCoords({ 
            lat: parseFloat(temp.latitude), 
            lng: parseFloat(temp.longitude) 
          });
        }
      }
    });
  }, []);

  // load draft + signup values (single setForm invocation to avoid overwrites)
  useEffect(() => {
    try {
      const draftRaw = localStorage.getItem("nomoosh_detailsForm");
      let draft: Partial<typeof defaultForm> | null = null;
      if (draftRaw) {
        try {
          draft = JSON.parse(draftRaw);
        } catch {
          draft = null;
        }
      }

      const uid = localStorage.getItem("nomoosh_userId");
      const name = localStorage.getItem("nomoosh_name");
      const email = localStorage.getItem("nomoosh_email");
      const phone = localStorage.getItem("nomoosh_phone");

      if (uid) setUserId(uid);
      if (email) setPrefilledEmail(email);
      if (phone) setPrefilledPhone(phone);
      if (name) setPrefilledName(name);

      // Build initial object once and set
      const initial = { ...defaultForm };

      if (draft) {
        // use draft values where present
        if (typeof draft.restaurantName === "string") initial.restaurantName = draft.restaurantName;
        if (typeof draft.restaurantPhone === "string") initial.restaurantPhone = draft.restaurantPhone;
        if (typeof draft.restaurantIntro === "string") initial.restaurantIntro = draft.restaurantIntro;
        if (typeof draft.ownerName === "string") initial.ownerName = draft.ownerName;
        if (typeof draft.email === "string") initial.email = draft.email;
        if (typeof draft.phone === "string") initial.phone = draft.phone;
        if (typeof draft.street === "string") initial.street = draft.street;
        if (typeof draft.locality === "string") initial.locality = draft.locality;
        if (typeof draft.city === "string") initial.city = draft.city;
        if (typeof draft.pincode === "string") initial.pincode = draft.pincode;
        if (typeof draft.landmark === "string") initial.landmark = draft.landmark;
        if (draft.latitude != null) initial.latitude = Number(draft.latitude);
        if (draft.longitude != null) initial.longitude = Number(draft.longitude);
      }

      // fill missing owner/email/phone from signup if not present in draft
      initial.ownerName = initial.ownerName || name || "";
      initial.email = initial.email || email || "";
      initial.phone = initial.phone || phone || "";

      setForm(initial);

      // also set coords preview if lat/lng present
      if (initial.latitude != null || initial.longitude != null) {
        setCoords({ lat: initial.latitude as number | undefined, lng: initial.longitude as number | undefined });
      }
    } catch (e) {
      console.warn("Error reading localStorage for prefill/draft:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft to localStorage whenever form changes
  useEffect(() => {
    try {
      localStorage.setItem("nomoosh_detailsForm", JSON.stringify(form));
    } catch (e) {
      // ignore storage errors
    }
  }, [form]);

  // shared reverse-geocode helper (POST)
  async function triggerReverseGeocode(lat: number, lng: number) {
    setLocLoading(true);
    setGeoError(null);

    try {
      if (!BACKEND_BASE) throw new Error("Backend API not configured (NEXT_PUBLIC_API_BASE).");
      const res = await fetch(`${BACKEND_BASE}/geocode/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, language: "en" }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Reverse geocode failed (${res.status})`);
      }

      const data = await res.json();

      setCoords({ lat: data.latitude ?? lat, lng: data.longitude ?? lng });
      setForm((s) => ({
        ...s,
        latitude: data.latitude ?? lat,
        longitude: data.longitude ?? lng,
        street: data.street ?? s.street,
        locality: data.locality ?? s.locality,
        city: data.city ?? s.city,
        pincode: data.pincode ?? s.pincode,
      }));
    } catch (err) {
      console.warn("Reverse geocode failed", err);
      setGeoError("Could not resolve address from coordinates — please edit manually.");
      setCoords({ lat, lng });
      setForm((s) => ({ ...s, latitude: lat, longitude: lng }));
    } finally {
      setLocLoading(false);
    }
  }

  const requiredFields = ["restaurantName", "ownerName", "email", "phone", "street", "locality", "city", "pincode"];
  const isCompleted = () => {
    for (const k of requiredFields) {
      const val = (form as any)[k] as string;
      if (!val || val.trim() === "") return false;
    }
    if (!emailIsValid(form.email)) return false;
    if (!phoneIsValid(form.phone)) return false;
    return true;
  };

  const validateAll = () => {
    const newErrors: Record<string, string> = {};
    if (!form.restaurantName.trim()) newErrors.restaurantName = "Restaurant name is required";
    if (!form.restaurantPhone.trim()) newErrors.restaurantPhone = "Phone is required";
    else if (!phoneIsValid(form.restaurantPhone)) newErrors.restaurantPhone = "Phone must be 10 digits";
    if (!form.ownerName.trim()) newErrors.ownerName = "Owner name is required";
    if (!form.email.trim()) newErrors.email = "Email is required";
    else if (!emailIsValid(form.email)) newErrors.email = "Enter a valid email";
    if (!form.phone.trim()) newErrors.phone = "Phone is required";
    else if (!phoneIsValid(form.phone)) newErrors.phone = "Phone must be 10 digits";
    if (!form.street.trim()) newErrors.street = "Street / Building is required";
    if (!form.locality.trim()) newErrors.locality = "Locality / Area is required";
    if (!form.city.trim()) newErrors.city = "City is required";
    if (!form.pincode.trim()) newErrors.pincode = "Pincode is required";
    else if (!/^\d{6}$/.test(form.pincode)) newErrors.pincode = "Pincode must be 6 digits";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  // SUBMISSION: build the exact JSON shape you requested
  const handleSubmitNext = async () => {
    if (!validateAll()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Build payload with required keys exactly as you asked
    const payload = {
      usr_id: userId ?? null,
      rest_name: form.restaurantName,
      rest_phone: form.restaurantPhone,
      rest_intro: form.restaurantIntro,
      ownr_name: form.ownerName,
      ownr_email: form.email,
      ownr_mobile: form.phone,
      strret: form.street,
      localty: form.locality,
      cty: form.city,
      pincde: form.pincode,
      landmrk: form.landmark,
      latitude: form.latitude != null ? String(form.latitude) : null,
      longitude: form.longitude != null ? String(form.longitude) : null,
    };

    try {
      setSaving(true);
      setGeoError(null);

      // Persist draft before calling backend (so back/forward restores)
      try {
        localStorage.setItem("nomoosh_detailsForm", JSON.stringify(form));
      } catch (e) {
        // ignore storage errors
      }

      if (!BACKEND_BASE) throw new Error("Backend API not configured (NEXT_PUBLIC_API_BASE).");
      const res = await fetch(`${BACKEND_BASE}/register-restaurant_pg1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message: string | null = null;
        try {
          const txt = await res.text();
          try {
            const j = JSON.parse(txt);
            message = j?.detail ?? j?.message ?? txt;
          } catch {
            message = txt;
          }
        } catch (e) {
          /* ignore */
        }
        throw new Error(message || `Save failed (${res.status})`);
      }

      const data = await res.json();
      const restaurantId = data.restaurantId ?? data.restaurant_id ?? null;
      if (restaurantId) {
        try {
          localStorage.setItem("restaurantId", restaurantId);
        } catch (e) {}
      }

      try {
        localStorage.setItem("detailsCompleted", "true");
      } catch (e) {}

      // navigate to menu
      router.push("/onboard/menu");
    } catch (err: any) {
      console.error("Error saving restaurant:", err);
      setGeoError(err?.message || "Could not save restaurant details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // >>> ONLY CHANGE BELOW: sidebar navigation now includes Cuisine & Time slots
  const handleSidebarClick = (index: number) => {
    // 0 = details (current)
    if (index === 0) {
      setActiveStep(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // 1 = menu
    if (index === 1) {
      if (validateAll()) {
        try {
          localStorage.setItem("detailsCompleted", "true");
        } catch {}
        setActiveStep(1);
        router.push("/onboard/menu");
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    // 2 = cuisine & timings (blocked until details + menu are complete)
    if (index === 2) {
      const detailsOk = validateAll();
      const menuOk = localStorage.getItem("menuCompleted") === "true";
      if (detailsOk && menuOk) {
        try {
          localStorage.setItem("detailsCompleted", "true");
        } catch {}
        setActiveStep(2);
        router.push("/onboard/cuisine");
      } else {
        setShowValidationModal("Please complete Restaurant information and Menu before continuing to Cuisine & Time slots.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    // 3 = documents
    if (index === 3) {
      const detailsOk = localStorage.getItem("detailsCompleted") === "true" || validateAll();
      const menuOk = localStorage.getItem("menuCompleted") === "true";
      const cuisineOk = localStorage.getItem("cuisineTimesCompleted") === "true";
      if (detailsOk && menuOk && cuisineOk) {
        setActiveStep(3);
        router.push("/onboard/documents");
      } else {
        setShowValidationModal("Please complete Restaurant information, Menu and Cuisine & Time slots before Documents.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
  };
  // <<< ONLY CHANGE ABOVE

  const handleMarkerMoved = async ({ lat, lng }: { lat: number; lng: number }) => {
    await triggerReverseGeocode(lat, lng);
  };

  const handleUseCurrentLocation = async () => {
    setGeoError(null);
    setLocLoading(true);

    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      setLocLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        await triggerReverseGeocode(lat, lng);
      },
      (err) => {
        setLocLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError("Location permission denied. Please enable location access or enter address manually.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError("Location unavailable. Try again or enter address manually.");
        } else if (err.code === err.TIMEOUT) {
          setGeoError("Location request timed out. Try again.");
        } else {
          setGeoError("Unable to fetch location. Please enter address manually.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const steps = buildSteps(1, {
    details: isCompleted(),
    menu: typeof window !== "undefined" && localStorage.getItem("menuCompleted") === "true",
    cuisine: typeof window !== "undefined" && localStorage.getItem("cuisineTimesCompleted") === "true",
    docs: typeof window !== "undefined" && localStorage.getItem("documentsCompleted") === "true",
  }, {
    1: () => handleSidebarClick(0),
    2: () => handleSidebarClick(1),
    3: () => handleSidebarClick(2),
    4: () => handleSidebarClick(3),
  });

  return (
    <>
      <OnboardShell currentStep={1} steps={steps}>
            {/* Restaurant info card */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-extrabold text-slate-800 mb-4">Restaurant information</h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-600 mb-2">Restaurant name</label>
                <input name="restaurantName" value={form.restaurantName} onChange={handleChange} placeholder="Restaurant name" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.restaurantName ? "border-red-500" : "border-slate-200"}`} />
                {errors.restaurantName && <p className="text-sm text-red-500 mt-2">{errors.restaurantName}</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    {/* Phone */}
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-2">
        Restaurant phone number
      </label>
      <input
        name="restaurantPhone"
        value={(form as any).restaurantPhone || ""}
        onChange={handleChange}
        placeholder="10-digit phone number"
        className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${
          errors.restaurantPhone ? "border-red-500" : "border-slate-200"
        }`}
      />
      {errors.restaurantPhone && (
        <p className="text-sm text-red-500 mt-2">{errors.restaurantPhone}</p>
      )}
    </div>

    {/* Short Intro */}
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-2">
        Tell us about your restaurant (optional)
      </label>
      <input
        name="restaurantIntro"
        value={(form as any).restaurantIntro || ""}
        onChange={handleChange}
        placeholder="E.g. Family-run, best biryani in town"
        className="w-full border rounded-xl px-4 py-3 focus:outline-none border-slate-200"
      />
    </div>
  </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-700 mb-3">Owner details</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <input name="ownerName" value={form.ownerName} onChange={handleChange} placeholder="Full name" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.ownerName ? "border-red-500" : "border-slate-200"}`} />
                    {errors.ownerName && <p className="text-sm text-red-500 mt-2">{errors.ownerName}</p>}
                  </div>

                  <div>
                    <input name="email" value={form.email} onChange={handleChange} placeholder="Email address" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.email ? "border-red-500" : "border-slate-200"}`} disabled={!!prefilledEmail} />
                    {errors.email && <p className="text-sm text-red-500 mt-2">{errors.email}</p>}
                    {prefilledEmail && <p className="text-xs text-slate-400 mt-2">Email provided during signup (not editable)</p>}
                  </div>
                </div>

                <div className="mt-4">
                  <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone number" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.phone ? "border-red-500" : "border-slate-200"}`} disabled={!!prefilledPhone} />
                  {errors.phone && <p className="text-sm text-red-500 mt-2">{errors.phone}</p>}
                  {prefilledPhone && <p className="text-xs text-slate-400 mt-2">Phone provided during signup (not editable)</p>}
                </div>
              </div>
            </div>

            {/* Location card */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
              <h3 className="text-xl font-semibold text-slate-800 mb-4">Add your restaurant's location for order pick-up</h3>

              <div className="mb-4">
                <MockMap lat={coords.lat ?? form.latitude} lng={coords.lng ?? form.longitude} onMarkerMoved={handleMarkerMoved} />

                <div className="mt-3 flex items-center gap-3">
                  <button onClick={handleUseCurrentLocation} disabled={locLoading} className="px-4 py-2 bg-sky-600 text-white rounded-xl shadow hover:bg-sky-700">
                    {locLoading ? "Detecting location…" : "Use my current location"}
                  </button>

                  {geoError && <div className="text-sm text-red-500">{geoError}</div>}

                  {form.latitude && form.longitude && (<div className="text-sm text-slate-500">Lat: {form.latitude.toFixed(5)}, Lng: {form.longitude.toFixed(5)}</div>)}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-2">Street / Building</label>
                  <input name="street" value={form.street} onChange={handleChange} placeholder="Street / Building" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.street ? "border-red-500" : "border-slate-200"}`} />
                  {errors.street && <p className="text-sm text-red-500 mt-2">{errors.street}</p>}
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">Locality / Area</label>
                  <input name="locality" value={form.locality} onChange={handleChange} placeholder="Locality / Area" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.locality ? "border-red-500" : "border-slate-200"}`} />
                  {errors.locality && <p className="text-sm text-red-500 mt-2">{errors.locality}</p>}
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">City</label>
                  <input name="city" value={form.city} onChange={handleChange} placeholder="City" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.city ? "border-red-500" : "border-slate-200"}`} />
                  {errors.city && <p className="text-sm text-red-500 mt-2">{errors.city}</p>}
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">Pincode</label>
                  <input name="pincode" value={form.pincode} onChange={handleChange} placeholder="Pincode" className={`w-full border rounded-xl px-4 py-3 focus:outline-none ${errors.pincode ? "border-red-500" : "border-slate-200"}`} />
                  {errors.pincode && <p className="text-sm text-red-500 mt-2">{errors.pincode}</p>}
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-2">Landmark (optional)</label>
                  <input name="landmark" value={form.landmark} onChange={handleChange} placeholder="Landmark (optional)" className="w-full border rounded-xl px-4 py-3 focus:outline-none border-slate-200" />
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex justify-end">
              <button onClick={handleSubmitNext} disabled={saving} className={`px-6 py-3 bg-[#1c37b3] text-white rounded-xl shadow hover:opacity-90 transition ${saving ? "opacity-70 cursor-not-allowed" : ""}`}>
                {saving ? "Saving…" : "Save & Continue →"}
              </button>
            </div>
      </OnboardShell>

      {/* Validation Modal */}
        {showValidationModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Complete Previous Steps</h3>
              </div>
              <p className="text-slate-600 mb-6">{showValidationModal}</p>
              <button
                onClick={() => setShowValidationModal(null)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#1c37b3] text-white font-medium hover:opacity-90 transition"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </>
    );
  }
