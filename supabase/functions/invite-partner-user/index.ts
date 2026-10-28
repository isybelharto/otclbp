import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://management.ptlbp.co.id",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:4180",
  "http://127.0.0.1:4181",
]);

const json = (body: unknown, status = 200, origin = "") => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://management.ptlbp.co.id",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  // A 204 preflight response must not include a body. Returning one causes the
  // browser to reject CORS before it can send the authenticated POST request.
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), { status, headers });
};

const clean = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  try {
    if (request.method === "OPTIONS") return json({}, 204, origin);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    if (origin && !allowedOrigins.has(origin)) return json({ error: "Untrusted origin" }, 403, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!url || !anonKey || !serviceRoleKey || !authorization.startsWith("Bearer ")) {
    return json({ error: "Service configuration or session is unavailable" }, 401, origin);
  }

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: "Your Management session has expired" }, 401, origin);

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "management" || !profile.is_active) {
    return json({ error: "Only active Management users can invite Partner Desk users" }, 403, origin);
  }

  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return json({ error: "Invalid invitation data" }, 400, origin); }
  const email = clean(payload.email, 254).toLowerCase();
  const companyName = clean(payload.companyName);
  const contactName = clean(payload.contactName);
  const positionTitle = clean(payload.positionTitle);
  const phone = clean(payload.phone, 40);
  const partnerId = clean(payload.partnerId, 80);
  if (!emailPattern.test(email) || !companyName || !contactName || !positionTitle || !partnerId) {
    return json({ error: "Company, contact name, position, Partner Desk, and a valid company email are required" }, 400, origin);
  }

  const { data: desk, error: deskError } = await admin
    .from("partner_desks")
    .select("id,display_name")
    .eq("id", partnerId)
    .maybeSingle();
  if (deskError || !desk) return json({ error: "The selected Partner Desk does not exist" }, 400, origin);

  const redirectTo = "https://management.ptlbp.co.id/partner-desk/recovery.html";
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      registration_type: "partner",
      company_name: companyName,
      contact_name: contactName,
      position_title: positionTitle,
      phone,
      requested_partner_id: partnerId,
      invited_by_management: true,
    },
  });
  if (inviteError || !invite.user) return json({ error: inviteError?.message || "The invitation could not be created" }, 400, origin);

  const userId = invite.user.id;
  const { error: profileUpdateError } = await admin.from("profiles")
    .update({ role: "partner", is_active: true, partner_id: partnerId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (profileUpdateError) return json({ error: "Invitation was sent, but the Partner Desk profile could not be activated" }, 500, origin);

  const { error: requestUpdateError } = await admin.from("partner_access_requests")
    .update({ status: "approved", assigned_partner_id: partnerId, review_note: "Invited and approved by Management", reviewed_by: callerData.user.id, reviewed_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (requestUpdateError) return json({ error: "Invitation was sent, but its access record could not be finalised" }, 500, origin);

  await admin.from("audit_events").insert({
    actor_id: callerData.user.id,
    actor_role: "management",
    action: "INVITE_PARTNER_USER",
    entity_type: "partner_access_request",
    entity_id: userId,
    old_value: {},
    new_value: { email, partner_id: partnerId, partner_name: desk.display_name },
  });

    return json({ success: true, email, partnerId, partnerName: desk.display_name }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected invitation service error";
    console.error("invite-partner-user failed", error);
    return json({ error: message }, 500, origin);
  }
});
