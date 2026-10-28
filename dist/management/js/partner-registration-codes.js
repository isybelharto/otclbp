(function () {
  "use strict";

  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  async function showRegistrationCodes() {
    const panel = document.querySelector("#partner-dashboard-panel");
    if (!panel || panel.querySelector("#partner-registration-codes")) return;
    try {
      const { data, error } = await window.LBPSupabase.from("partner_registration_codes").select("partner_id,registration_code,is_active,updated_at").order("partner_id");
      if (error) throw error;
      const desks = new Map((window.LBPPartnerDeskStore?.getPartners() || []).map((desk) => [desk.id, desk.name]));
      const rows = (data || []).map((row) => `<tr><td><strong>${safe(desks.get(row.partner_id) || row.partner_id)}</strong></td><td class="mono">${safe(row.registration_code)}</td><td>${row.is_active ? '<span class="pill active">Active</span>' : '<span class="pill hold">Inactive</span>'}</td><td>${row.updated_at ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(row.updated_at)) : '—'}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">No registration codes are available.</td></tr>';
      panel.insertAdjacentHTML("beforeend", `<section id="partner-registration-codes" class="card partner-registration-codes"><header><div><h2>Partner Registration Codes</h2><p>Share the appropriate six-digit code privately through an authorised LBP channel such as WhatsApp. Codes are not shown on the registration page.</p></div></header><div class="table-wrap"><table><thead><tr><th>Exchange</th><th>6-Digit Code</th><th>Status</th><th>Last Updated</th></tr></thead><tbody>${rows}</tbody></table></div></section>`);
    } catch (error) {
      console.error("Partner registration codes could not be loaded.", error);
    }
  }

  document.querySelectorAll(".nav[data-view='desks']").forEach((nav) => nav.addEventListener("click", () => setTimeout(showRegistrationCodes, 0)));
})();
