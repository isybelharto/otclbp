import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://management.ptlbp.co.id",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:4180",
  "http://127.0.0.1:4181",
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);

function response(body: unknown, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://management.ptlbp.co.id",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  return status === 204 ? new Response(null, { status, headers }) : new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  try {
    if (request.method === "OPTIONS") return response({}, 204, origin);
    if (request.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);
    if (origin && !allowedOrigins.has(origin)) return response({ error: "Untrusted origin" }, 403, origin);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization") || "";
    if (!url || !anonKey || !serviceRoleKey || !authorization.startsWith("Bearer ")) {
      return response({ error: "Service configuration or session is unavailable" }, 401, origin);
    }

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return response({ error: "Your Management session has expired" }, 401, origin);

    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("role,is_active").eq("id", callerData.user.id).maybeSingle();
    if (profileError || profile?.role !== "management" || !profile.is_active) {
      return response({ error: "Only active Management users can invite Corporate Clients" }, 403, origin);
    }

    let payload: Record<string, unknown>;
    try { payload = await request.json(); } catch { return response({ error: "Invalid invitation data" }, 400, origin); }
    const email = clean(payload.email, 254).toLowerCase();
    const companyName = clean(payload.companyName);
    const contactName = clean(payload.contactName);
    const positionTitle = clean(payload.positionTitle);
    const phone = clean(payload.phone, 40);
    const tier = clean(payload.tier, 80) || "Corporate";
    if (!emailPattern.test(email) || !companyName || !contactName || !positionTitle || !["Corporate", "Institutional Fund", "Financial Institution"].includes(tier)) {
      return response({ error: "Company, contact name, position, tier, and a valid company email are required" }, 400, origin);
    }

    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://management.ptlbp.co.id/corporate-client/recovery.html",
      data: {
        registration_type: "corporate_client",
        company_name: companyName,
        contact_name: contactName,
        position_title: positionTitle,
        phone,
        tier,
        invited_by_management: true,
      },
    });
    if (inviteError || !invite.user) return response({ error: inviteError?.message || "The invitation could not be created" }, 400, origin);

    const { data: corporateProfile, error: corporateProfileError } = await admin.from("profiles")
      .select("client_id")
      .eq("id", invite.user.id)
      .maybeSingle();
    if (corporateProfileError || !corporateProfile?.client_id) {
      return response({ error: "Invitation was sent, but the Corporate Client onboarding record could not be created" }, 500, origin);
    }

    await admin.from("audit_events").insert({
      actor_id: callerData.user.id,
      actor_role: "management",
      action: "INVITE_CORPORATE_CLIENT",
      entity_type: "corporate_client",
      entity_id: corporateProfile.client_id,
      old_value: {},
      new_value: { email, company_name: companyName, tier, status: "kyb_pending" },
    });

    return response({ success: true, email, companyName, tier, clientId: corporateProfile.client_id }, 200, origin);
  } catch (error) {
    console.error("invite-corporate-client failed", error);
    return response({ error: error instanceof Error ? error.message : "Unexpected invitation service error" }, 500, origin);
  }
});
