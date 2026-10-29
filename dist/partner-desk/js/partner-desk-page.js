(function initialisePartnerDeskPage() {
  "use strict";

  const api = window.LBPPartnerDeskSupabase;
  const app = document.querySelector("#partner-desk-app");
  const requestedPartner = new URLSearchParams(window.location.search).get("partner");
  const tabs = [
    ["dashboard", "Dashboard"],
    ["history", "Quote History"],
    ["liquidity", "Available Liquidity"],
    ["accounts", "Settlement Accounts"],
    ["wallets", "Crypto Wallets"],
    ["fiat", "Fiat History"],
    ["crypto", "Crypto History"],
  ];
  const tabIcons = {
    dashboard: "fi fi-rr-apps",
    history: "fi fi-rr-time-past",
    liquidity: "fi fi-rr-chart-line-up",
    accounts: "fi fi-rr-bank",
    wallets: "fi fi-rr-wallet",
    fiat: "fi fi-rr-money-bill-transfer",
    crypto: "fi fi-rr-coins",
  };

  let access = null;
  let allowedDesks = [];
  let activePartnerId = "";
  let activeTab = "dashboard";
  let currentRecord = null;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  // Partner-entered amounts are displayed with thousands separators while they
  // are typed. Normalise them before every calculation or database write.
  const number = (value) => Number(String(value ?? "").replaceAll(",", "").trim() || 0);
  const idr = (value) => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(number(value)).replace("Rp", "Rp ");
  const compactIdr = (value) => {
    const amount = number(value);
    if (amount >= 1e12) return `Rp ${(amount / 1e12).toLocaleString("en-US", { maximumFractionDigits: 2 })} T`;
    if (amount >= 1e9) return `Rp ${(amount / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 })} B`;
    if (amount >= 1e6) return `Rp ${(amount / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} M`;
    return idr(amount);
  };
  const quantity = (value, asset, maximumFractionDigits = 4) => `${number(value).toLocaleString("en-US", { maximumFractionDigits })} ${asset}`;
  const quoteSpread = (quote) => Math.max(0, number(quote.sell_price) - number(quote.buy_price));
  const quoteSpreadPercent = (quote) => {
    const buy = number(quote.buy_price);
    return buy > 0 ? quoteSpread(quote) / buy * 100 : 0;
  };
  const dateTime = (value) => value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB"
    : "Not submitted";
  const badge = (value) => {
    const label = String(value || "Pending");
    return `<span class="badge ${escapeHtml(label.toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(label)}</span>`;
  };
  const emptyRow = (columns, message) => `<tr><td class="partner-empty" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
  const latestQuote = () => currentRecord?.quotes?.[0] || {};

  function renderShell() {
    const desk = currentRecord.desk;
    const profile = access.profile;
    const isManagement = profile.role === "management";
    const deskControl = isManagement
      ? `<label class="partner-desk-picker"><span>Partner desk</span><select class="partner-select" id="partner-switch">${allowedDesks.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === activePartnerId ? "selected" : ""}>${escapeHtml(item.display_name)}</option>`).join("")}</select></label>`
      : `<div class="partner-session"><span>${escapeHtml(profile.full_name || desk.operator_name || "Partner operator")}</span><strong>${escapeHtml(desk.display_name)}</strong></div>`;

    app.innerHTML = `
      <div class="partner-workspace">
        <aside class="partner-sidebar" id="partner-sidebar">
          <a class="partner-brand" href="./" aria-label="LBP OTC Partner Desk">
            <img class="partner-brand-logo" src="assets/lbp-crypto-fiat-logo.png" alt="PT Lintas Batas Pembayaran">
            <span>PT LINTAS BATAS<small>PARTNER OTC DESK</small></span>
          </a>
          <nav class="partner-tabs" id="partner-tabs" aria-label="Partner Desk modules">
            <span class="partner-nav-group">Operations</span>
            ${tabs.map(([id, label]) => `${id === "accounts" ? '<span class="partner-nav-group">Settlement</span>' : ""}<button class="partner-tab ${activeTab === id ? "active" : ""}" type="button" data-tab="${id}" aria-selected="${activeTab === id}"><i class="${tabIcons[id]}" aria-hidden="true"></i><span>${label}</span></button>`).join("")}
          </nav>
        </aside>
        <button class="partner-tab-backdrop" id="partner-tab-backdrop" type="button" aria-label="Close workspace menu"></button>
        <main class="partner-main">
          <header class="partner-top">
            <div class="partner-portal-title"><span>LBP OTC</span><small>Institutional Partner Desk</small></div>
            <div class="partner-top-actions">
              ${deskControl}
              ${isManagement ? '<a class="partner-action ghost" href="../">Management</a>' : ""}
              <button class="partner-action ghost" id="partner-sign-out" type="button">Sign out</button>
              <button class="partner-mobile-tab-toggle" id="partner-mobile-tab-toggle" type="button" aria-label="Open workspace menu" aria-controls="partner-sidebar" aria-expanded="false">☰</button>
            </div>
          </header>
          <div class="partner-page">
            <section class="partner-heading">
              <div>
                <span class="partner-eyebrow">Authenticated exchange workspace</span>
                <h1>${escapeHtml(desk.display_name)} OTC Partner Desk</h1>
                <p>${escapeHtml(desk.legal_name || desk.display_name)} · ${escapeHtml(desk.jurisdiction || "Jurisdiction pending")}</p>
              </div>
              ${badge(desk.status || "Active")}
            </section>
            <section id="partner-tab-content"></section>
          </div>
        </main>
      </div>`;

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        activeTab = button.dataset.tab;
        document.body.classList.remove("partner-tab-menu-open");
        renderShell();
        renderActiveTab();
      });
    });
    const mobileTabsToggle = document.querySelector("#partner-mobile-tab-toggle");
    const mobileTabsBackdrop = document.querySelector("#partner-tab-backdrop");
    const setMobileTabs = (open) => {
      document.body.classList.toggle("partner-tab-menu-open", open);
      mobileTabsToggle.setAttribute("aria-expanded", String(open));
      mobileTabsToggle.setAttribute("aria-label", open ? "Close workspace menu" : "Open workspace menu");
    };
    mobileTabsToggle.addEventListener("click", () => setMobileTabs(!document.body.classList.contains("partner-tab-menu-open")));
    mobileTabsBackdrop.addEventListener("click", () => setMobileTabs(false));
    document.querySelector("#partner-sign-out").addEventListener("click", async () => {
      await api.client.auth.signOut();
      window.location.replace("login.html");
    });
    const partnerSwitch = document.querySelector("#partner-switch");
    if (partnerSwitch) {
      partnerSwitch.addEventListener("change", async (event) => {
        activePartnerId = event.target.value;
        history.replaceState({}, "", `?partner=${encodeURIComponent(activePartnerId)}`);
        await loadDesk();
      });
    }
  }

  function renderActiveTab() {
    const target = document.querySelector("#partner-tab-content");
    if (!target) return;
    const renderers = {
      dashboard: renderDashboard,
      history: renderQuoteHistory,
      liquidity: renderLiquidity,
      accounts: renderAccounts,
      wallets: renderWallets,
      fiat: renderFiatHistory,
      crypto: renderCryptoHistory,
    };
    target.innerHTML = renderers[activeTab]();
    if (activeTab === "dashboard") bindQuoteForm();
    if (activeTab === "accounts") bindBankAccountForm();
    if (activeTab === "wallets") bindWalletForm();
  }

  function operationalSummary() {
    const fiat = currentRecord.fiat || [];
    const crypto = currentRecord.crypto || [];
    const settledFiat = fiat.filter((row) => String(row.status).toLowerCase() === "settled");
    return {
      fiatVolume: settledFiat.reduce((sum, row) => sum + number(row.amount), 0),
      settlements: fiat.length + crypto.length,
      accounts: (currentRecord.accounts || []).length,
      wallets: (currentRecord.wallets || []).length,
    };
  }

  function renderDashboard() {
    const quote = latestQuote();
    const summary = operationalSummary();
    const hasQuote = Boolean(quote.id);
    return `
      <div class="partner-overview-grid">
        <article class="partner-card partner-dashboard-card">
          <header class="partner-card-head">
            <div><h2>Dashboard</h2><p>Current operating position for this exchange desk.</p></div>
            ${badge(hasQuote ? "Current" : "Pending")}
          </header>
          <div class="partner-card-body">
            <div class="partner-kpis">
              <div class="partner-kpi"><label>Buy Price</label><strong>${idr(quote.buy_price)}</strong><span>Latest partner quote</span></div>
              <div class="partner-kpi"><label>Sell Price</label><strong>${idr(quote.sell_price)}</strong><span>Latest partner quote</span></div>
              <div class="partner-kpi"><label>Spread</label><strong>${idr(quoteSpread(quote))}</strong><span>${quoteSpreadPercent(quote).toFixed(3)}% calculated automatically</span></div>
              <div class="partner-kpi"><label>Available USDT</label><strong>${quantity(quote.available_usdt, "USDT", 2)}</strong><span>Latest submitted capacity</span></div>
              <div class="partner-kpi"><label>Available USD</label><strong>${quantity(quote.available_usd, "USD", 2)}</strong><span>Partner settlement capacity</span></div>
              <div class="partner-kpi"><label>Available IDR</label><strong>${compactIdr(quote.available_idr)}</strong><span>Partner settlement capacity</span></div>
              <div class="partner-kpi"><label>Settled Fiat Volume</label><strong>${compactIdr(summary.fiatVolume)}</strong><span>Recorded settlement history</span></div>
              <div class="partner-kpi"><label>Settlement Records</label><strong>${summary.settlements.toLocaleString("en-US")}</strong><span>Fiat and on-chain records</span></div>
            </div>
            <div class="partner-control-list">
              <div><span>Last quote submission</span><strong>${escapeHtml(dateTime(quote.quoted_at))}</strong></div>
              <div><span>Corporate settlement accounts</span><strong>${summary.accounts}</strong></div>
              <div><span>Whitelisted crypto wallets</span><strong>${summary.wallets}</strong></div>
              <div><span>Desk access</span><strong>${access.profile.role === "management" ? "Management review" : "Assigned partner only"}</strong></div>
            </div>
          </div>
        </article>
        ${renderQuoteCard(quote)}
      </div>`;
  }

  function renderQuoteCard(quote) {
    return `
      <article class="partner-card partner-quote-card">
        <header class="partner-card-head">
          <div><h2>Current Partner Quote</h2><p>Submit today's OTC prices and immediately available volume.</p></div>
          ${badge(quote.id ? "Current" : "New")}
        </header>
        <form class="partner-card-body" id="partner-quote-form">
          <div class="partner-config-fields">
            <label>Sell Price (IDR)<input type="text" inputmode="decimal" autocomplete="off" class="partner-number-input" id="partner-sell" value="${escapeHtml(number(quote.sell_price).toLocaleString("en-US", { maximumFractionDigits: 2 }))}" required></label>
            <label>Buy Price (IDR)<input type="text" inputmode="decimal" autocomplete="off" class="partner-number-input" id="partner-buy" value="${escapeHtml(number(quote.buy_price).toLocaleString("en-US", { maximumFractionDigits: 2 }))}" required></label>
          </div>
          <div class="partner-form-divider"><span>Available liquidity</span></div>
          <div class="partner-config-fields partner-volume-fields">
            <label>Available USDT<input type="text" inputmode="decimal" autocomplete="off" class="partner-number-input" id="partner-usdt" value="${escapeHtml(number(quote.available_usdt).toLocaleString("en-US", { maximumFractionDigits: 2 }))}" required></label>
            <label>Available USD<input type="text" inputmode="decimal" autocomplete="off" class="partner-number-input" id="partner-usd" value="${escapeHtml(number(quote.available_usd).toLocaleString("en-US", { maximumFractionDigits: 2 }))}" required></label>
            <label>Available IDR<input type="text" inputmode="decimal" autocomplete="off" class="partner-number-input" id="partner-idr" value="${escapeHtml(number(quote.available_idr).toLocaleString("en-US", { maximumFractionDigits: 2 }))}" required></label>
          </div>
          <label class="partner-note-field">Submission note<textarea id="partner-note" rows="2" maxlength="500" placeholder="Optional execution or liquidity note">${escapeHtml(quote.note || "")}</textarea></label>
          <p class="partner-form-status" id="partner-form-status" role="status"></p>
          <button class="partner-config-save" id="save-partner-quote" type="submit">Submit Partner Quote</button>
        </form>
      </article>`;
  }

  function renderQuoteHistory() {
    const rows = (currentRecord.quotes || []).map((row) => `<tr>
      <td>${escapeHtml(dateTime(row.quoted_at))}</td><td class="mono">${escapeHtml(idr(row.buy_price))}</td><td class="mono">${escapeHtml(idr(row.sell_price))}</td>
      <td class="mono">${escapeHtml(quantity(row.available_usd, "USD", 2))}</td><td class="mono">${escapeHtml(quantity(row.available_usdt, "USDT", 2))}</td>
      <td class="mono">${escapeHtml(compactIdr(row.available_idr))}</td><td>${badge(row.id === latestQuote().id ? "Current" : "Recorded")}</td>
    </tr>`).join("") || emptyRow(7, "No partner quote has been submitted yet.");
    return tableCard("Daily Quote & Availability History", "Every submitted quote remains available for review.", ["Date / Time", "Buy Price", "Sell Price", "Available USD", "Available USDT", "Available IDR", "Status"], rows);
  }

  function renderLiquidity() {
    const quote = latestQuote();
    const items = [["USD", quote.available_usd, "USD", "#059669"], ["USDT", quote.available_usdt, "USDT", "#1e40af"], ["IDR", quote.available_idr, "IDR", "#f59e0b"]];
    const max = Math.max(...items.map((item) => number(item[1])), 1);
    return `<article class="partner-card partner-tab-card"><header class="partner-card-head"><div><h2>Available Liquidity</h2><p>Liquidity from the latest partner quote submitted ${escapeHtml(dateTime(quote.quoted_at))}.</p></div>${badge(quote.id ? "Current" : "Pending")}</header><div class="partner-liquidity-grid">${items.map(([label, value, asset, color]) => `<div class="partner-liquidity-card"><span>${label}</span><strong>${asset === "IDR" ? compactIdr(value) : quantity(value, asset, 2)}</strong><div class="liquidity-bar"><i style="width:${Math.max(2, Math.min(100, number(value) / max * 100))}%;background:${color}"></i></div></div>`).join("")}</div></article>`;
  }

  function renderAccounts() {
    const rows = (currentRecord.accounts || []).map((row) => `<tr><td class="account-name">${escapeHtml(row.bank_name)}</td><td>${escapeHtml(row.account_name)}</td><td class="mono">${escapeHtml(row.account_number_masked)}</td><td>${escapeHtml(row.currency)}</td><td>${escapeHtml(row.swift_bic || "—")}</td><td>${row.is_primary ? badge("Primary") : badge(row.status)}</td></tr>`).join("") || emptyRow(6, "No corporate settlement account has been registered.");
    return `<div class="partner-split-grid"><article class="partner-card partner-tab-card"><header class="partner-card-head"><div><h2>Add Settlement Account</h2><p>Add as many corporate bank references as your desk uses. New references remain pending until LBP verification.</p></div></header><form class="partner-card-body partner-reference-form" id="partner-bank-form"><div class="partner-config-fields"><label>Reference label<input name="account_label" maxlength="80" placeholder="USD settlement account" required></label><label>Bank name<input name="bank_name" maxlength="160" required></label><label>Beneficiary name<input name="account_name" maxlength="160" required></label><label>Currency<select name="currency" class="partner-select"><option value="IDR">IDR</option><option value="USD">USD</option><option value="SGD">SGD</option><option value="EUR">EUR</option></select></label><label>Account number / IBAN<input name="account_number" maxlength="80" required></label><label>SWIFT / BIC<input name="swift_bic" maxlength="20" placeholder="Optional"></label><label>Bank country<input name="bank_country" maxlength="100" required></label><label>IBAN (if applicable)<input name="iban" maxlength="80"></label><label class="partner-wide">Bank address<input name="bank_address" maxlength="300"></label><label class="partner-wide">Beneficiary address<input name="beneficiary_address" maxlength="300"></label><label class="partner-check"><input type="checkbox" name="is_primary"> Use as primary settlement account</label></div><p class="partner-form-status" id="partner-bank-status" role="status"></p><button class="partner-config-save" type="submit">Add Bank Reference</button></form></article>${tableCard("Corporate Settlement Accounts", "References are masked in this list. Full values are available only to your authorised desk and LBP Management.", ["Bank", "Beneficiary", "Account No.", "Currency", "SWIFT / BIC", "Status"], rows)}</div>`;
  }

  function renderWallets() {
    const rows = (currentRecord.wallets || []).map((row) => `<tr><td>${escapeHtml(row.asset)}</td><td>${escapeHtml(row.network)}</td><td><span class="wallet-address" title="${escapeHtml(row.address_masked)}">${escapeHtml(row.address_masked)}</span></td><td>${escapeHtml(row.wallet_use)}</td><td>${row.is_primary ? badge("Primary") : badge(row.status)}</td></tr>`).join("") || emptyRow(5, "No whitelisted crypto wallet has been registered.");
    return `<div class="partner-split-grid"><article class="partner-card partner-tab-card"><header class="partner-card-head"><div><h2>Add Crypto Wallet</h2><p>State the asset and blockchain/network for every settlement address. New wallet references require LBP approval.</p></div></header><form class="partner-card-body partner-reference-form" id="partner-wallet-form"><div class="partner-config-fields"><label>Wallet label<input name="wallet_label" maxlength="80" placeholder="USDT operating wallet" required></label><label>Asset<select name="asset" class="partner-select"><option value="USDT">USDT</option><option value="USDC">USDC</option><option value="BTC">BTC</option><option value="ETH">ETH</option><option value="OTHER">Other</option></select></label><label>Blockchain / network<select name="network" class="partner-select"><option value="TRC20">TRC20</option><option value="ERC20">ERC20</option><option value="BEP20">BEP20</option><option value="Bitcoin">Bitcoin</option><option value="Ethereum">Ethereum</option><option value="Solana">Solana</option><option value="Other">Other</option></select></label><label>Wallet use<select name="wallet_use" class="partner-select"><option value="settlement">Settlement</option><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="treasury">Treasury</option></select></label><label class="partner-wide">Wallet address<input name="address" maxlength="160" autocomplete="off" required></label><label class="partner-check"><input type="checkbox" name="is_primary"> Use as primary settlement wallet</label></div><p class="partner-form-status" id="partner-wallet-status" role="status"></p><button class="partner-config-save" type="submit">Add Crypto Wallet</button></form></article>${tableCard("Whitelisted Crypto Wallets", "Only controlled settlement addresses associated with this partner are displayed.", ["Asset", "Network", "Wallet Address", "Use", "Status"], rows)}</div>`;
  }

  function bindBankAccountForm() {
    const form = document.querySelector("#partner-bank-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = document.querySelector("#partner-bank-status");
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        await api.saveBankAccount(activePartnerId, Object.fromEntries(new FormData(form)));
        currentRecord = await api.loadPartnerDesk(activePartnerId);
        renderActiveTab();
      } catch (error) {
        status.textContent = `Bank reference was not saved: ${error.message}`;
        status.className = "partner-form-status error";
        button.disabled = false;
      }
    });
  }

  function bindWalletForm() {
    const form = document.querySelector("#partner-wallet-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = document.querySelector("#partner-wallet-status");
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        await api.saveWallet(activePartnerId, Object.fromEntries(new FormData(form)));
        currentRecord = await api.loadPartnerDesk(activePartnerId);
        renderActiveTab();
      } catch (error) {
        status.textContent = `Crypto wallet was not saved: ${error.message}`;
        status.className = "partner-form-status error";
        button.disabled = false;
      }
    });
  }

  function renderFiatHistory() {
    const rows = (currentRecord.fiat || []).map((row) => `<tr><td class="mono">${escapeHtml(row.id)}</td><td>${escapeHtml(dateTime(row.settled_at))}</td><td class="${escapeHtml(String(row.direction).toLowerCase())}">${escapeHtml(String(row.direction).toUpperCase())}</td><td class="mono">${escapeHtml(row.currency)} ${number(row.amount).toLocaleString("id-ID")}</td><td>${escapeHtml(row.bank_name)}</td><td class="mono">${escapeHtml(row.bank_reference || "—")}</td><td>${badge(row.status)}</td></tr>`).join("") || emptyRow(7, "No fiat settlement has been recorded.");
    return tableCard("Fiat Settlement History", "Bank-to-bank settlement records associated with this partner.", ["Settlement ID", "Date / Time", "IN / OUT", "Amount", "Bank", "Bank Reference", "Status"], rows);
  }

  function renderCryptoHistory() {
    const rows = (currentRecord.crypto || []).map((row) => `<tr><td class="mono">${escapeHtml(row.id)}</td><td>${escapeHtml(dateTime(row.settled_at))}</td><td class="${escapeHtml(String(row.direction).toLowerCase())}">${escapeHtml(String(row.direction).toUpperCase())}</td><td class="mono">${escapeHtml(quantity(row.amount, row.asset, row.asset === "BTC" ? 8 : 2))}</td><td>${escapeHtml(row.network)}</td><td><span class="wallet-address" title="${escapeHtml(row.txid || "")}">${escapeHtml(row.txid || "—")}</span></td><td class="mono">${escapeHtml(row.confirmations ?? "—")}</td><td>${badge(row.status)}</td></tr>`).join("") || emptyRow(8, "No crypto settlement has been recorded.");
    return tableCard("Crypto Settlement History", "On-chain settlement records with network confirmations.", ["Settlement ID", "Date / Time", "IN / OUT", "Amount", "Network", "Blockchain TXID", "Confirmations", "Status"], rows);
  }

  function tableCard(title, subtitle, headers, rows) {
    return `<article class="partner-card partner-tab-card"><header class="partner-card-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div></header><div class="partner-table-wrap"><table class="partner-table"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></article>`;
  }

  function bindQuoteForm() {
    const form = document.querySelector("#partner-quote-form");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = document.querySelector("#partner-form-status");
      const button = document.querySelector("#save-partner-quote");
      const values = {
        buy_price: number(document.querySelector("#partner-buy").value), sell_price: number(document.querySelector("#partner-sell").value),
        available_usdt: number(document.querySelector("#partner-usdt").value), available_usd: number(document.querySelector("#partner-usd").value),
        available_idr: number(document.querySelector("#partner-idr").value),
        note: document.querySelector("#partner-note").value.trim() || null,
      };
      values.spread_percent = values.buy_price > 0 ? (values.sell_price - values.buy_price) / values.buy_price * 100 : 0;
      // Fees are governed by Management for each approved transaction; they are
      // not supplied by the partner desk quote.
      values.fee_percent = 0;
      const positivePrices = values.buy_price > 0 && values.sell_price >= values.buy_price;
      const nonNegative = [values.available_usdt, values.available_usd, values.available_idr].every((value) => Number.isFinite(value) && value >= 0);
      if (!positivePrices || !nonNegative) {
        status.textContent = "Enter a positive buy price, a sell price equal to or above buy, and non-negative USD, USDT, and IDR liquidity values.";
        status.className = "partner-form-status error";
        return;
      }
      button.disabled = true;
      button.textContent = "Submitting…";
      status.textContent = "";
      try {
        await api.saveQuote(activePartnerId, values, access.session.user.id);
        currentRecord = await api.loadPartnerDesk(activePartnerId);
        renderShell();
        renderActiveTab();
        const nextStatus = document.querySelector("#partner-form-status");
        if (nextStatus) {
          nextStatus.textContent = "Partner quote and available liquidity were saved successfully.";
          nextStatus.className = "partner-form-status success";
        }
      } catch (error) {
        status.textContent = `Quote was not saved: ${error.message}`;
        status.className = "partner-form-status error";
        button.disabled = false;
        button.textContent = "Submit Partner Quote";
      }
    });

    document.querySelectorAll(".partner-number-input").forEach((input) => {
      input.addEventListener("input", () => {
        const start = input.selectionStart;
        const raw = input.value.replace(/[^0-9.]/g, "");
        const [whole = "", ...decimalParts] = raw.split(".");
        const decimal = decimalParts.length ? `.${decimalParts.join("")}` : "";
        const grouped = whole ? Number(whole).toLocaleString("en-US") : "";
        input.value = `${grouped}${decimal}`;
        const position = Math.max(0, Math.min(input.value.length, start + (input.value.length - raw.length)));
        input.setSelectionRange(position, position);
      });
    });
  }

  async function loadDesk() {
    app.innerHTML = '<main class="partner-loading"><div class="partner-spinner"></div><p>Loading governed partner data…</p></main>';
    try {
      currentRecord = await api.loadPartnerDesk(activePartnerId);
      if (!currentRecord.desk) throw new Error("The assigned Partner Desk could not be found.");
      renderShell();
      renderActiveTab();
    } catch (error) {
      renderError(error.message);
    }
  }

  function renderError(message) {
    app.innerHTML = `<main class="partner-page"><section class="partner-card partner-error"><h1>Partner Desk unavailable</h1><p>${escapeHtml(message || "Unable to load the governed partner data.")}</p><a class="partner-action" href="login.html">Return to login</a></section></main>`;
  }

  async function bootstrap() {
    try {
      access = await api.sessionProfile();
      if (!access) {
        window.location.replace("login.html");
        return;
      }
      const allDesks = await api.listPartnerDesks();
      allowedDesks = access.profile.role === "management" ? allDesks : allDesks.filter((desk) => desk.id === access.profile.partner_id);
      if (!allowedDesks.length) throw new Error("No active Partner Desk is assigned to this account.");
      activePartnerId = allowedDesks.some((desk) => desk.id === requestedPartner) ? requestedPartner : allowedDesks[0].id;
      await loadDesk();
    } catch (error) {
      renderError(error.message);
    }
  }

  bootstrap();
})();
