(function initialisePartnerUserInvites() {
  "use strict";

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const functionUrl = "https://biwwfxfpcsanszxrxhyw.supabase.co/functions/v1/invite-partner-user";
  const publishableKey = "sb_publishable_sB3GSSdJi477vhQAmjABnw_DT4sknEb";

  async function sendInvitation(values) {
    const { data: { session }, error: sessionError } = await window.LBPSupabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error("Your Management session has expired. Please sign in again.");
    const response = await fetch(functionUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) throw new Error(body?.error || `Invitation service returned HTTP ${response.status}.`);
    return body;
  }

  function openInviteDialog() {
    const modal = document.querySelector("#modal");
    const desks = window.LBPPartnerDeskStore?.getPartners?.() || [];
    if (!modal || !desks.length) return alert("Partner Desk data is still loading. Please try again.");

    modal.hidden = false;
    modal.innerHTML = `<article class="dialog partner-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="partner-invite-title">
      <header class="dialog-head"><div><h2 id="partner-invite-title">Invite Partner Desk User</h2><p>The recipient receives the branded Supabase “Invite user” email to set a password and activate access.</p></div><button class="close" type="button" aria-label="Close">×</button></header>
      <form id="partner-user-invite-form" class="partner-invite-form">
        <label>Company name<input name="companyName" required maxlength="160" autocomplete="organization"></label>
        <label>Contact name<input name="contactName" required maxlength="160" autocomplete="name"></label>
        <label>Company email<input name="email" required type="email" maxlength="254" autocomplete="email" placeholder="name@company.com"></label>
        <label>Position / role<input name="positionTitle" required maxlength="160" autocomplete="organization-title"></label>
        <label>Phone number <span>Optional</span><input name="phone" maxlength="40" autocomplete="tel"></label>
        <label>Partner Desk<select name="partnerId" required><option value="">Select Partner Desk</option>${desks.map((desk) => `<option value="${escapeHtml(desk.id)}">${escapeHtml(desk.name)}</option>`).join("")}</select></label>
        <p class="partner-invite-notice">The user is approved for the selected Partner Desk by this Management invitation. The Partner Desk cannot be changed after invitation without a Management review.</p>
        <p id="partner-user-invite-status" class="partner-invite-status" role="status"></p>
        <footer class="dialog-footer"><button class="button ghost" type="button" data-close-invite>Cancel</button><button class="button" type="submit">Send Invite</button></footer>
      </form>
    </article>`;

    const close = () => { modal.hidden = true; modal.innerHTML = ""; };
    modal.querySelector(".close").onclick = close;
    modal.querySelector("[data-close-invite]").onclick = close;
    modal.onclick = (event) => { if (event.target === modal) close(); };
    modal.querySelector("#partner-user-invite-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form).entries());
      const status = modal.querySelector("#partner-user-invite-status");
      const submit = form.querySelector('button[type="submit"]');
      if (!emailPattern.test(String(values.email || "").trim())) {
        status.textContent = "Enter a valid company email address.";
        status.className = "partner-invite-status error";
        return;
      }
      submit.disabled = true;
      status.textContent = "Creating the user and sending the invitation…";
      status.className = "partner-invite-status";
      try {
        const data = await sendInvitation(values);
        if (!data?.success) throw new Error(data?.error || "The invitation could not be sent.");
        status.textContent = `Invitation sent to ${data.email}. The account is approved for ${data.partnerName}.`;
        status.className = "partner-invite-status success";
        setTimeout(close, 2200);
      } catch (error) {
        status.textContent = error?.message || "The invitation could not be sent. Check the email and try again.";
        status.className = "partner-invite-status error";
        submit.disabled = false;
      }
    });
  }

  function addButton() {
    const tabs = document.querySelector(".partner-dashboard-tabs");
    if (!tabs || tabs.querySelector("#invite-partner-user")) return;
    const button = document.createElement("button");
    button.id = "invite-partner-user";
    button.type = "button";
    button.className = "partner-dashboard-invite";
    button.innerHTML = '<i class="fi fi-rr-user-add" aria-hidden="true"></i> Invite Partner User';
    button.onclick = openInviteDialog;
    tabs.appendChild(button);
  }

  new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
  window.LBPPartnerUserInvite = { open: openInviteDialog };
  addButton();
})();
