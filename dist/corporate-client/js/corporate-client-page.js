(async function initialiseCorporateClientPortal() {
  "use strict";

  const api = window.LBPCorporate;
  const c = api.client;
  const el = (id) => document.getElementById(id);
  const title = el("title");
  const sidebar = el("sidebar");
  const navBackdrop = el("nav_backdrop");
  const nav = el("nav");
  const financialReferences = el("financial_references");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
  const number = (value) => Number(value || 0);
  const money = (value, currency = "IDR") => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: currency === "IDR" ? 0 : 8 }).format(number(value))} ${currency}`;
  const mask = (value) => {
    const clean = String(value || "");
    return clean.length > 8 ? `${clean.slice(0, 4)}••••${clean.slice(-4)}` : "••••";
  };
  const fieldsByPanel = {
    company: ["business_type", "incorporation_country", "registered_address", "business_identification_number", "phone"],
    funds: ["source_of_funds", "transaction_purpose"],
    financial: ["annual_income_bracket", "wealth_sources"],
  };
  const tabDefs = [
    ["dashboard", "Dashboard"], ["request", "New OTC Request"], ["history", "Request History"],
    ["company", "Company Profile"], ["directors", "Directors"], ["owners", "Beneficial Owners"],
    ["funds", "Source & Purpose"], ["financial", "Financial & Bank"], ["documents", "Documents & Declaration"],
  ];
  const tabIcons = {
    dashboard: "fi fi-rr-apps", request: "fi fi-rr-clipboard-list", history: "fi fi-rr-time-past",
    company: "fi fi-rr-building", directors: "fi fi-rr-user", owners: "fi fi-rr-users",
    funds: "fi fi-rr-hand-holding-usd", financial: "fi fi-rr-bank", documents: "fi fi-rr-document",
  };

  const access = await api.profile();
  if (!access) {
    location.replace(`login.html?next=${encodeURIComponent(location.pathname)}`);
    return;
  }
  const clientId = access.profile.client_id;
  const userId = access.session.user.id;
  let clientRow;
  let onboarding;
  let deskQuotes = [];
  let usdRate = 0;

  function setTab(id) {
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === id));
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === id));
    const current = tabDefs.find((item) => item[0] === id);
    title.textContent = current ? current[1] : "Corporate Client";
    setMobileNavigation(false);
  }

  function setMobileNavigation(open) {
    sidebar.classList.toggle("open", open);
    document.body.classList.toggle("corporate-nav-open", open);
    el("menu").setAttribute("aria-expanded", String(open));
    el("menu").setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }

  function setDesktopNavigation(collapsed) {
    document.querySelector(".app").classList.toggle("corporate-sidebar-collapsed", collapsed);
    localStorage.setItem("lbpCorporateSidebarCollapsed", String(collapsed));
    el("menu").setAttribute("aria-label", collapsed ? "Show navigation" : "Hide navigation");
  }

  nav.innerHTML = tabDefs.map(([id, name], index) => `${[0, 3, 6].includes(index) ? `<span class="nav-group">${index === 0 ? "Operations" : index === 3 ? "Profile & KYB" : "Financial controls"}</span>` : ""}<button data-tab="${id}" class="${index ? "" : "active"}"><i class="${tabIcons[id]}" aria-hidden="true"></i><span>${name}</span></button>`).join("");
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  setDesktopNavigation(localStorage.getItem("lbpCorporateSidebarCollapsed") === "true");
  el("menu").addEventListener("click", () => {
    if (window.matchMedia("(max-width: 760px)").matches) setMobileNavigation(!sidebar.classList.contains("open"));
    else setDesktopNavigation(!document.querySelector(".app").classList.contains("corporate-sidebar-collapsed"));
  });
  navBackdrop.addEventListener("click", () => setMobileNavigation(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMobileNavigation(false); });
  el("signout").addEventListener("click", async () => {
    await c.auth.signOut();
    location.replace("login.html");
  });

  async function load() {
    const results = await Promise.all([
      c.from("corporate_clients").select("*").eq("id", clientId).single(),
      c.from("corporate_client_onboarding").select("*").eq("client_id", clientId).single(),
      c.from("partner_desks").select("id,display_name,status").eq("status", "active").order("display_name"),
      c.from("partner_desk_quotes").select("*").order("quoted_at", { ascending: false }),
      c.from("asset_rates").select("asset_code,idr_rate").eq("asset_code", "USD").maybeSingle(),
      c.from("corporate_otc_requests").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      c.from("corporate_client_kyb_documents").select("*").eq("client_id", clientId),
      c.from("corporate_client_bank_accounts").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
      c.from("corporate_client_wallets").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
    ]);
    const requiredError = [results[0], results[1], results[6], results[7], results[8]].find((result) => result.error)?.error;
    if (requiredError) throw requiredError;
    if (results[5].error) {
      const requestButton = document.querySelector("#request_form button");
      if (requestButton) requestButton.disabled = true;
      el("request_status").textContent = "OTC request execution is awaiting activation. You can complete KYB onboarding now.";
    }
    clientRow = results[0].data;
    onboarding = results[1].data;
    usdRate = number(results[4].data?.idr_rate);
    const latest = new Map();
    for (const quote of results[3].data || []) if (!latest.has(quote.partner_id)) latest.set(quote.partner_id, quote);
    deskQuotes = (results[2].data || []).map((desk) => ({ ...desk, quote: latest.get(desk.id) })).filter((item) => item.quote);
    render(results[5].data || [], results[6].data || [], results[7].data || [], results[8].data || []);
  }

  function render(requests, documents, bankAccounts, wallets) {
    el("kyb_pill").textContent = `KYB ${String(onboarding.kyb_status || "draft").toUpperCase()}`;
    el("metrics").innerHTML = [
      ["Company", clientRow.legal_name], ["KYB Status", onboarding.kyb_status],
      ["Active Requests", requests.filter((row) => !["settled", "rejected", "cancelled", "expired"].includes(row.status)).length],
      ["Partner Desks", deskQuotes.length],
    ].map(([label, value]) => `<div class="card metric"><span class="eyebrow">${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");

    el("quotes").innerHTML = deskQuotes.map(({ display_name, quote }) => `<article class="card quote-card">
      <div class="quote-head"><div><h2>${esc(display_name)}</h2><span class="muted">Updated ${new Date(quote.quoted_at).toLocaleString()}</span></div><span class="pill">Available</span></div>
      <div class="quote-row"><span><small class="quote-label">Buy</small><b class="quote-price">Rp ${money(quote.buy_price, "").trim()}</b></span><span><small class="quote-label">Sell</small><b class="quote-price">Rp ${money(quote.sell_price, "").trim()}</b></span><span><small class="quote-label">Spread</small><b class="quote-price">${number(quote.spread_percent).toFixed(3)}%</b></span><span><small class="quote-label">USDT</small><b class="quote-price">${money(quote.available_usdt, "USDT")}</b></span><span><small class="quote-label">USD</small><b class="quote-price">${money(quote.available_usd, "USD")}</b></span><span><small class="quote-label">IDR</small><b class="quote-price">Rp ${money(quote.available_idr, "").trim()}</b></span><button class="btn btn-secondary" data-choose="${quote.partner_id}">Choose</button></div>
    </article>`).join("") || '<div class="notice">No current Partner Desk quote is available.</div>';
    document.querySelectorAll("[data-choose]").forEach((button) => button.addEventListener("click", () => {
      el("partner").value = button.dataset.choose;
      setTab("request");
      calculate();
    }));

    el("partner").innerHTML = deskQuotes.map((item) => `<option value="${esc(item.id)}">${esc(item.display_name)}</option>`).join("");
    el("history_body").innerHTML = requests.map((row) => `<tr><td class="mono">${esc(row.request_code)}</td><td>${new Date(row.created_at).toLocaleString()}</td><td>${esc(row.partner_id)}</td><td>${esc(String(row.route).replaceAll("_", " → "))}</td><td class="mono">${money(row.input_amount, row.input_asset)}</td><td class="mono">${money(row.estimated_output, row.output_asset)}</td><td><span class="pill">${esc(row.status)}</span></td></tr>`).join("") || '<tr><td colspan="7">No requests yet.</td></tr>';
    fillForms();
    renderFinancialReferences(bankAccounts, wallets);
    renderDocuments(documents);
  }

  function calculate() {
    const selected = deskQuotes.find((item) => item.id === el("partner").value);
    const quote = selected?.quote;
    const input = number(el("amount").value);
    if (!quote || !input) {
      el("estimate").value = "";
      return;
    }
    let output = 0;
    let asset = "USDT";
    if (el("route").value === "IDR_USDT") output = input / number(quote.sell_price);
    else if (el("route").value === "USD_USDT") output = input / (number(quote.sell_price) / usdRate);
    else {
      output = input * number(quote.buy_price);
      asset = "IDR";
    }
    el("estimate").value = money(output * (1 - number(quote.fee_percent) / 100), asset);
  }
  el("route").onchange = el("partner").onchange = el("amount").oninput = calculate;

  el("request_form").onsubmit = async (event) => {
    event.preventDefault();
    const status = el("request_status");
    status.textContent = "Checking and reserving liquidity…";
    const { data, error } = await c.rpc("submit_corporate_otc_request", {
      p_partner_id: el("partner").value, p_route: el("route").value, p_input_amount: number(el("amount").value), p_note: el("note").value || null,
    });
    if (error) {
      status.textContent = error.message;
      status.className = "status full error";
      return;
    }
    status.textContent = `${data.request_code} submitted and liquidity reserved.`;
    status.className = "status full success";
    await load();
    setTab("history");
  };

  function fillForms() {
    document.querySelectorAll("[data-save] input,[data-save] select").forEach((input) => {
      const source = input.name === "legal_name" ? clientRow : onboarding;
      const value = source[input.name];
      input.value = Array.isArray(value) ? value.join(", ") : (value ?? "");
    });
    document.querySelectorAll("[data-save]").forEach((form) => {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const payload = {};
        new FormData(form).forEach((value, key) => {
          payload[key] = ["source_of_funds", "transaction_purpose", "wealth_sources"].includes(key)
            ? String(value).split(",").map((item) => item.trim()).filter(Boolean) : value;
        });
        delete payload.legal_name;
        delete payload.company_email;
        const { error } = await c.from("corporate_client_onboarding").update({ ...payload, updated_at: new Date().toISOString() }).eq("client_id", clientId);
        alert(error ? error.message : "Saved successfully.");
        if (!error) Object.assign(onboarding, payload);
      };
    });
  }

  function canEditFinancialReferences() {
    return ["draft", "rejected"].includes(String(onboarding.kyb_status || "").toLowerCase());
  }

  function renderFinancialReferences(bankAccounts, wallets) {
    if (!financialReferences) return;
    const locked = !canEditFinancialReferences();
    const bankRows = bankAccounts.map((row) => `<tr><td>${esc(row.account_label)}</td><td>${esc(row.bank_name)}</td><td class="mono">${esc(mask(row.account_number))}</td><td>${esc(row.currency)}</td><td>${esc(row.swift_bic || "—")}</td><td><span class="pill">${esc(row.is_primary ? "Primary" : row.status)}</span></td></tr>`).join("") || '<tr><td colspan="6">No bank references added.</td></tr>';
    const walletRows = wallets.map((row) => `<tr><td>${esc(row.wallet_label)}</td><td>${esc(row.asset)}</td><td>${esc(row.network)}</td><td class="mono">${esc(mask(row.address))}</td><td><span class="pill">${esc(row.is_primary ? "Primary" : row.status)}</span></td></tr>`).join("") || '<tr><td colspan="5">No crypto wallets added.</td></tr>';
    financialReferences.innerHTML = `<div class="financial-reference-grid">
      <article class="card section-card"><h2>Settlement Bank References</h2><p class="muted">You may add multiple local or international settlement accounts.</p>
        <form id="bank_reference_form" class="form-grid"><label><span>Reference Label</span><input name="account_label" maxlength="80" placeholder="USD settlement account" required ${locked ? "disabled" : ""}></label><label><span>Bank Name</span><input name="bank_name" maxlength="160" required ${locked ? "disabled" : ""}></label><label><span>Beneficiary Name</span><input name="beneficiary_name" maxlength="160" required ${locked ? "disabled" : ""}></label><label><span>Currency</span><select name="currency" ${locked ? "disabled" : ""}><option>IDR</option><option>USD</option><option>SGD</option><option>EUR</option></select></label><label><span>Account Number / IBAN</span><input name="account_number" maxlength="80" required ${locked ? "disabled" : ""}></label><label><span>SWIFT / BIC</span><input name="swift_bic" maxlength="20" ${locked ? "disabled" : ""}></label><label><span>Bank Country</span><input name="bank_country" maxlength="100" required ${locked ? "disabled" : ""}></label><label><span>Intermediary Bank</span><input name="intermediary_bank_name" maxlength="160" ${locked ? "disabled" : ""}></label><label class="full"><span>Bank Address</span><input name="bank_address" maxlength="300" ${locked ? "disabled" : ""}></label><label class="full"><span>Beneficiary Address</span><input name="beneficiary_address" maxlength="300" ${locked ? "disabled" : ""}></label><label class="full"><input type="checkbox" name="is_primary" style="width:auto" ${locked ? "disabled" : ""}> Use as primary settlement account</label><button class="btn btn-primary full" ${locked ? "disabled" : ""}>Add Bank Reference</button><p id="bank_reference_status" class="status full">${locked ? "Financial references are locked while KYB is under review or approved." : ""}</p></form>
        <div class="table-wrap"><table class="table"><thead><tr><th>Label</th><th>Bank</th><th>Account</th><th>Currency</th><th>SWIFT</th><th>Status</th></tr></thead><tbody>${bankRows}</tbody></table></div>
      </article>
      <article class="card section-card"><h2>Whitelisted Crypto Wallets</h2><p class="muted">Provide the blockchain/network for every settlement wallet.</p>
        <form id="wallet_reference_form" class="form-grid"><label><span>Wallet Label</span><input name="wallet_label" maxlength="80" placeholder="USDT treasury wallet" required ${locked ? "disabled" : ""}></label><label><span>Asset</span><select name="asset" ${locked ? "disabled" : ""}><option>USDT</option><option>USDC</option><option>BTC</option><option>ETH</option><option>OTHER</option></select></label><label><span>Blockchain / Network</span><select name="network" ${locked ? "disabled" : ""}><option>TRC20</option><option>ERC20</option><option>BEP20</option><option>Bitcoin</option><option>Ethereum</option><option>Solana</option><option>Other</option></select></label><label><span>Wallet Use</span><select name="wallet_use" ${locked ? "disabled" : ""}><option value="settlement">Settlement</option><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="treasury">Treasury</option></select></label><label class="full"><span>Wallet Address</span><input name="address" maxlength="160" autocomplete="off" required ${locked ? "disabled" : ""}></label><label class="full"><input type="checkbox" name="is_primary" style="width:auto" ${locked ? "disabled" : ""}> Use as primary settlement wallet</label><button class="btn btn-primary full" ${locked ? "disabled" : ""}>Add Crypto Wallet</button><p id="wallet_reference_status" class="status full">${locked ? "Financial references are locked while KYB is under review or approved." : ""}</p></form>
        <div class="table-wrap"><table class="table"><thead><tr><th>Label</th><th>Asset</th><th>Network</th><th>Address</th><th>Status</th></tr></thead><tbody>${walletRows}</tbody></table></div>
      </article>
    </div>`;
    bindFinancialReferenceForms();
  }

  function bindFinancialReferenceForms() {
    const saveReference = async (formId, table, statusId, transform) => {
      const form = el(formId);
      if (!form) return;
      form.onsubmit = async (event) => {
        event.preventDefault();
        const status = el(statusId);
        const button = form.querySelector("button");
        button.disabled = true;
        const payload = transform(Object.fromEntries(new FormData(form)));
        try {
          if (payload.is_primary) {
            const { error: clearError } = await c.from(table).update({ is_primary: false, updated_at: new Date().toISOString() }).eq("client_id", clientId).eq("is_primary", true);
            if (clearError) throw clearError;
          }
          const { error } = await c.from(table).insert(payload);
          if (error) throw error;
          await load();
        } catch (error) {
          status.textContent = error.message;
          status.className = "status full error";
          button.disabled = false;
        }
      };
    };
    saveReference("bank_reference_form", "corporate_client_bank_accounts", "bank_reference_status", (values) => ({
      client_id: clientId, account_label: values.account_label.trim(), bank_name: values.bank_name.trim(),
      beneficiary_name: values.beneficiary_name.trim(), currency: values.currency, account_number: values.account_number.trim(),
      swift_bic: values.swift_bic.trim() || null, bank_country: values.bank_country.trim(), bank_address: values.bank_address.trim() || null,
      beneficiary_address: values.beneficiary_address.trim() || null, intermediary_bank_name: values.intermediary_bank_name.trim() || null,
      is_primary: Boolean(values.is_primary), status: "pending", updated_at: new Date().toISOString(),
    }));
    saveReference("wallet_reference_form", "corporate_client_wallets", "wallet_reference_status", (values) => ({
      client_id: clientId, wallet_label: values.wallet_label.trim(), asset: values.asset, network: values.network,
      address: values.address.trim(), wallet_use: values.wallet_use, is_primary: Boolean(values.is_primary), status: "pending", updated_at: new Date().toISOString(),
    }));
  }

  let directorCount = 0;
  function directorBlock() {
    directorCount += 1;
    return `<form class="card section-card form-grid director-form"><h2 class="full">Director ${directorCount}</h2><input type="hidden" name="position_no" value="${directorCount}"><label><span>Full Name</span><input name="full_name" required></label><label><span>Date of Birth</span><input name="date_of_birth" type="date"></label><label><span>Place of Birth</span><input name="place_of_birth"></label><label><span>Nationality</span><input name="nationality"></label><label><span>ID Type</span><input name="identity_type"></label><label><span>ID Number</span><input name="identity_number"></label><label class="full"><span>Residential Address</span><input name="residential_address"></label><label><span>PEP</span><select name="is_pep"><option value="false">No</option><option value="true">Yes</option></select></label><button class="btn btn-primary full">Save Director</button></form>`;
  }
  function bindDirectors() {
    document.querySelectorAll(".director-form").forEach((form) => {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(form));
        payload.client_id = clientId;
        payload.is_pep = payload.is_pep === "true";
        const { error } = await c.from("corporate_client_directors").upsert(payload, { onConflict: "client_id,position_no" });
        alert(error ? error.message : "Director saved.");
      };
    });
  }
  el("add_director").onclick = () => {
    if (directorCount >= 4) return alert("Maximum 4 directors.");
    el("director_list").insertAdjacentHTML("beforeend", directorBlock());
    bindDirectors();
  };
  el("director_list").innerHTML = directorBlock();
  bindDirectors();

  let ownerCount = 0;
  function ownerBlock() {
    ownerCount += 1;
    return `<form class="form-grid owner-form" style="margin-top:16px"><label><span>Full Name</span><input name="full_name" required></label><label><span>Ownership %</span><input name="ownership_percentage" type="number" step=".0001"></label><label><span>ID Number</span><input name="identity_number"></label><label><span>Nationality</span><input name="nationality"></label><label><span>Date of Birth</span><input name="date_of_birth" type="date"></label><label><span>Place of Birth</span><input name="place_of_birth"></label><label><span>ID Type</span><input name="identity_type"></label><label><span>PEP</span><select name="is_pep"><option value="false">No</option><option value="true">Yes</option></select></label><label class="full"><span>Residential Address</span><input name="residential_address"></label><label class="full"><span>Control Criteria Numbers</span><input name="control_criteria" placeholder="1, 2, 5"></label><button class="btn btn-primary full">Save Beneficial Owner</button></form>`;
  }
  function addOwner() {
    el("owner_list").insertAdjacentHTML("beforeend", ownerBlock());
    const form = el("owner_list").lastElementChild;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form));
      payload.id = form.dataset.id || crypto.randomUUID();
      form.dataset.id = payload.id;
      payload.client_id = clientId;
      payload.is_pep = payload.is_pep === "true";
      payload.ownership_percentage = payload.ownership_percentage ? number(payload.ownership_percentage) : null;
      payload.control_criteria = String(payload.control_criteria || "").split(",").map(Number).filter(Boolean);
      const { error } = await c.from("corporate_client_beneficial_owners").upsert(payload);
      alert(error ? error.message : "Beneficial owner saved.");
    };
  }
  el("add_owner").onclick = addOwner;
  addOwner();

  const docTypes = [
    ["director_id", "Director ID", true], ["beneficial_owner_id", "Beneficial Owner ID", true],
    ["deed_establishment", "Deed of Establishment & Ministry Decree", true], ["deed_amendment", "Amendment & Ministry Decree (if any)", false],
    ["nib", "NIB", true], ["npwp", "Tax Identification Number", true], ["sppkp", "SPPKP", true],
    ["statement_letter", "Statement Letter", true], ["nda", "NDA Agreement", true],
  ];
  function renderDocuments(documents) {
    el("documents_grid").innerHTML = docTypes.map(([id, name, required]) => {
      const document = documents.find((item) => item.document_type === id);
      return `<div class="doc ${required ? "required" : ""}"><h3>${esc(name)}</h3><p class="muted">${document ? `Uploaded · ${esc(document.status)}` : "Not uploaded"}</p><input type="file" data-doc="${id}" accept=".pdf,.jpg,.jpeg,.png"></div>`;
    }).join("");
    document.querySelectorAll("input[type=file][data-doc]").forEach((input) => {
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 10485760) return alert("Maximum file size is 10 MB.");
        const path = `${userId}/${input.dataset.doc}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await c.storage.from("corporate-kyb").upload(path, file, { upsert: false });
        if (uploadError) return alert(uploadError.message);
        const { error } = await c.from("corporate_client_kyb_documents").upsert({ client_id: clientId, user_id: userId, document_type: input.dataset.doc, storage_path: path, original_filename: file.name, mime_type: file.type, size_bytes: file.size, updated_at: new Date().toISOString() }, { onConflict: "client_id,document_type" });
        alert(error ? error.message : "Document uploaded.");
        if (!error) await load();
      };
    });
  }
  el("submit_kyb").onclick = async () => {
    if (!el("declaration").checked) return alert("Accept the declaration first.");
    const { error } = await c.from("corporate_client_onboarding").update({ declaration_accepted: true, kyb_status: "submitted", submitted_at: new Date().toISOString() }).eq("client_id", clientId);
    el("document_status").textContent = error ? error.message : "KYB submitted for review.";
    el("document_status").className = error ? "status error" : "status success";
    if (!error) {
      onboarding.kyb_status = "submitted";
      el("kyb_pill").textContent = "KYB SUBMITTED";
    }
  };

  async function hydratePeople() {
    const [directors, owners] = await Promise.all([
      c.from("corporate_client_directors").select("*").eq("client_id", clientId).order("position_no"),
      c.from("corporate_client_beneficial_owners").select("*").eq("client_id", clientId),
    ]);
    if (directors.error || owners.error) throw directors.error || owners.error;
    if (directors.data.length) {
      directorCount = 0;
      el("director_list").innerHTML = "";
      directors.data.forEach((row) => {
        el("director_list").insertAdjacentHTML("beforeend", directorBlock());
        const form = el("director_list").lastElementChild;
        [...form.elements].forEach((input) => { if (input.name && row[input.name] != null) input.value = String(row[input.name]); });
      });
      bindDirectors();
    }
    if (owners.data.length) {
      el("owner_list").innerHTML = "";
      owners.data.forEach((row) => {
        addOwner();
        const form = el("owner_list").lastElementChild;
        form.dataset.id = row.id;
        [...form.elements].forEach((input) => { if (input.name && row[input.name] != null) input.value = Array.isArray(row[input.name]) ? row[input.name].join(", ") : String(row[input.name]); });
      });
    }
  }

  try {
    await load();
    await hydratePeople();
  } catch (error) {
    document.querySelector(".content").innerHTML = `<div class="notice"><h2>Corporate Client data unavailable</h2><p>${esc(error.message)}</p></div>`;
  }
})();
