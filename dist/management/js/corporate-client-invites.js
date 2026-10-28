(function initialiseCorporateClientInvites() {
  "use strict";

  const functionUrl = "https://biwwfxfpcsanszxrxhyw.supabase.co/functions/v1/invite-corporate-client";
  const publishableKey = "sb_publishable_sB3GSSdJi477vhQAmjABnw_DT4sknEb";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function sendInvitation(values) {
    const { data: { session }, error: sessionError } = await window.LBPSupabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error("Your Management session has expired. Please sign in again.");
    const result = await fetch(functionUrl, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const contentType = result.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await result.json() : {};
    if (!result.ok) throw new Error(body?.error || `Invitation service returned HTTP ${result.status}.`);
    return body;
  }

  function closeDialog() {
    const modal = document.querySelector("#modal");
    if (modal) { modal.hidden = true; modal.innerHTML = ""; }
  }

  function openInviteDialog() {
    const modal = document.querySelector("#modal");
    if (!modal) return;
    modal.hidden = false;
    modal.innerHTML = `<article class="dialog partner-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="corporate-invite-title">
      <header class="dialog-head"><div><h2 id="corporate-invite-title">Invite Corporate Client</h2><p>The recipient receives the branded Supabase “Invite user” email. Their Corporate Client account remains pending until KYB is completed and approved by Management.</p></div><button class="close" type="button" aria-label="Close">×</button></header>
      <form id="corporate-client-invite-form" class="partner-invite-form">
        <label>Company name<input name="companyName" required maxlength="160" autocomplete="organization" placeholder="PT Example Indonesia"></label>
        <label>Contact name<input name="contactName" required maxlength="160" autocomplete="name"></label>
        <label>Company email<input name="email" required type="email" maxlength="254" autocomplete="email" placeholder="name@company.com"></label>
        <label>Position / role<input name="positionTitle" required maxlength="160" autocomplete="organization-title"></label>
        <label>Phone number <span>Optional</span><input name="phone" maxlength="40" autocomplete="tel"></label>
        <label>Client type<select name="tier" required><option value="Corporate">Corporate</option><option value="Institutional Fund">Institutional Fund</option><option value="Financial Institution">Financial Institution</option></select></label>
        <p class="partner-invite-notice">An invitation creates a pending Corporate Client onboarding record. The account may complete KYB after setting its password, but cannot request OTC settlement until Management approves KYB.</p>
        <p id="corporate-client-invite-status" class="partner-invite-status" role="status"></p>
        <footer class="dialog-footer"><button class="button ghost" type="button" data-close-invite>Cancel</button><button class="button" type="submit">Send Invite</button></footer>
      </form>
    </article>`;
    modal.querySelector(".close").onclick = closeDialog;
    modal.querySelector("[data-close-invite]").onclick = closeDialog;
    modal.onclick = (event) => { if (event.target === modal) closeDialog(); };
    modal.querySelector("#corporate-client-invite-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const status = modal.querySelector("#corporate-client-invite-status");
      const submit = form.querySelector('button[type="submit"]');
      if (!emailPattern.test(String(values.email || "").trim())) {
        status.textContent = "Enter a valid company email address.";
        status.className = "partner-invite-status error";
        return;
      }
      submit.disabled = true;
      status.textContent = "Creating the Corporate Client account and sending the invitation…";
      status.className = "partner-invite-status";
      try {
        const data = await sendInvitation(values);
        if (!data?.success) throw new Error(data?.error || "The invitation could not be sent.");
        status.textContent = `Invitation sent to ${data.email}. ${data.companyName} is now pending KYB completion and Management approval.`;
        status.className = "partner-invite-status success";
        setTimeout(() => {
          closeDialog();
          document.querySelector("#refresh-corporate-requests")?.click();
        }, 2400);
      } catch (error) {
        status.textContent = error?.message || "The invitation could not be sent. Check the details and try again.";
        status.className = "partner-invite-status error";
        submit.disabled = false;
      }
    });
  }

  function addButton() {
    const host = document.querySelector(".corporate-finance-directory header, .corporate-request-card header");
    if (!host || document.querySelector("#invite-corporate-client")) return;
    const actions = host.querySelector(".access-header-actions") || host.querySelector("a.button")?.parentElement || host;
    const button = document.createElement("button");
    button.id = "invite-corporate-client";
    button.type = "button";
    button.className = "button";
    button.innerHTML = '<i class="fi fi-rr-user-add" aria-hidden="true"></i> Invite Corporate Client';
    button.onclick = openInviteDialog;
    actions.insertBefore(button, actions.firstChild);
  }

  new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
  window.LBPCorporateClientInvite = { open: openInviteDialog };
  addButton();
})();
