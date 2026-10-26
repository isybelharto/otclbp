(function initialiseLbpSupabase() {
  "use strict";

  const url = "https://biwwfxfpcsanszxrxhyw.supabase.co";
  const publishableKey = "sb_publishable_sB3GSSdJi477vhQAmjABnw_DT4sknEb";

  if (!window.supabase || !url || !publishableKey) {
    throw new Error("Supabase client could not be initialised.");
  }

  // The publishable key is intended for browser use. Database access remains
  // protected by Supabase Row Level Security; never add a service-role key here.
  window.LBPSupabase = window.supabase.createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
})();
