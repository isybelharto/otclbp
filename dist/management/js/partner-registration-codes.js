(function () {
  "use strict";

  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  async function getRegistrationCodes() {
    const { data, error } = await window.LBPSupabase
      .from("partner_registration_codes")
      .select("partner_id,registration_code,is_active,updated_at")
      .order("partner_id");
    if (error) throw error;
    return data || [];
  }

  function codeRows(data) {
    const desks = new Map((window.LBPPartnerDeskStore?.getPartners() || []).map((desk) => [desk.id, desk.name]));
    return (data || []).map((row) => `<tr><td><strong>${safe(desks.get(row.partner_id) || row.partner_id)}</strong></td><td class="mono">${safe(row.registration_code)}</td><td>${row.is_active ? '<span class="pill active">Active</span>' : '<span class="pill hold">Inactive</span>'}</td><td>${row.updated_at ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(row.updated_at)) : '—'}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No registration codes are available.</td></tr>';
  }

  async function openRegistrationCodeWindow() {
    const modal = document.querySelector("#modal");
    if (!modal) return;
    modal.hidden = false;
    modal.innerHTML = `<div class="dialog partner-registration-code-dialog" role="dialog" aria-modal="true" aria-labelledby="partner-registration-code-title"><div class="dialog-head"><div><h2 id="partner-registration-code-title">Partner Invitation Codes</h2><p>Loading protected codes…</p></div><button class="close" type="button" aria-label="Close">×</button></div><div class="partner-registration-code-content">Loading…</div></div>`;
    const close = () => { modal.hidden = true; modal.innerHTML = ""; };
    modal.querySelector(".close").onclick = close;
    modal.onclick = (event) => { if (event.target === modal) close(); };
    try {
      const data = await getRegistrationCodes();
      modal.querySelector(".partner-registration-code-content").innerHTML = `<p class="partner-registration-code-note">Share a code only through an authorised LBP channel, such as WhatsApp. Invitation codes are never displayed on the public registration page.</p><div class="table-wrap"><table><thead><tr><th>Exchange</th><th>6-Digit Code</th><th>Status</th><th>Last Updated</th></tr></thead><tbody>${codeRows(data)}</tbody></table></div>`;
      modal.querySelector(".dialog-head p").textContent = `${data.length} protected exchange invitation codes`;
    } catch (error) {
      console.error("Partner registration codes could not be loaded.", error);
      modal.querySelector(".partner-registration-code-content").innerHTML = '<p class="partner-registration-code-error">Codes could not be loaded. Confirm that you are signed in with a Management account and try again.</p>';
    }
  }

  window.LBPPartnerRegistrationCodes = { open: openRegistrationCodeWindow };
})();
