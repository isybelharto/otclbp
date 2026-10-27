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
  const number = (value) => Number(value || 0);
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
      <header class="partner-top">
        <a class="partner-brand" href="./" aria-label="LBP OTC Partner Desk">
          <img class="partner-brand-logo" src="../management/assets/lbp-crypto-fiat-logo.png" alt="PT Lintas Batas Pembayaran">
          <span>PT LINTAS BATAS<small>PARTNER OTC DESK</small></span>
        </a>
        <div class="partner-top-actions">
          ${deskControl}
          ${isManagement ? '<a class="partner-action ghost" href="../">Management</a>' : ""}
          <button class="partner-action ghost" id="partner-sign-out" type="button">Sign out</button>
        </div>
      </header>
      <main class="partner-page">
        <section class="partner-heading">
          <div>
            <span class="partner-eyebrow">Authenticated exchange workspace</span>
            <h1>${escapeHtml(desk.display_name)} OTC Partner Desk</h1>
            <p>${escapeHtml(desk.legal_name || desk.display_name)} · ${escapeHtml(desk.jurisdiction || "Jurisdiction pending")}</p>
          </div>
          ${badge(desk.status || "Active")}
        </section>
        <nav class="partner-tabs" aria-label="Partner Desk modules">
          ${tabs.map(([id, label]) => `<button class="partner-tab ${activeTab === id ? "active" : ""}" type="button" data-tab="${id}" aria-selected="${activeTab === id}">${label}</button>`).join("")}
        </nav>
        <section id="partner-tab-content"></section>
      </main>`;

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        activeTab = button.dataset.tab;
        renderShell();
        renderActiveTab();
      });
    });
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
              <div class="partner-kpi"><label>Available USDT</label><strong>${quantity(quote.available_usdt, "USDT", 2)}</strong><span>Latest submitted capacity</span></div>
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
            <label>Buy Price (IDR)<input type="number" min="0" step="1" id="partner-buy" value="${escapeHtml(quote.buy_price || "")}" required></label>
            <label>Sell Price (IDR)<input type="number" min="0" step="1" id="partner-sell" value="${escapeHtml(quote.sell_price || "")}" required></label>
            <label>Spread %<input type="number" min="0" step="0.001" id="partner-spread" value="${escapeHtml(quote.spread_percent ?? "")}" required></label>
            <label>Fee %<input type="number" min="0" step="0.001" id="partner-fee" value="${escapeHtml(quote.fee_percent ?? "")}" required></label>
          </div>
          <div class="partner-form-divider"><span>Available liquidity</span></div>
          <div class="partner-config-fields partner-volume-fields">
            <label>Available USDT<input type="number" min="0" step="0.01" id="partner-usdt" value="${escapeHtml(quote.available_usdt ?? "")}" required></label>
            <label>Available USDC<input type="number" min="0" step="0.01" id="partner-usdc" value="${escapeHtml(quote.available_usdc ?? "")}" required></label>
            <label>Available BTC<input type="number" min="0" step="0.00000001" id="partner-btc" value="${escapeHtml(quote.available_btc ?? "")}" required></label>
            <label>Available IDR<input type="number" min="0" step="1" id="partner-idr" value="${escapeHtml(quote.available_idr ?? "")}" required></label>
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
      <td class="mono">${number(row.spread_percent).toFixed(3)}%</td><td class="mono">${number(row.fee_percent).toFixed(3)}%</td>
      <td class="mono">${escapeHtml(quantity(row.available_usdt, "USDT", 2))}</td><td>${badge(row.id === latestQuote().id ? "Current" : "Recorded")}</td>
    </tr>`).join("") || emptyRow(7, "No partner quote has been submitted yet.");
    return tableCard("Daily Quote & Availability History", "Every submitted quote remains available for review.", ["Date / Time", "Buy Price", "Sell Price", "Spread", "Fee", "Available USDT", "Status"], rows);
  }

  function renderLiquidity() {
    const quote = latestQuote();
    const items = [["USDT", quote.available_usdt, "USDT", "#1e40af"], ["USDC", quote.available_usdc, "USDC", "#059669"], ["BTC", quote.available_btc, "BTC", "#7c3aed"], ["IDR", quote.available_idr, "IDR", "#f59e0b"]];
    const max = Math.max(...items.map((item) => number(item[1])), 1);
    return `<article class="partner-card partner-tab-card"><header class="partner-card-head"><div><h2>Available Liquidity</h2><p>Liquidity from the latest partner quote submitted ${escapeHtml(dateTime(quote.quoted_at))}.</p></div>${badge(quote.id ? "Current" : "Pending")}</header><div class="partner-liquidity-grid">${items.map(([label, value, asset, color]) => `<div class="partner-liquidity-card"><span>${label}</span><strong>${asset === "IDR" ? compactIdr(value) : quantity(value, asset, asset === "BTC" ? 8 : 2)}</strong><div class="liquidity-bar"><i style="width:${Math.max(2, Math.min(100, number(value) / max * 100))}%;background:${color}"></i></div></div>`).join("")}</div></article>`;
  }

  function renderAccounts() {
    const rows = (currentRecord.accounts || []).map((row) => `<tr><td class="account-name">${escapeHtml(row.bank_name)}</td><td>${escapeHtml(row.account_name)}</td><td class="mono">${escapeHtml(row.account_number_masked)}</td><td>${escapeHtml(row.currency)}</td><td>${badge(row.status)}</td></tr>`).join("") || emptyRow(5, "No corporate settlement account has been registered.");
    return tableCard("Corporate Settlement Accounts", "Verified corporate accounts available for controlled settlement.", ["Bank", "Account Name", "Account No.", "Currency", "Status"], rows);
  }

  function renderWallets() {
    const rows = (currentRecord.wallets || []).map((row) => `<tr><td>${escapeHtml(row.asset)}</td><td>${escapeHtml(row.network)}</td><td><span class="wallet-address" title="${escapeHtml(row.address_masked)}">${escapeHtml(row.address_masked)}</span></td><td>${escapeHtml(row.wallet_use)}</td><td>${badge(row.status)}</td></tr>`).join("") || emptyRow(5, "No whitelisted crypto wallet has been registered.");
    return tableCard("Whitelisted Crypto Wallets", "Only controlled settlement addresses associated with this partner are displayed.", ["Asset", "Network", "Wallet Address", "Use", "Status"], rows);
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
        spread_percent: number(document.querySelector("#partner-spread").value), fee_percent: number(document.querySelector("#partner-fee").value),
        available_usdt: number(document.querySelector("#partner-usdt").value), available_usdc: number(document.querySelector("#partner-usdc").value),
        available_btc: number(document.querySelector("#partner-btc").value), available_idr: number(document.querySelector("#partner-idr").value),
        note: document.querySelector("#partner-note").value.trim() || null,
      };
      const positivePrices = values.buy_price > 0 && values.sell_price > 0;
      const nonNegative = [values.spread_percent, values.fee_percent, values.available_usdt, values.available_usdc, values.available_btc, values.available_idr].every((value) => Number.isFinite(value) && value >= 0);
      if (!positivePrices || !nonNegative) {
        status.textContent = "Enter positive buy/sell prices and non-negative fee, spread, and liquidity values.";
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
