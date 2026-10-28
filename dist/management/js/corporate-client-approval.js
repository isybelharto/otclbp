(function () {
  "use strict";

  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const title = (value) => String(value || "pending").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const date = (value) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
  const badge = (value) => `<span class="pill ${String(value || "pending").toLowerCase().replaceAll(" ", "")}">${safe(title(value))}</span>`;
  let requests = [];

  function accessError(message) {
    return `<tr><td colspan="8" class="empty"><strong>Corporate registrations could not be loaded.</strong><br><small>${safe(message)}</small></td></tr>`;
  }

  function requestRow(request) {
    const canReview = ["submitted", "review"].includes(request.kybStatus);
    const actions = canReview
      ? `<button type="button" class="access-approve" data-corporate-action="approved">Approve</button><button type="button" class="access-reject" data-corporate-action="rejected">Reject</button>`
      : request.kybStatus === "draft"
        ? `<span class="corporate-awaiting">Awaiting KYB submission</span>`
        : `<span>${safe(date(request.reviewedAt))}</span>`;
    return `<tr data-corporate-request="${safe(request.clientId)}"><td><strong>${safe(request.company)}</strong><small>${safe(request.tier)}</small></td><td><strong>${safe(request.email || "—")}</strong><small>${safe(request.phone || "No phone provided")}</small></td><td>${badge(request.kybStatus)}</td><td>${request.documentsRequired ? `${request.documentsUploaded} / ${request.documentsRequired}` : "—"}</td><td>${badge(request.clientStatus)}</td><td>${safe(date(request.submittedAt || request.createdAt))}</td><td>${safe(request.reviewNote || "—")}</td><td class="access-actions">${actions}</td></tr>`;
  }

  function queueMarkup(error) {
    const pending = requests.filter((request) => !["approved", "rejected"].includes(request.kybStatus)).length;
    const approved = requests.filter((request) => request.kybStatus === "approved").length;
    const rejected = requests.filter((request) => request.kybStatus === "rejected").length;
    return `<div class="kpis access-kpis corporate-access-kpis"><div class="kpi"><label>Registration / KYB Queue</label><strong>${pending}</strong><span>Awaiting applicant or Management action</span></div><div class="kpi"><label>Approved Corporate Clients</label><strong>${approved}</strong><span>Active for OTC execution</span></div><div class="kpi"><label>Rejected</label><strong>${rejected}</strong><span>Trading access remains disabled</span></div></div><section class="card access-request-card corporate-request-card"><header><div><h2>Corporate Registration Queue</h2><p>Corporate Clients are created only from self-registration. Review completed KYB before enabling OTC access.</p></div><div class="access-header-actions"><button class="button ghost" type="button" id="refresh-corporate-requests">Refresh Requests</button><a class="button ghost" href="../corporate-client/register.html" target="_blank" rel="noopener">Open Corporate Registration</a></div></header><div class="table-wrap"><table class="access-request-table corporate-request-table"><thead><tr><th>Company</th><th>Company Email</th><th>KYB</th><th>Documents</th><th>Client Status</th><th>Submitted</th><th>Review Note</th><th>Decision</th></tr></thead><tbody>${requests.length ? requests.map(requestRow).join("") : error ? accessError(error) : `<tr><td colspan="8" class="empty">No Corporate Client registrations yet.</td></tr>`}</tbody></table></div></section>`;
  }

  function directoryMarkup() {
    const active = requests.filter((request) => request.clientStatus === "active");
    return `<section class="card client-directory corporate-directory"><header><div><h2>Approved Corporate Clients</h2><p>Only applicants approved through KYB are operational counterparties.</p></div><a class="button ghost" href="../corporate-client/register.html" target="_blank" rel="noopener">Corporate Registration</a></header><div class="table-wrap"><table class="client-table"><thead><tr><th>Client ID</th><th>Client</th><th>Tier</th><th>KYC / AML</th><th>Status</th><th>Onboarded</th></tr></thead><tbody>${active.length ? active.map((client) => `<tr><td class="client-id">${safe(client.clientCode)}</td><td><span class="client-name"><i class="fi fi-rr-building" aria-hidden="true"></i>${safe(client.company)}</span></td><td class="client-tier">${safe(client.tier)}</td><td>${badge(client.kycStatus)} ${badge(client.amlStatus)}</td><td>${badge(client.clientStatus)}</td><td>${safe(date(client.onboardedAt))}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">No approved Corporate Clients yet.</td></tr>`}</tbody></table></div></section>`;
  }

  function draw(activeTab = "queue", error = "") {
    const host = document.querySelector("#view");
    if (!host) return;
    host.innerHTML = `<section class="page-title"><div><p class="eyebrow">Management</p><h1>B2B / Corporate Clients</h1><p>Corporate Clients join through registration and require KYB approval before OTC access is enabled.</p></div></section><div class="partner-dashboard-tabs corporate-dashboard-tabs" role="tablist" aria-label="Corporate Client sections"><button class="partner-dashboard-tab ${activeTab === "queue" ? "active" : ""}" type="button" data-corporate-tab="queue">Registration Queue <span class="tab-count">${requests.filter((request) => !["approved", "rejected"].includes(request.kybStatus)).length}</span></button><button class="partner-dashboard-tab ${activeTab === "directory" ? "active" : ""}" type="button" data-corporate-tab="directory">Approved Clients</button></div><div id="corporate-client-panel">${activeTab === "queue" ? queueMarkup(error) : directoryMarkup()}</div>`;
    host.querySelectorAll("[data-corporate-tab]").forEach((button) => button.addEventListener("click", () => draw(button.dataset.corporateTab)));
    const refresh = host.querySelector("#refresh-corporate-requests");
    if (refresh) refresh.addEventListener("click", () => loadAndDraw("queue"));
    host.querySelectorAll("[data-corporate-action]").forEach((button) => button.addEventListener("click", () => review(button.closest("tr").dataset.corporateRequest, button.dataset.corporateAction)));
  }

  async function loadRequests() {
    const client = window.LBPSupabase;
    const [onboardingResult, clientsResult, documentsResult] = await Promise.all([
      client.from("corporate_client_onboarding").select("*").order("created_at", { ascending: false }),
      client.from("corporate_clients").select("id,client_code,legal_name,tier,kyc_status,aml_status,client_status,onboarded_at,created_at"),
      client.from("corporate_client_kyb_documents").select("client_id,document_type,status"),
    ]);
    const failure = [onboardingResult, clientsResult, documentsResult].find((result) => result.error)?.error;
    if (failure) throw failure;
    const clients = new Map((clientsResult.data || []).map((row) => [row.id, row]));
    const documents = (documentsResult.data || []).reduce((map, row) => {
      const list = map.get(row.client_id) || [];
      list.push(row);
      map.set(row.client_id, list);
      return map;
    }, new Map());
    requests = (onboardingResult.data || []).map((row) => {
      const corporate = clients.get(row.client_id) || {};
      const uploaded = (documents.get(row.client_id) || []).filter((document) => document.status !== "rejected").length;
      return { clientId: row.client_id, clientCode: corporate.client_code || "—", company: corporate.legal_name || "Corporate Client", tier: corporate.tier || "Corporate", email: row.company_email, phone: row.phone, kybStatus: row.kyb_status || "draft", clientStatus: corporate.client_status || "review", kycStatus: corporate.kyc_status || "pending", amlStatus: corporate.aml_status || "pending", documentsUploaded: uploaded, documentsRequired: 8, submittedAt: row.submitted_at, createdAt: row.created_at, reviewedAt: row.reviewed_at, reviewNote: row.review_note || "", onboardedAt: corporate.onboarded_at };
    });
  }

  async function loadAndDraw(tab = "queue") {
    draw(tab);
    try {
      await loadRequests();
      draw(tab);
    } catch (error) {
      console.error("Corporate Client queue could not be loaded.", error);
      requests = [];
      draw(tab, error?.message || "Supabase rejected this Management request.");
    }
  }

  async function review(clientId, decision) {
    const request = requests.find((item) => item.clientId === clientId);
    if (!request || !["submitted", "review"].includes(request.kybStatus)) return;
    const note = decision === "rejected" ? window.prompt("Reason for rejection (visible to the applicant):", request.reviewNote || "") : "Approved by Management";
    if (decision === "rejected" && !String(note || "").trim()) return;
    const { error } = await window.LBPSupabase.from("corporate_client_onboarding").update({ kyb_status: decision, review_note: String(note || "").trim() }).eq("client_id", clientId);
    if (error) {
      window.alert(error.message);
      return;
    }
    await loadAndDraw("queue");
  }

  document.querySelectorAll(".nav[data-view='clients']").forEach((nav) => nav.addEventListener("click", () => loadAndDraw("queue")));
})();
