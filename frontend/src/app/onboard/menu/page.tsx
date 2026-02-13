// src/app/onboard/menu/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardShell, buildSteps } from "../components";
import { restoreOnboardingStatus } from "@/lib/onboardingStatus";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type UploadFile = {
  id: string;
  file: File;
  preview?: string; // blob url for images/videos
};

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

const PHOTO_LIMIT = 10;
const VIDEO_LIMIT = 3;

type SectionKey =
  | "exterior_photos"
  | "exterior_videos"
  | "interior_photos"
  | "interior_videos"
  | "kitchen_photos"
  | "kitchen_videos";

type MenuVariant = { variant_name: string; price: number };
type MenuItem = { name: string; variants: MenuVariant[]; description?: string };
type MenuCategory = { category: string; items: MenuItem[] };

export default function MenuUploadPage() {
  const router = useRouter();

  // ---------------- Menu files (PDF / images) ----------------
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<{ itemCount: number } | null>(null);

  // ---------------- Parsed menu display ----------------
  const [parsedCategories, setParsedCategories] = useState<MenuCategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // ---------------- Restaurant media ----------------
  const [media, setMedia] = useState<Record<SectionKey, UploadFile[]>>({
    exterior_photos: [],
    exterior_videos: [],
    interior_photos: [],
    interior_videos: [],
    kitchen_photos: [],
    kitchen_videos: [],
  });

  // ---------------- Sidebar badge ----------------
  const [detailsCompleted, setDetailsCompleted] = useState(false);
  const [menuCompleted, setMenuCompleted] = useState(false); // <-- added
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState<number | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

  useEffect(() => {
    // First restore status from database
    restoreOnboardingStatus().then(() => {
      try {
        setDetailsCompleted(localStorage.getItem("detailsCompleted") === "true");
      } catch {}
      try {
        setMenuCompleted(localStorage.getItem("menuCompleted") === "true");
      } catch {}
    });
  }, []);

  // Cleanup blobs on unmount
  useEffect(() => {
    return () => {
      // menu files previews
      files.forEach((f) => f.preview?.startsWith("blob:") && URL.revokeObjectURL(f.preview));
      // media previews
      Object.values(media).flat().forEach((m) => m.preview?.startsWith("blob:") && URL.revokeObjectURL(m.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------- Menu file selection -------------
  const onFilesSelected = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList);
    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    const filtered: UploadFile[] = [];

    for (const f of arr) {
      if (!allowed.includes(f.type)) {
        setError("Only PDF and JPG/PNG images are allowed.");
        continue;
      }
      const id = uid("mf-");
      const preview = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      filtered.push({ id, file: f, preview });
    }

    if (filtered.length > 0) {
      setFiles((prev) => [...prev, ...filtered]);
      setError(null);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    onFilesSelected(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilesSelected(e.target.files);
    e.currentTarget.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const toRemove = prev.find((p) => p.id === id);
      if (toRemove?.preview?.startsWith("blob:")) URL.revokeObjectURL(toRemove.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  // ------------- Parse menu only (no navigation) -------------
  const handleUploadAndParse = async () => {
    if (files.length === 0) {
      setError("Please select at least one menu file to upload.");
      return;
    }
    setError(null);
    setIsParsing(true);

    try {
      if (!API_BASE) throw new Error("Backend API not configured (NEXT_PUBLIC_API_BASE).");
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f.file));

      const res = await fetch(`${API_BASE}/digitize-menu`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Parse API failed (${res.status})`);

      const parsedMenu = await res.json(); // { menu: {...} }
      localStorage.setItem("parsedMenuItems", JSON.stringify(parsedMenu));
      
      // Count total items and load categories
      let totalItems = 0;
      const cats: MenuCategory[] = [];
      if (parsedMenu?.menu?.categories) {
        parsedMenu.menu.categories.forEach((cat: any) => {
          const items = cat.items || [];
          totalItems += items.length;
          cats.push({
            category: cat.category || "General",
            items: items.map((item: any) => ({
              name: item.name || "Unnamed",
              variants: item.variants || [{ variant_name: "Regular", price: 0 }],
              description: item.description || ""
            }))
          });
        });
      }
      setParsedCategories(cats);
      setExpandedCategories(new Set(cats.map((_, idx) => idx))); // Expand all
      setParseSuccess({ itemCount: totalItems });
      setError(null);
    } catch (err: any) {
      console.error("Upload/parse error", err);
      setError(err.message || "Upload failed — try again.");
      setParseSuccess(null);
    } finally {
      setIsParsing(false);
    }
  };

  // ------------- Menu item manipulation -------------
  const toggleCategory = (idx: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const updateItemName = (catIdx: number, itemIdx: number, name: string) => {
    setParsedCategories(prev => {
      const next = [...prev];
      next[catIdx].items[itemIdx].name = name;
      return next;
    });
  };

  const updateVariantPrice = (catIdx: number, itemIdx: number, varIdx: number, price: string) => {
    setParsedCategories(prev => {
      const next = [...prev];
      next[catIdx].items[itemIdx].variants[varIdx].price = parseInt(price) || 0;
      return next;
    });
  };

  const removeItem = (catIdx: number, itemIdx: number) => {
    setParsedCategories(prev => {
      const next = [...prev];
      next[catIdx].items.splice(itemIdx, 1);
      return next;
    });
  };

  const addItem = (catIdx: number) => {
    setParsedCategories(prev => {
      const next = [...prev];
      next[catIdx].items.push({
        name: "New Dish",
        variants: [{ variant_name: "Regular", price: 0 }],
        description: ""
      });
      return next;
    });
  };

  const addCategory = () => {
    setParsedCategories(prev => [...prev, { category: "New Category", items: [] }]);
  };

  const updateCategoryName = (idx: number, name: string) => {
    setParsedCategories(prev => {
      const next = [...prev];
      next[idx].category = name;
      return next;
    });
  };

  const removeCategory = (idx: number) => {
    setShowDeleteCategoryModal(idx);
  };

  const confirmRemoveCategory = () => {
    if (showDeleteCategoryModal !== null) {
      setParsedCategories(prev => prev.filter((_, i) => i !== showDeleteCategoryModal));
      setShowDeleteCategoryModal(null);
    }
  };

  // ------------- Add/remove restaurant media -------------
  const addMedia = (key: SectionKey, accept: string, limit: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = false;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;

      setMedia((prev) => {
        const arr = prev[key] || [];
        if (arr.length >= limit) return prev;

        const id = uid("rm-");
        const preview = URL.createObjectURL(f);
        return { ...prev, [key]: [...arr, { id, file: f, preview }] };
      });
    };
    input.click();
  };

  const removeMedia = (key: SectionKey, id: string) => {
    setMedia((prev) => {
      const arr = prev[key] || [];
      const rem = arr.find((x) => x.id === id);
      rem?.preview?.startsWith("blob:") && URL.revokeObjectURL(rem.preview);
      return { ...prev, [key]: arr.filter((x) => x.id !== id) };
    });
  };

  // ------------- Save & Continue (upload media + save menu to DB + go cuisine) -------------
  const handleSaveAndContinue = async () => {
    setError(null);
    
    // Validation: must have parsed categories
    if (parsedCategories.length === 0) {
      setError("Please parse your menu before saving.");
      return;
    }
    
    setSaving(true);
    
    try {
      if (!API_BASE) throw new Error("API base not configured (NEXT_PUBLIC_API_BASE).");

      // Step 1: Upload restaurant media
      const fd = new FormData();
      const userId = localStorage.getItem("nomoosh_userId");
      if (userId) fd.append("user_id", userId);

      // Menu files
      files.forEach((f) => fd.append("menu_files[]", f.file));

      // Restaurant media (photos/videos by section)
      ([
        "exterior_photos",
        "exterior_videos",
        "interior_photos",
        "interior_videos",
        "kitchen_photos",
        "kitchen_videos",
      ] as SectionKey[]).forEach((k) => {
        media[k].forEach((m) => fd.append(`${k}[]`, m.file));
      });

      const mediaRes = await fetch(`${API_BASE}/upload-restaurant-media`, {
        method: "POST",
        body: fd,
      });

      if (!mediaRes.ok) {
        const txt = await mediaRes.text().catch(() => "");
        throw new Error(txt || `Media upload failed (${mediaRes.status})`);
      }

      // Step 2: Build menu payload and save to database
      const userIdRaw = localStorage.getItem("nomoosh_userId") ?? localStorage.getItem("user_id") ?? "0";
      const user_id_number = Number(userIdRaw) || 0;
      const restaurant_name = localStorage.getItem("nomoosh_restaurant_name") ?? localStorage.getItem("restaurantName") ?? "string";

      const menuPayload = {
        user_id: user_id_number,
        menu: {
          restaurant_name,
          categories: parsedCategories.map((cat) => ({
            category: cat.category,
            items: cat.items.map((item) => ({
              name: item.name,
              variants: (item.variants || [])
                .filter((v) => !(v.variant_name === "None" && (v.price === null || v.price === undefined)))
                .map((v) => ({ variant_name: v.variant_name, price: v.price ?? 0 })),
              description: (item.description ?? "").toString().trim(),
              image_link: "",
            })),
          })),
        },
      };

      const menuRes = await fetch(`${API_BASE}/register-restaurant_pg2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(menuPayload),
      });

      if (!menuRes.ok) {
        const txt = await menuRes.text().catch(() => "");
        throw new Error(txt || `Menu save failed (${menuRes.status})`);
      }

      // Mark menu as completed
      try {
        localStorage.setItem("menuCompleted", "true");
        setMenuCompleted(true);
      } catch {}

      // Navigate to cuisine page
      router.push("/onboard/cuisine");
    } catch (err: any) {
      console.error("Save & Continue error:", err);
      setError(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ----------- Small helpers to render sections -----------
  const sections = useMemo(
    () => [
      { title: "Exterior", photosKey: "exterior_photos" as SectionKey, videosKey: "exterior_videos" as SectionKey },
      { title: "Interior", photosKey: "interior_photos" as SectionKey, videosKey: "interior_videos" as SectionKey },
      { title: "Kitchen",  photosKey: "kitchen_photos"  as SectionKey, videosKey: "kitchen_videos"  as SectionKey },
    ],
    []
  );

  // ---- helper to guard Cuisine navigation ----
  const goCuisineIfAllowed = () => {
    const detailsOk = localStorage.getItem("detailsCompleted") === "true" || detailsCompleted;
    const menuOk = localStorage.getItem("menuCompleted") === "true" || menuCompleted;
    if (detailsOk && menuOk) {
      router.push("/onboard/cuisine");
    } else {
      setShowValidationModal(true);
    }
  };

  const steps = buildSteps(2, {
    details: detailsCompleted,
    menu: menuCompleted,
    cuisine: typeof window !== "undefined" && localStorage.getItem("cuisineTimesCompleted") === "true",
    docs: typeof window !== "undefined" && localStorage.getItem("documentsCompleted") === "true",
  }, {
    3: goCuisineIfAllowed,
  });

  return (
    <>
      <OnboardShell currentStep={2} steps={steps}>
            {/* Upload your menu */}
            <div
              className={`bg-white rounded-2xl p-8 shadow-sm border border-slate-100 transition-opacity ${
                isParsing ? "opacity-60" : ""
              }`}
            >
              <h1 className="text-2xl font-extrabold text-slate-800 mb-6">Upload your menu</h1>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`rounded-2xl p-6 md:p-8 border-2 ${
                  dragOver ? "border-sky-400 bg-sky-50/40" : "border-dashed border-slate-300 bg-white"
                }`}
                style={{ borderStyle: "dashed" }}
              >
                <p className="text-slate-600 mb-6">
                  Drag & drop your menu (PDF/image) here or use the buttons below
                </p>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-block">
                    <input onChange={handleSelectFiles} multiple type="file" accept=".pdf,image/*" className="hidden" />
                    <span className="inline-block px-5 py-3 rounded-md bg-sky-600 text-white cursor-pointer shadow-sm hover:bg-sky-700">
                      Select files
                    </span>
                  </label>

                  <button
                    onClick={handleUploadAndParse}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                    disabled={isParsing}
                  >
                    {isParsing ? "Parsing..." : "Upload & Parse"}
                  </button>

                  <div className="ml-auto text-sm text-slate-400">Accepted: PDF, JPG, PNG</div>
                </div>
              </div>

              {/* File list */}
              <div className="mt-8">
                <h3 className="font-semibold text-slate-700 mb-3">Files to upload</h3>
                {error && <div className="text-sm text-red-500 mb-3">{error}</div>}
                {parseSuccess && (
                  <div className="mb-3 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                    <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-green-800 font-medium text-sm">✓ Menu parsed successfully!</p>
                      <p className="text-green-700 text-sm mt-1">
                        Found <strong>{parseSuccess.itemCount}</strong> dish{parseSuccess.itemCount !== 1 ? 'es' : ''}. Review and edit below.
                      </p>
                    </div>
                  </div>
                )}

                {parsedCategories.length > 0 && (
                  <div className="mb-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800">Parsed Menu Items</h3>
                      <button
                        onClick={addCategory}
                        className="text-sm px-3 py-1.5 rounded-lg border border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                      >
                        + Add Category
                      </button>
                    </div>

                    {parsedCategories.map((cat, catIdx) => (
                      <div key={catIdx} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                        <div
                          className="flex items-center justify-between p-4 bg-slate-50 cursor-pointer hover:bg-slate-100"
                          onClick={() => toggleCategory(catIdx)}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <svg className={`w-4 h-4 text-slate-600 transition-transform ${expandedCategories.has(catIdx) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                            <input
                              type="text"
                              value={cat.category}
                              onChange={(e) => { e.stopPropagation(); updateCategoryName(catIdx, e.target.value); }}
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-300 rounded px-1"
                            />
                            <span className="text-sm text-slate-500">({cat.items.length} items)</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeCategory(catIdx); }}
                            className="text-red-500 hover:text-red-700 text-sm px-2"
                          >
                            Remove
                          </button>
                        </div>

                        {expandedCategories.has(catIdx) && (
                          <div className="p-4 space-y-3">
                            {cat.items.map((item, itemIdx) => (
                              <div key={itemIdx} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 space-y-2">
                                    <input
                                      type="text"
                                      value={item.name}
                                      onChange={(e) => updateItemName(catIdx, itemIdx, e.target.value)}
                                      className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                                      placeholder="Dish name"
                                    />
                                    <div className="space-y-1">
                                      {item.variants.map((variant, varIdx) => (
                                        <div key={varIdx} className="flex items-center gap-2">
                                          <span className="text-sm text-slate-600 w-20">{variant.variant_name}:</span>
                                          <span className="text-slate-500">₹</span>
                                          <input
                                            type="number"
                                            value={variant.price}
                                            onChange={(e) => updateVariantPrice(catIdx, itemIdx, varIdx, e.target.value)}
                                            className="w-24 px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-300"
                                            placeholder="Price"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => removeItem(catIdx, itemIdx)}
                                    className="text-red-500 hover:text-red-700 text-sm px-2"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button
                              onClick={() => addItem(catIdx)}
                              className="w-full text-sm py-2 border border-dashed border-slate-300 rounded-lg text-slate-600 hover:bg-white hover:border-emerald-500 hover:text-emerald-600"
                            >
                              + Add Dish to {cat.category}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {files.length === 0 ? (
                  <div className="text-slate-400">No files added yet.</div>
                ) : (
                  <ul className="space-y-3">
                    {files.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center gap-4 bg-slate-50 rounded-lg p-3 border border-slate-100"
                      >
                        {f.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.preview} alt={f.file.name} className="w-28 h-20 object-cover rounded-md border" />
                        ) : (
                          <div className="w-28 h-20 flex items-center justify-center rounded-md border bg-white text-slate-500">
                            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
                            </svg>
                          </div>
                        )}

                        <div className="flex-1">
                          <div className="font-medium text-slate-700">{f.file.name}</div>
                          <div className="text-xs text-slate-400">
                            {(f.file.size / 1024 / 1024).toFixed(2)} MB • {f.file.type || "unknown"}
                          </div>
                        </div>

                        <button
                          onClick={() => removeFile(f.id)}
                          className="px-3 py-1 rounded-md bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Restaurant photos & videos */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-bold text-slate-800 mb-6">Upload restaurant photos & videos</h2>

              <p className="text-sm text-slate-500 mb-6">
                Add images (max 10) and short videos (max 3) for each section. Click + to add more.
              </p>

              <div className="space-y-8">
                {sections.map(({ title, photosKey, videosKey }) => (
                  <div key={title}>
                    <h3 className="text-lg font-semibold mb-3">{title}</h3>

                    {/* Photos */}
                    <div className="mb-4">
                      <div className="text-sm font-medium text-slate-600 mb-2">
                        Photos <span className="text-slate-400">(up to {PHOTO_LIMIT})</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {media[photosKey].map((m) => (
                          <div key={m.id} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.preview}
                              alt=""
                              className="w-24 h-24 object-cover rounded-md border"
                            />
                            <button
                              onClick={() => removeMedia(photosKey, m.id)}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border shadow text-red-600"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}

                        {media[photosKey].length < PHOTO_LIMIT && (
                          <button
                            onClick={() => addMedia(photosKey, "image/*", PHOTO_LIMIT)}
                            className="w-24 h-24 rounded-md border border-dashed flex items-center justify-center text-sky-600 hover:bg-sky-50"
                            title="Add photo"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Videos */}
                    <div>
                      <div className="text-sm font-medium text-slate-600 mb-2">
                        Videos <span className="text-slate-400">(up to {VIDEO_LIMIT})</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {media[videosKey].map((m) => (
                          <div key={m.id} className="relative">
                            <video
                              src={m.preview}
                              className="w-28 h-28 rounded-md border object-cover"
                              controls
                            />
                            <button
                              onClick={() => removeMedia(videosKey, m.id)}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border shadow text-red-600"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}

                        {media[videosKey].length < VIDEO_LIMIT && (
                          <button
                            onClick={() => addMedia(videosKey, "video/*", VIDEO_LIMIT)}
                            className="w-28 h-28 rounded-md border border-dashed flex items-center justify-center text-sky-600 hover:bg-sky-50"
                            title="Add video"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom actions - only show after successful parsing */}
            {parsedCategories.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleSaveAndContinue}
                  disabled={saving}
                  className="px-6 py-3 bg-[#f97316] text-white rounded-xl shadow hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save & Continue →"}
                </button>
              </div>
            )}

            {error && <div className="text-sm text-red-600">{error}</div>}
      </OnboardShell>

      {/* Delete Category Confirmation Modal */}
      {showDeleteCategoryModal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Remove Category?</h3>
            </div>
            <p className="text-slate-600 mb-6">Are you sure you want to remove this entire category? All items in it will be deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteCategoryModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveCategory}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Modal */}
      {showValidationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Complete This Step</h3>
            </div>
            <p className="text-slate-600 mb-6">Please complete Menu Info before continuing to Cuisine & Time slots.</p>
            <button
              onClick={() => setShowValidationModal(false)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#f97316] text-white font-medium hover:opacity-90 transition"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
