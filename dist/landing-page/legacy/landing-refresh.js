/* Public landing-page refresh. The operational portal remains in app.js. */
landing = function () {
  const serviceIcon = (kind) => ({
    cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="11" rx="2"/><circle cx="12" cy="12.5" r="2"/><path d="M6 10h.01M18 15h.01"/></svg>',
    layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z"/><path d="m3 12.5 9 4.5 9-4.5M3 17 12 21l9-4"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.8-2.9 8-7 10-4.1-2-7-5.2-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8c2.2 0 2.2 2 4.5 2S9.8 8 12 8s2.2 2 4.5 2S18.8 8 21 8M3 13c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.2 2 4.5 2 2.3-2 4.5-2M3 18c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.2 2 4.5 2 2.3-2 4.5-2"/></svg>'
  }[kind]);

  const services = [
    ['cash', 'Fiat On/Off Ramp', 'IDR and USD settlement via RTGS, BI-FAST, SKNBI, and SWIFT wire.'],
    ['layers', 'High-Volume Block Trades', 'Block execution away from open-market slippage, with locked quotes.'],
    ['shield', 'Institutional Escrow', 'Funds held in segregated escrow until both legs complete.'],
    ['wave', 'Deep Liquidity', 'Aggregated across five global and local liquidity providers.']
  ];
  const assets = [
    ['IDR', 'Indonesian Rupiah'], ['USD', 'US Dollar'], ['USDT', 'Tether — TRC20 / ERC20'],
    ['USDC', 'USD Coin — ERC20'], ['BTC', 'Bitcoin']
  ];

  return `<main class="landing landing-reference">
    <section class="reference-hero">
      <div class="reference-shell">
        <div class="reference-eyebrow">OTC BROKERAGE <span>·</span> JAKARTA</div>
        <h1>Institutional OTC Liquidity for Fiat<br class="wide-break" /> and Digital Assets</h1>
        <p class="reference-intro">PT Lintas Batas Pembayaran bridges rupiah, dollar, and stablecoin flows for corporates, institutional funds, and payment gateways across Indonesia.</p>
        <div class="reference-actions">
          <button class="reference-primary" onclick="openPortal()">Open Portal <span>→</span></button>
          <button class="reference-secondary" onclick="showModal('access')">Request Access</button>
        </div>
        <div class="reference-metrics">
          <article><span>VOLUME SINCE INCEPTION</span><strong>Rp 3.54 T</strong></article>
          <article><span>ACTIVE INSTITUTIONAL CLIENTS</span><strong>14</strong></article>
          <article><span>DEDICATED OTC DESKS</span><strong>5</strong></article>
        </div>
      </div>
    </section>

    <section class="reference-about"><div class="reference-shell"><div class="reference-copy">
      <h2>About PT LBP OTC Brokerage</h2>
      <p>We operate a five-desk OTC trading floor with institutional escrow and daily reconciliation between bank and on-chain balances. Every trade lands in a single Master Ledger that is the one source for daily, weekly, monthly, AUM, and audit reporting.</p>
    </div></div></section>

    <section class="reference-services"><div class="reference-shell">
      <h2>Services</h2>
      <div class="reference-service-grid">${services.map(([icon, title, description]) => `<article class="reference-service-card"><div class="service-symbol">${serviceIcon(icon)}</div><h3>${title}</h3><p>${description}</p></article>`).join('')}</div>
    </div></section>

    <section class="reference-assets"><div class="reference-shell">
      <h2>Supported Assets</h2>
      <div class="reference-asset-grid">${assets.map(([ticker, label]) => `<article><strong>${ticker}</strong><span>${label}</span></article>`).join('')}</div>
    </div></section>

    <section class="reference-onboarding"><div class="reference-shell reference-onboarding-inner">
      <div><h2>Corporate Onboarding</h2><p>Send an access request and our onboarding desk replies within one business day.</p></div>
      <button class="reference-onboarding-button" onclick="showModal('access')">Request Access <span>→</span></button>
    </div></section>

    <footer class="reference-footer"><div class="reference-shell"><span>© 2026 PT Lintas Batas Pembayaran. OTC Brokerage &amp; Institutional Settlement.</span><button onclick="openPortal()">Open Portal</button></div></footer>
  </main>`;
};

render();
