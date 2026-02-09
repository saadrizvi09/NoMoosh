/**
 * Shared Supabase browser client.
 *
 * Reads the public env vars injected by Next.js at build time:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns a lazily-initialised Supabase browser client.
 * Avoids crashing at build / SSG time when env vars are not yet available.
 */
function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[Nomoosh] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. " +
        "Auth features will not work. See frontend/.env.local.example"
    );
    // Return a throw-on-use proxy so the build doesn't crash during SSG,
    // but any real runtime call without env vars will surface an error.
    return new Proxy({} as SupabaseClient, {
      get(_, prop) {
        if (prop === "auth")
          return new Proxy(
            {},
            {
              get() {
                return () =>
                  Promise.resolve({
                    data: null,
                    error: new Error("Supabase is not configured"),
                  });
              },
            }
          );
        return undefined;
      },
    });
  }

  _client = createClient(supabaseUrl, supabaseAnonKey);
  return _client;
}

/** Lazy Supabase client – safe to import at module scope even during SSG. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getSupabase();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
