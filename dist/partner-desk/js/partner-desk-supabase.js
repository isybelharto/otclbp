(function initialisePartnerDeskSupabase() {
  "use strict";

  const url = "https://biwwfxfpcsanszxrxhyw.supabase.co";
  const publishableKey = "sb_publishable_sB3GSSdJi477vhQAmjABnw_DT4sknEb";
  const client = window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value);

  async function sessionProfile() {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return null;
    const { data: profile, error: profileError } = await client.from("profiles").select("full_name,role,is_active,partner_id").eq("id", session.user.id).maybeSingle();
    if (profileError || !profile || !profile.is_active || !["management", "partner"].includes(profile.role)) return null;
    return { session, profile };
  }

  async function loadPartnerDesk(partnerId) {
    const results = await Promise.all([
      client.from("partner_desks").select("*").eq("id", partnerId).maybeSingle(),
      client.from("partner_desk_quotes").select("*").eq("partner_id", partnerId).order("quoted_at", { ascending: false }),
      client.from("partner_desk_bank_accounts").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
      client.from("partner_desk_wallets").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
      client.from("partner_desk_fiat_settlements").select("*").eq("partner_id", partnerId).order("settled_at", { ascending: false }),
      client.from("partner_desk_crypto_settlements").select("*").eq("partner_id", partnerId).order("settled_at", { ascending: false }),
    ]);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) throw firstError;
    const [{ data: desk }, { data: quotes }, { data: accounts }, { data: wallets }, { data: fiat }, { data: crypto }] = results;
    return { desk, quotes: quotes || [], accounts: accounts || [], wallets: wallets || [], fiat: fiat || [], crypto: crypto || [] };
  }

  async function listPartnerDesks() {
    const { data, error } = await client.from("partner_desks").select("*").order("display_name");
    if (error) throw error;
    return data || [];
  }

  async function saveQuote(partnerId, values, userId) {
    const payload = { partner_id: partnerId, submitted_by: userId, quoted_at: new Date().toISOString(), ...values };
    const { error } = await client.from("partner_desk_quotes").insert(payload);
    if (error) throw error;
    const { error: auditError } = await client.from("partner_desk_audit_events").insert({ partner_id: partnerId, actor_id: userId, action: "SUBMIT_QUOTE", new_value: payload });
    if (auditError) console.warn("Partner quote saved, but the audit event was not recorded.", auditError);
  }

  window.LBPPartnerDeskSupabase = { client, sessionProfile, listPartnerDesks, loadPartnerDesk, saveQuote, text };
})();
