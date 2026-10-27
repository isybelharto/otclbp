(function initialisePartnerDeskSupabase() {
  "use strict";

  const url = "https://biwwfxfpcsanszxrxhyw.supabase.co";
  const publishableKey = "sb_publishable_sB3GSSdJi477vhQAmjABnw_DT4sknEb";
  const productionPartnerUrl = "https://management.ptlbp.co.id/partner-desk/";
  const client = window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value);
  const authRedirect = (path) => new URL(path, productionPartnerUrl).href;

  async function sessionProfile() {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return null;
    const { data: profile, error: profileError } = await client.from("profiles").select("full_name,role,is_active,partner_id").eq("id", session.user.id).maybeSingle();
    if (profileError || !profile || !profile.is_active || !["management", "partner"].includes(profile.role)) return null;
    return { session, profile };
  }

  async function accessRequestStatus(userId) {
    const { data, error } = await client
      .from("partner_access_requests")
      .select("id,corporate_email,company_name,requested_partner_id,assigned_partner_id,status,review_note,created_at,reviewed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  function corporateEmailError(email) {
    const value = String(email || "").trim().toLowerCase();
    const domain = value.split("@")[1] || "";
    const blocked = new Set(["gmail.com","googlemail.com","yahoo.com","yahoo.co.id","outlook.com","hotmail.com","live.com","icloud.com","me.com","aol.com","mail.com","gmx.com","gmx.net","proton.me","protonmail.com","zoho.com","yandex.com","yandex.ru"]);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid company email address.";
    if (blocked.has(domain)) return "Personal email providers are not accepted. Use your company email.";
    return "";
  }

  function passwordErrors(password, confirmation = password) {
    const value = String(password || "");
    const errors = [];
    if (value.length < 8) errors.push("Use at least 8 characters.");
    if (!/[A-Z]/.test(value)) errors.push("Include at least one capital letter.");
    if (!/[^A-Za-z0-9]/.test(value)) errors.push("Include at least one special character.");
    if (/(.)\1\1/i.test(value)) errors.push("Do not repeat the same character 3 times in a row.");
    if (value !== String(confirmation || "")) errors.push("Both password fields must match.");
    return errors;
  }

  async function registerPartner(values) {
    const emailError = corporateEmailError(values.email);
    if (emailError) throw new Error(emailError);
    const errors = passwordErrors(values.password, values.passwordConfirmation);
    if (errors.length) throw new Error(errors[0]);
    const emailRedirectTo = authRedirect("login.html?verified=1");
    const { data, error } = await client.auth.signUp({
      email: String(values.email).trim().toLowerCase(),
      password: values.password,
      options: {
        emailRedirectTo,
        data: {
          registration_type: "partner",
          company_name: String(values.companyName).trim(),
          contact_name: String(values.contactName).trim(),
          position_title: String(values.positionTitle).trim(),
          phone: String(values.phone || "").trim(),
          requested_partner_id: values.partnerId,
        },
      },
    });
    if (error) throw error;
    if (data.session) await client.auth.signOut();
    return { ...data, email: String(values.email).trim().toLowerCase() };
  }

  async function verifyPartnerEmailOtp(email, token) {
    const normalisedEmail = String(email || "").trim().toLowerCase();
    const normalisedToken = String(token || "").replace(/\D/g, "");
    const emailError = corporateEmailError(normalisedEmail);
    if (emailError) throw new Error(emailError);
    if (!/^\d{6}$/.test(normalisedToken)) throw new Error("Enter the complete 6-digit verification code.");
    const { data, error } = await client.auth.verifyOtp({
      email: normalisedEmail,
      token: normalisedToken,
      type: "email",
    });
    if (error) throw error;
    if (data.session) await client.auth.signOut();
    return data;
  }

  async function resendPartnerEmailOtp(email) {
    const normalisedEmail = String(email || "").trim().toLowerCase();
    const emailError = corporateEmailError(normalisedEmail);
    if (emailError) throw new Error(emailError);
    const { error } = await client.auth.resend({
      type: "signup",
      email: normalisedEmail,
    });
    if (error) throw error;
  }

  async function requestPasswordReset(email) {
    const emailError = corporateEmailError(email);
    if (emailError) throw new Error(emailError);
    const redirectTo = authRedirect("reset-password.html");
    const { error } = await client.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(password, confirmation) {
    const errors = passwordErrors(password, confirmation);
    if (errors.length) throw new Error(errors[0]);
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
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

  window.LBPPartnerDeskSupabase = { client, sessionProfile, accessRequestStatus, corporateEmailError, passwordErrors, registerPartner, verifyPartnerEmailOtp, resendPartnerEmailOtp, requestPasswordReset, updatePassword, listPartnerDesks, loadPartnerDesk, saveQuote, text };
})();
