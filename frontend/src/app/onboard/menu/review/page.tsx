// src/app/onboard/menu/review/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Types */
type Variant = {
  variant_name: string;
  price: number | null;
};

type UIItem = {
  id: string;
  name: string;
  variants: Variant[];
  photo: string | null; // uploaded S3 url
  localFile: File | null; // selected file waiting for upload
  localPreview: string | null; // blob url for preview
  uploadState: "idle" | "selected" | "uploading" | "uploaded" | "error";
  uploadError: string | null;
  editMode: boolean;
  description?: string | null;
};

type UICategory = {
  category: string;
  items: UIItem[];
};

type ParsedMenuRaw = {
  menu?: {
    restaurant_name?: string;
    categories?: Array<{
      category: string;
      items?: Array<{
        id?: string;
        name: string;
        variants?: Variant[];
        photo?: string | null;
        description?: string | null;
      }>;
    }>;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
// change only if your backend expects a different path:
const REGISTER_MENU_PATH = "/register-restaurant_pg2";
const UPLOAD_IMAGE_PATH = "/upload-image"; // should match your image upload endpoint

/** helper id generator */
function makeId(prefix = "it-") {
  try {
    // modern browsers
    // @ts-ignore
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      // @ts-ignore
      return (crypto as any).randomUUID();
    }
  } catch {}
  return prefix + Math.random().toString(36).slice(2, 9);
}

export default function ReviewParsedMenuPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<UICategory[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const previewsRef = useRef<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploadingAny, setUploadingAny] = useState(false);

  // ---- ADDED: completion flags for gating Cuisine navigation ----
  const [detailsCompleted, setDetailsCompleted] = useState(false);
  const [menuCompleted, setMenuCompleted] = useState(false);
  useEffect(() => {
    try {
      setDetailsCompleted(localStorage.getItem("detailsCompleted") === "true");
    } catch {}
    try {
      setMenuCompleted(localStorage.getItem("menuCompleted") === "true");
    } catch {}
  }, []);
  const goCuisineIfAllowed = () => {
    const detailsOk = localStorage.getItem("detailsCompleted") === "true" || detailsCompleted;
    const menuOk = localStorage.getItem("menuCompleted") === "true" || menuCompleted;
    if (detailsOk && menuOk) {
      router.push("/onboard/cuisine");
    } else {
      alert("Please complete Menu Info before continuing to Cuisine & Time slots.");
    }
  };
  // ----------------------------------------------------------------

  // Load parsedMenuItems from localStorage and normalize — assign id if missing
  useEffect(() => {
    try {
      const raw = localStorage.getItem("parsedMenuItems");
      if (!raw) {
        setCategories([]);
        return;
      }
      const parsed: ParsedMenuRaw = JSON.parse(raw);

      const normalized: UICategory[] =
        (parsed.menu?.categories || []).map((cat) => ({
          category: cat.category,
          items: (cat.items || []).map((it) => {
            const assignedId = it.id ?? makeId();
            return {
              id: assignedId,
              name: it.name,
              variants: it.variants || [],
              photo: it.photo ?? null,
              localFile: null,
              localPreview: null,
              uploadState: it.photo ? "uploaded" : "idle",
              uploadError: null,
              editMode: false,
              description: (it as any).description ?? null,
            } as UIItem;
          }),
        })) || [];

      setCategories(normalized);
    } catch (err) {
      console.error("Failed to load parsed menu", err);
      setGlobalError("Failed to load parsed menu from localStorage.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // revoke previews on unmount
  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      previewsRef.current.clear();
    };
  }, []);

  // persist UI data (including ids and uploaded photo urls) to localStorage for mid-flow recovery
  useEffect(() => {
    try {
      if (!categories) return;
      const out = {
        menu: {
          restaurant_name: localStorage.getItem("nomoosh_restaurant_name") ?? "unknown",
          categories: categories.map((c) => ({
            category: c.category,
            items: c.items.map((it) => ({
              id: it.id,
              name: it.name,
              variants: it.variants,
              photo: it.photo ?? null,
              description: it.description ?? null,
            })),
          })),
        },
      };
      localStorage.setItem("parsedMenuItems", JSON.stringify(out));
    } catch (err) {
      console.error("Persist to localStorage failed", err);
    }
  }, [categories]);

  /* -----------------------
     Helpers to update by item id (keeps mapping stable)
     ----------------------- */
  function updateItemById(itemId: string, updater: (it: UIItem) => UIItem) {
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((it) => (it.id === itemId ? updater(it) : it)),
      }))
    );
  }

  // toggle edit mode
  function toggleEditMode(itemId: string) {
    updateItemById(itemId, (it) => ({ ...it, editMode: !it.editMode }));
  }

  function updateItemName(itemId: string, newName: string) {
    updateItemById(itemId, (it) => ({ ...it, name: newName }));
  }

  function updateVariantLabel(itemId: string, idx: number, newLabel: string) {
    updateItemById(itemId, (it) => ({
      ...it,
      variants: it.variants.map((v, vi) => (vi === idx ? { ...v, variant_name: newLabel } : v)),
    }));
  }

  function updateVariantPrice(itemId: string, idx: number, newPriceStr: string) {
    let value: number | null = null;
    if (newPriceStr !== null && newPriceStr !== undefined && String(newPriceStr).trim() !== "") {
      // remove commas and currency symbols
      const cleaned = String(newPriceStr).replace(/[^\d.]/g, "");
      const n = Number(cleaned);
      value = Number.isFinite(n) ? n : null;
    }
    updateItemById(itemId, (it) => ({
      ...it,
      variants: it.variants.map((v, vi) => (vi === idx ? { ...v, price: value } : v)),
    }));
  }

  function updateItemDescription(itemId: string, newDesc: string) {
    updateItemById(itemId, (it) => ({ ...it, description: newDesc }));
  }

  /* -----------------------
     Add / Remove dishes and categories
     ----------------------- */
  function removeDish(catIdx: number, itemId: string) {
    setCategories((prev) =>
      prev.map((cat, ci) => {
        if (ci !== catIdx) return cat;
        return { ...cat, items: cat.items.filter((it) => it.id !== itemId) };
      }).filter((cat) => cat.items.length > 0) // remove empty categories
    );
  }

  function addDish(catIdx: number) {
    setCategories((prev) =>
      prev.map((cat, ci) => {
        if (ci !== catIdx) return cat;
        return {
          ...cat,
          items: [
            ...cat.items,
            {
              id: makeId(),
              name: "",
              variants: [{ variant_name: "Regular", price: null }],
              photo: null,
              localFile: null,
              localPreview: null,
              uploadState: "idle" as const,
              uploadError: null,
              editMode: true,
              description: "",
            },
          ],
        };
      })
    );
  }

  function addCategory() {
    setCategories((prev) => [
      ...prev,
      {
        category: "New Category",
        items: [
          {
            id: makeId(),
            name: "",
            variants: [{ variant_name: "Regular", price: null }],
            photo: null,
            localFile: null,
            localPreview: null,
            uploadState: "idle" as const,
            uploadError: null,
            editMode: true,
            description: "",
          },
        ],
      },
    ]);
  }

  function updateCategoryName(catIdx: number, newName: string) {
    setCategories((prev) =>
      prev.map((cat, ci) => (ci === catIdx ? { ...cat, category: newName } : cat))
    );
  }

  function addVariant(itemId: string) {
    updateItemById(itemId, (it) => ({
      ...it,
      variants: [...it.variants, { variant_name: "", price: null }],
    }));
  }

  function removeVariant(itemId: string, idx: number) {
    updateItemById(itemId, (it) => ({
      ...it,
      variants: it.variants.filter((_, vi) => vi !== idx),
    }));
  }

  /* -----------------------
     Photo flow: select -> preview -> upload -> set photo (S3)
     ----------------------- */
  function handleSelectPhotoForItem(itemId: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      if (!file) return;
      const preview = URL.createObjectURL(file);
      previewsRef.current.add(preview);

      updateItemById(itemId, (it) => ({ ...it, localFile: file, localPreview: preview, uploadState: "selected", uploadError: null }));
    };
  }

  // Unselect allowed only while uploadState === 'selected'
  function handleUnselectLocalFile(itemId: string) {
    updateItemById(itemId, (it) => {
      if (it.uploadState !== "selected") return it; // no-op if already uploaded
      if (it.localPreview) {
        try {
          URL.revokeObjectURL(it.localPreview);
          previewsRef.current.delete(it.localPreview);
        } catch {}
      }
      return { ...it, localFile: null, localPreview: null, uploadState: it.photo ? "uploaded" : "idle", uploadError: null };
    });
  }

  async function handleUploadPhotoForItem(itemId: string) {
    setGlobalError(null);
    // get item
    const found = categories.flatMap((c) => c.items).find((it) => it.id === itemId);
    if (!found) {
      setGlobalError("Item not found");
      return;
    }
    if (!found.localFile) {
      updateItemById(itemId, (it) => ({ ...it, uploadError: "No file selected", uploadState: "error" }));
      return;
    }

    if (!API_BASE) {
      setGlobalError("API base not configured (NEXT_PUBLIC_API_BASE).");
      return;
    }

    updateItemById(itemId, (it) => ({ ...it, uploadState: "uploading", uploadError: null }));
    setUploadingAny(true);

    try {
      const fd = new FormData();
      fd.append("file", found.localFile);
      // pass itemId so backend can name file deterministically if desired
      fd.append("itemId", itemId);

      const res = await fetch(`${API_BASE}${UPLOAD_IMAGE_PATH}`, { method: "POST", body: fd });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Upload failed (${res.status})`);
      }
      const body = await res.json().catch(() => null);
      const url = body?.url ?? body?.data?.url ?? null;
      if (!url) {
        console.error("Unexpected upload response:", body);
        throw new Error("Upload did not return url");
      }

      // revoke preview
      if (found.localPreview) {
        try {
          URL.revokeObjectURL(found.localPreview);
          previewsRef.current.delete(found.localPreview);
        } catch {}
      }

      // set photo, clear localFile/localPreview, mark uploaded
      updateItemById(itemId, (it) => ({ ...it, photo: url, localFile: null, localPreview: null, uploadState: "uploaded", uploadError: null }));
    } catch (err: any) {
      console.error("Upload error:", err);
      updateItemById(itemId, (it) => ({ ...it, uploadState: "error", uploadError: err?.message ?? "Upload failed" }));
    } finally {
      // if no items are uploading mark false
      const stillUploading = categories.flatMap((c) => c.items).some((it) => it.uploadState === "uploading");
      setUploadingAny(stillUploading);
    }
  }

  /* -----------------------
     Build clean payload (strip UI-only fields including id)
     ----------------------- */
  function buildCleanPayload() {
    const userIdRaw = localStorage.getItem("nomoosh_userId") ?? localStorage.getItem("user_id") ?? "0";
    const user_id_number = Number(userIdRaw) || 0;

    const restaurant_name = localStorage.getItem("nomoosh_restaurant_name") ?? localStorage.getItem("restaurantName") ?? "string";

    const cleaned = {
      user_id: user_id_number,
      menu: {
        restaurant_name,
        categories: categories.map((c) => ({
          category: c.category,
          items: c.items.map((it) => ({
            name: it.name,
            variants: (it.variants || [])
              .filter((v) => !(v.variant_name === "None" && (v.price === null || v.price === undefined)))
              .map((v) => ({ variant_name: v.variant_name, price: v.price ?? 0 })),
            description: (it.description ?? "").toString().trim(),
            image_link: it.photo ?? "", // backend expects string — send empty if missing
          })),
        })),
      },
    };

    return cleaned;
  }

  async function handleSaveAndContinue() {
    setGlobalError(null);

    // Basic guard: don't proceed if uploading any photo or there are items with 'selected' state
    const items = categories.flatMap((c) => c.items);
    const uploading = items.some((it) => it.uploadState === "uploading");
    const waitingToUpload = items.some((it) => it.uploadState === "selected");
    if (uploading) {
      setGlobalError("Please wait for active uploads to finish before saving.");
      return;
    }
    if (waitingToUpload) {
      setGlobalError("You have selected photos that haven't been uploaded. Either upload them or unselect before saving.");
      return;
    }

    const payload = buildCleanPayload();
    console.log("Menu payload ->", payload);

    try {
      setSaving(true);
      if (!API_BASE) throw new Error("API base not configured (NEXT_PUBLIC_API_BASE).");

      const res = await fetch(`${API_BASE}${REGISTER_MENU_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let txt = "";
        try {
          txt = await res.text();
        } catch {}
        throw new Error(txt || `Save failed (${res.status})`);
      }

      // success -> mark menu complete so documents page can be accessed
      try {
        localStorage.setItem("menuCompleted", "true");
        setMenuCompleted(true); // reflect immediately for Cuisine gating
      } catch (e) {
        /* ignore */
      }

      // clear parsed menu (optional)
      // localStorage.removeItem("parsedMenuItems");

      // go to cuisine step (before documents)
      router.push("/onboard/cuisine");
    } catch (err: any) {
      console.error("Save error:", err);
      setGlobalError(err?.message ?? "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  /* -----------------------
     Render
     ----------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="text-xl font-bold text-sky-600">Nomoosh Partner</div>
          <div className="text-sm text-sky-600">Need help? Call 7091863593</div>
        </div>
      </header>
      <div className="h-18" />

      {/* add bottom padding on mobile so content doesn't go under sticky nav */}
      <main className="max-w-7xl mx-auto px-6 py-8 pb-24 lg:pb-8">
        <div className="grid grid-cols-12 gap-8">
          {/* Sidebar kept as before but hidden on mobile; sticky on desktop */}
          <aside className="hidden lg:block col-span-3">
            <div className="sticky top-8">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-semibold mb-6">Complete your registration</h3>

                <div className="space-y-4">
                  <div className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ring-1 ring-emerald-100 shadow">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center bg-emerald-100 text-emerald-600">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v10a2 2 0 0 1-2 2H3V2h4zm14 0v10a2 2 0 0 1-2 2h-2V2h4zM9 14h6v8H9v-8z"/></svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-emerald-600">Restaurant information</div>
                      <div className="text-xs text-slate-400">Basic details and location</div>
                    </div>
                  </div>

                  <div className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow ring-1 ring-sky-50 bg-sky-50">
                    <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v2H3V4zm0 5h18v2H3V9zm0 5h18v6H3v-6z"/></svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700">Menu and operational details</div>
                      <div className="text-xs text-slate-400">Upload your menu & images</div>
                    </div>
                  </div>

                  {/* ADDED: Cuisine & Time slots step (guarded) */}
                  <button
                    onClick={goCuisineIfAllowed}
                    className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow hover:shadow-sm"
                  >
                    <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l7 4v10l-7 4-7-4V7l7-4z"/></svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700">Cuisine & Time slots</div>
                      <div className="text-xs text-slate-400">Cuisines, open days & timings</div>
                    </div>
                  </button>
                  {/* ------------------------------------------- */}

                  <div className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-shadow hover:shadow-sm">
                    <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16v14H4zM4 21h16v2H4z"/></svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700">Restaurant documents</div>
                      <div className="text-xs text-slate-400">PAN, GST, FSSAI, bank details</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main */}
          <section className="col-span-12 lg:col-span-9">
            <h1 className="text-3xl font-extrabold text-slate-800 mb-6">Review parsed menu</h1>

            {globalError && <div className="mb-4 text-sm text-red-600">{globalError}</div>}
            {categories.length === 0 && <div className="text-slate-500">No parsed menu found.</div>}

            <div className="space-y-10">
              {categories.map((cat, catIdx) => (
                <div key={cat.category ?? `cat-${catIdx}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <input
                      className="text-xl font-bold text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:border-sky-500 outline-none px-1 py-0.5"
                      value={cat.category}
                      onChange={(e) => updateCategoryName(catIdx, e.target.value)}
                      placeholder="Category name"
                    />
                  </div>

                  <div className="space-y-6">
                    {cat.items.map((it, itemIdx) => (
                      <div
                        key={it.id ?? `item-${catIdx}-${itemIdx}`}
                        className="bg-white rounded-md p-4 border border-slate-300 shadow-sm flex gap-6 items-start relative"
                      >
                        <div className="w-28 h-28 bg-slate-100 rounded-md flex-shrink-0 border border-slate-200 relative overflow-visible">
                          {it.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.photo} alt={it.name} className="w-full h-full object-cover rounded-md" />
                          ) : it.localPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.localPreview} alt="preview" className="w-full h-full object-cover rounded-md" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm rounded-md">No photo</div>
                          )}

                          {/* unselect allowed only while selected */}
                          {it.uploadState === "selected" && (
                            <button
                              title="Unselect"
                              onClick={() => handleUnselectLocalFile(it.id)}
                              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-white border shadow flex items-center justify-center"
                            >
                              <span className="text-xs text-red-600">✕</span>
                            </button>
                          )}

                          {/* after upload we intentionally do NOT show a remove control */}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                {it.editMode ? (
                                  <input className="text-lg font-semibold text-slate-800 border-b px-1 py-0.5" value={it.name} onChange={(e) => updateItemName(it.id, e.target.value)} />
                                ) : (
                                  <h3 className="text-lg font-semibold text-slate-800">{it.name}</h3>
                                )}

                                <button onClick={() => toggleEditMode(it.id)} className="text-sm text-slate-500 px-2 py-1 rounded hover:bg-slate-100">
                                  {it.editMode ? "Done" : "Edit"}
                                </button>
                              </div>

                              <div className="mt-2">
                                {it.editMode ? (
                                  <textarea value={it.description ?? ""} onChange={(e) => updateItemDescription(it.id, e.target.value)} className="w-full border rounded p-2 text-sm" />
                                ) : (
                                  <p className="text-sm text-slate-600">{it.description ?? ""}</p>
                                )}
                              </div>

                              <div className="mt-3 space-y-1">
                                {(it.variants || [])
                                  .filter((v) => !(v.variant_name === "None" && v.price === null))
                                  .map((v, vi) => (
                                    <div key={`${it.id}-var-${vi}-${v.variant_name}`} className="flex items-center gap-3">
                                      {it.editMode ? (
                                        <>
                                          <input className="text-sm border px-2 py-1 rounded w-36" value={v.variant_name} onChange={(e) => updateVariantLabel(it.id, vi, e.target.value)} placeholder="Variant" />
                                          <input className="text-sm border px-2 py-1 rounded w-24" value={v.price ?? ""} onChange={(e) => updateVariantPrice(it.id, vi, e.target.value)} placeholder="price" />
                                          {it.variants.length > 1 && (
                                            <button onClick={() => removeVariant(it.id, vi)} className="text-red-500 hover:text-red-700 text-xs" title="Remove variant">✕</button>
                                          )}
                                        </>
                                      ) : (
                                        <p className="text-sm text-slate-600">
                                          {v.variant_name !== "None" ? `${v.variant_name}: ` : "Price: "}
                                          {v.price ?? "-"}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                              </div>

                              {/* Add variant button (in edit mode) */}
                              {it.editMode && (
                                <button
                                  onClick={() => addVariant(it.id)}
                                  className="mt-2 text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1"
                                >
                                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-400 text-[10px]">+</span>
                                  Add variant
                                </button>
                              )}
                            </div>

                            <div className="flex-shrink-0 flex flex-col items-end gap-2">
                              {it.uploadState === "idle" && !it.photo && <button onClick={() => handleSelectPhotoForItem(it.id)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Select photo</button>}

                              {it.uploadState === "selected" && it.localFile && <button onClick={() => handleUploadPhotoForItem(it.id)} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">Upload</button>}

                              {it.uploadState === "uploading" && <button disabled className="px-4 py-2 bg-emerald-300 text-white rounded">Uploading...</button>}

                              {it.uploadState === "uploaded" && <div className="text-emerald-600 text-sm">Uploaded</div>}

                              {it.uploadState === "error" && <div className="text-sm text-red-600">{it.uploadError ?? "Upload failed"}</div>}

                              {/* Remove dish button */}
                              <button
                                onClick={() => removeDish(catIdx, it.id)}
                                className="mt-2 px-3 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
                              >
                                Remove dish
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add dish button */}
                  <button
                    onClick={() => addDish(catIdx)}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-dashed border-sky-400 text-sky-600 rounded-lg hover:bg-sky-50 text-sm"
                  >
                    <span className="text-lg">+</span> Add dish to {cat.category || "this category"}
                  </button>
                </div>
              ))}
            </div>

            {/* Add new category button */}
            <button
              onClick={addCategory}
              className="mt-6 w-full py-3 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl hover:bg-slate-50 hover:border-sky-400 hover:text-sky-600 transition text-sm font-medium"
            >
              + Add new category
            </button>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSaveAndContinue}
                disabled={saving || uploadingAny}
                className={`px-6 py-3 bg-emerald-600 text-white rounded-md shadow hover:bg-emerald-700 ${saving || uploadingAny ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {saving ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Mobile sticky step bar (same pattern as menu page) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-slate-200 lg:hidden">
        {/* ADDED Cuisine tab; grid now 4 cols */}
        <div className="max-w-7xl mx-auto grid grid-cols-4">
          <button
            onClick={() => router.push("/onboard/details")}
            className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
          >
            <span className="h-1 w-8 rounded-full bg-slate-200" />
            Info
          </button>
          <button
            onClick={() => {}}
            className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-sky-600"
          >
            <span className="h-1 w-8 rounded-full bg-sky-600" />
            Menu
          </button>
          <button
            onClick={goCuisineIfAllowed}
            className="px-4 py-3 text-xs font-medium flex flex-col items-center gap-1 text-slate-600"
          >
            <span className="h-1 w-8 rounded-full bg-slate-200" />
            Cuisine
          </button>
          <button
            onClick={() => router.push("/onboard/documents")}
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
