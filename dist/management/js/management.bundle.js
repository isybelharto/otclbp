(function initialiseLbpSupabase() {
  "use strict";

  const url = "https://biwwfxfpcsanszxrxhyw.supabase.co";
  const publishableKey = "sb_publishable_sB3GSSdJi477vhQAmjABnw_DT4sknEb";

  if (!window.supabase || !url || !publishableKey) {
    throw new Error("Supabase client could not be initialised.");
  }

  // The publishable key is intended for browser use. Database access remains
  // protected by Supabase Row Level Security; never add a service-role key here.
  window.LBPSupabase = window.supabase.createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
})();

(function initialiseLbpManagementAuth() {
  "use strict";

  const client = window.LBPSupabase;
  const isLoginPage = window.location.pathname.endsWith("/login.html");

  function loginUrl(reason) {
    const next = window.location.pathname + window.location.search + window.location.hash;
    const query = new URLSearchParams({ next });
    if (reason) query.set("error", reason);
    return `login.html?${query.toString()}`;
  }

  function dashboardUrl() {
    const requested = new URLSearchParams(window.location.search).get("next");
    return requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "./";
  }

  async function getManagementProfile(userId) {
    const { data, error } = await client
      .from("profiles")
      .select("full_name, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  function applyProfile(profile, email) {
    document.documentElement.classList.remove("auth-pending");
    const switcher = document.querySelector("#role-switcher");
    if (switcher) switcher.title = `Signed in as ${email}`;

    const topActions = document.querySelector(".top-actions");
    if (topActions && !topActions.querySelector("[data-lbp-signout]")) {
      const signOut = document.createElement("button");
      signOut.type = "button";
      signOut.className = "profile";
      signOut.dataset.lbpSignout = "true";
      signOut.textContent = "Sign out";
      signOut.addEventListener("click", async () => {
        await client.auth.signOut();
        window.location.replace("login.html");
      });
      topActions.appendChild(signOut);
    }

    window.dispatchEvent(new CustomEvent("lbp:management-ready", {
      detail: { profile, email },
    }));
  }

  async function requireManagement() {
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
      window.location.replace(loginUrl());
      return null;
    }

    try {
      const profile = await getManagementProfile(session.user.id);
      if (!profile || profile.role !== "management" || !profile.is_active) {
        await client.auth.signOut();
        window.location.replace(loginUrl("unauthorized"));
        return null;
      }
      applyProfile(profile, session.user.email || "");
      return { profile, user: session.user };
    } catch (error) {
      console.error("Management authorization failed.", error);
      window.location.replace(loginUrl("authorization"));
      return null;
    }
  }

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  window.LBPManagementAuth = {
    client,
    dashboardUrl,
    getManagementProfile,
    requireManagement,
    signIn,
    signOut: () => client.auth.signOut(),
  };

  window.LBPManagementAuth.ready = isLoginPage
    ? Promise.resolve(null)
    : requireManagement();
})();

(function initialiseLbpManagementData() {
  "use strict";

  const client = window.LBPSupabase;
  const number = (value) => Number(value || 0);
  const first = (record, keys, fallback = "") => {
    for (const key of keys) {
      const value = record[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return fallback;
  };

  const titleCase = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(date);
  };

  async function loadClientNames() {
    const { data, error } = await client.from("clients").select("*");
    if (error) throw error;
    return new Map((data || []).map((row) => [
      String(first(row, ["id", "client_id"])),
      first(row, ["entity_name", "client_name", "name", "legal_name"], "Institutional client"),
    ]));
  }

  function mapTransaction(row, clientNames) {
    const clientId = String(first(row, ["client_id", "client_uuid"]));
    const fiatIn = number(first(row, ["fiat_in", "fiat_in_amount"]));
    const fiatOut = number(first(row, ["fiat_out", "fiat_out_amount"]));
    const cryptoIn = number(first(row, ["crypto_in", "crypto_in_amount"]));
    const cryptoOut = number(first(row, ["crypto_out", "crypto_out_amount"]));

    return {
      id: first(row, ["tx_id", "transaction_id", "reference", "id"]),
      date: formatDate(first(row, ["transaction_at", "executed_at", "created_at"])),
      client: first(row, ["client_name", "counterparty_name"], clientNames.get(clientId) || "Institutional client"),
      type: titleCase(first(row, ["transaction_type", "type"], fiatIn > 0 ? "fiat_to_crypto" : "crypto_to_fiat")),
      asset: first(row, ["asset", "crypto_asset", "asset_code"], "USDT"),
      fiatIn,
      fiatOut,
      cryptoIn,
      cryptoOut,
      rate: number(first(row, ["exchange_rate", "rate", "fx_rate"])),
      desk: first(row, ["desk", "desk_code", "desk_id"], "—"),
      status: titleCase(first(row, ["settlement_status", "status"], "pending")),
      kyc: titleCase(first(row, ["kyc_status"], "pending")),
      aml: titleCase(first(row, ["aml_status"], "review")),
      lp: first(row, ["liquidity_provider", "liquidity_provider_name", "lp"], "—"),
      bank: first(row, ["bank_reference", "bank_ref", "bank"], "—"),
      txid: first(row, ["blockchain_txid", "tx_hash", "txid"], "—"),
    };
  }

  async function loadTransactions() {
    const [{ data: transactionRows, error: transactionError }, clientNames] = await Promise.all([
      client.from("transactions").select("*").order("created_at", { ascending: false }),
      loadClientNames(),
    ]);
    if (transactionError) throw transactionError;
    return (transactionRows || []).map((row) => mapTransaction(row, clientNames));
  }

  async function optionalTable(name) {
    const { data, error } = await client.from(name).select("*");
    if (error) {
      console.warn(`Supabase table ${name} could not be loaded.`, error.message);
      return [];
    }
    return data || [];
  }

  function clientMetrics(clientRow, transactions) {
    const id = String(first(clientRow, ["id", "client_id"]));
    const records = transactions.filter((row) => String(first(row, ["client_id", "client_uuid"])) === id);
    const fiatIn = records.reduce((sum, row) => sum + number(first(row, ["fiat_in", "fiat_in_amount"])), 0);
    const fiatOut = records.reduce((sum, row) => sum + number(first(row, ["fiat_out", "fiat_out_amount"])), 0);
    return {
      id: first(clientRow, ["client_code", "client_id", "id"]),
      name: first(clientRow, ["entity_name", "client_name", "name", "legal_name"], "Institutional client"),
      tier: titleCase(first(clientRow, ["tier", "client_tier", "entity_type"], "corporate")),
      transactions: records.length,
      volume: fiatIn + fiatOut,
      netFlow: fiatIn - fiatOut,
      revenue: records.reduce((sum, row) => sum + number(first(row, ["broker_revenue", "revenue", "fee_amount"])), 0),
      kyc: titleCase(first(clientRow, ["kyc_status"], "pending")),
      aml: titleCase(first(clientRow, ["aml_status"], "review")),
      status: titleCase(first(clientRow, ["status", "client_status"], "active")),
      profile: {
        pic: first(clientRow, ["pic_name", "contact_name", "primary_contact"], "—"),
        bank: first(clientRow, ["bank_name", "settlement_bank"], "—"),
        country: first(clientRow, ["country", "jurisdiction"], "Indonesia"),
        onboarded: formatDate(first(clientRow, ["onboarded_at", "created_at"])),
      },
    };
  }

  function mapReconciliation(row) {
    const scope = titleCase(first(row, ["scope", "reconciliation_type", "type"], "bank"));
    const asset = first(row, ["asset", "asset_code"], "IDR");
    return {
      key: first(row, ["id", "account_id", "wallet_id"]),
      scope,
      account: first(row, ["account_name", "account", "bank_name", "wallet_address"], "—"),
      wallet: first(row, ["wallet_name", "wallet_address", "account"], "—"),
      asset,
      expected: number(first(row, ["expected_ledger_balance", "expected_balance"])),
      actual: number(first(row, ["actual_balance", "onchain_balance"])),
      status: titleCase(first(row, ["status"], "reconciled")),
    };
  }

  function mapAlert(row, transactions, clientNames) {
    const transactionId = String(first(row, ["transaction_id", "tx_id"]));
    const related = transactions.find((item) => String(first(item, ["id", "tx_id", "transaction_id"])) === transactionId) || {};
    const clientId = String(first(related, ["client_id", "client_uuid"]));
    return {
      id: first(row, ["tx_id", "transaction_id", "id"]),
      date: formatDate(first(row, ["created_at", "alerted_at"])),
      client: first(row, ["client_name"], clientNames.get(clientId) || "Institutional client"),
      amount: number(first(row, ["amount", "amount_idr"], first(related, ["fiat_in", "fiat_out"], 0))),
      asset: first(row, ["asset", "asset_code"], first(related, ["asset"], "USDT")),
      aml: titleCase(first(row, ["aml_status", "status", "alert_status"], "review")),
      kyc: titleCase(first(row, ["kyc_status"], first(related, ["kyc_status"], "pending"))),
      status: titleCase(first(row, ["settlement_status"], first(related, ["settlement_status", "status"], "pending"))),
    };
  }

  function mapAudit(row) {
    return {
      timestamp: formatDate(first(row, ["created_at", "timestamp"])),
      user: first(row, ["user_name", "operator_name", "actor"], "System"),
      role: first(row, ["active_role", "role"], "role.Management"),
      action: first(row, ["action", "event_type"], "UPDATE"),
      object: first(row, ["object", "target", "entity_id"], "—"),
      oldValue: first(row, ["old_value"], "—"),
      newValue: first(row, ["new_value"], "—"),
    };
  }

  function mapPartnerAccessRequest(row) {
    return {
      id: row.id,
      userId: row.user_id,
      email: row.corporate_email,
      company: row.company_name,
      contact: row.contact_name,
      position: row.position_title,
      phone: row.phone || "—",
      requestedPartnerId: row.requested_partner_id || "",
      assignedPartnerId: row.assigned_partner_id || row.requested_partner_id || "",
      status: titleCase(row.status || "pending"),
      reviewNote: row.review_note || "",
      createdAt: formatDate(row.created_at),
      reviewedAt: formatDate(row.reviewed_at),
    };
  }

  async function loadPartnerAccessRequests() {
    const { data, error } = await client.from("partner_access_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapPartnerAccessRequest);
  }

  function mapPartner(row) {
    const id = String(first(row, ["partner_id", "exchange_id", "id"]));
    const buy = number(first(row, ["buy_price", "buy"]));
    const sell = number(first(row, ["sell_price", "sell"]));
    return {
      id,
      name: first(row, ["partner_name", "exchange_name", "name"], "Exchange partner"),
      buy: String(buy), sell: String(sell),
      spread: String(first(row, ["spread_percent", "spread"], 0)),
      fee: String(first(row, ["fee_percent", "fee"], 0)),
      status: titleCase(first(row, ["status"], "configured")),
      operator: first(row, ["operator_name", "operator", "updated_by"], "Partner Operations"),
      lastUpdated: formatDate(first(row, ["updated_at", "quoted_at", "created_at"])),
      liquidity: {
        usdt: number(first(row, ["available_usdt", "usdt_available", "liquidity_usdt"])),
        idr: number(first(row, ["available_idr", "idr_available", "liquidity_idr"])),
      },
      summary: { transactions: 0, volume: 0, revenue: 0, netFlow: 0 },
    };
  }

  function sumPartnerSettlements(rows, partnerId, assetKey) {
    return (rows || [])
      .filter((item) => String(item.partner_id) === String(partnerId) && String(item.status || "").toLowerCase() === "settled")
      .reduce((totals, item) => {
        const asset = String(item[assetKey] || (assetKey === "currency" ? "IDR" : "USDT")).toUpperCase();
        totals[asset] = (totals[asset] || 0) + number(item.amount);
        return totals;
      }, {});
  }

  function mapPartnerDesk(desk, quotes, wallets, fiatSettlements, cryptoSettlements) {
    const quote = quotes.filter((item) => String(item.partner_id) === String(desk.id)).sort((a, b) => new Date(b.quoted_at) - new Date(a.quoted_at))[0] || {};
    const partnerWallet = (wallets || []).find((item) => String(item.partner_id) === String(desk.id) && String(item.status || "").toLowerCase() === "active")
      || (wallets || []).find((item) => String(item.partner_id) === String(desk.id))
      || {};
    return {
      id: String(desk.id), name: first(desk, ["display_name", "name"], "Exchange partner"), buy: String(number(quote.buy_price)), sell: String(number(quote.sell_price)),
      spread: String(number(quote.spread_percent)), fee: String(number(quote.fee_percent)), status: titleCase(first(desk, ["status"], "active")),
      operator: first(desk, ["operator_name"], "Partner Operations"), lastUpdated: formatDate(first(quote, ["quoted_at"], first(desk, ["updated_at"]))),
      liquidity: {
        usdt: number(quote.available_usdt),
        usdc: number(quote.available_usdc),
        btc: number(quote.available_btc),
        idr: number(quote.available_idr),
      },
      wallet: {
        asset: first(partnerWallet, ["asset"], "—"),
        network: first(partnerWallet, ["network"], "—"),
        address: first(partnerWallet, ["address_masked", "wallet_address", "address"], ""),
      },
      settledFiat: sumPartnerSettlements(fiatSettlements, desk.id, "currency"),
      settledCrypto: sumPartnerSettlements(cryptoSettlements, desk.id, "asset"),
      summary: { transactions: 0, volume: 0, revenue: 0, netFlow: 0 },
    };
  }

  function mapReserve(row, kind, index) {
    const asset = first(row, ["asset", "asset_code", "currency", "currency_code"], kind === "bank" ? "IDR" : "USDT");
    const quantity = number(first(row, ["available_balance", "current_balance", "balance", "amount"]));
    if (!asset || !quantity) return null;
    const colors = ["#2945b3", "#3b916d", "#4a9cda", "#eea432", "#7440dc"];
    return {
      asset: String(asset).toUpperCase(),
      quantity,
      custody: kind === "bank"
        ? first(row, ["account_name", "bank_name", "institution_name"], "Bank settlement account")
        : first(row, ["wallet_name", "custody_provider", "provider", "wallet_address"], "Institutional custody wallet"),
      color: colors[index % colors.length],
    };
  }

  function mapLeg(row, clientNames, kind) {
    const direction = String(first(row, ["direction", "in_out", "leg_direction", "type"], "in")).toLowerCase();
    const isOut = ["out", "withdrawal", "debit", "sell"].includes(direction);
    const clientId = String(first(row, ["client_id", "client_uuid"]));
    const asset = first(row, ["asset", "asset_code", "currency", "crypto_asset"], kind === "fiat" ? "IDR" : "USDT");
    const amount = number(first(row, ["amount", "amount_idr", "amount_crypto", "value"]));
    const txId = first(row, ["transaction_id", "tx_id", "reference", "id"]);
    const common = {
      id: txId,
      date: formatDate(first(row, ["settled_at", "executed_at", "transaction_at", "created_at"])),
      client: first(row, ["client_name", "counterparty_name"], clientNames.get(clientId) || "Institutional client"),
      asset,
      desk: first(row, ["desk", "desk_code", "desk_id"], "—"),
      status: titleCase(first(row, ["settlement_status", "status"], "pending")),
      kyc: titleCase(first(row, ["kyc_status"], "pending")),
      aml: titleCase(first(row, ["aml_status"], "review")),
      bank: first(row, ["bank_reference", "bank_ref", "bank", "bank_name"], "—"),
      txid: first(row, ["blockchain_txid", "tx_hash", "txid"], "—"),
      rail: first(row, ["rail", "payment_rail", "settlement_rail"], "RTGS"),
      network: first(row, ["network", "chain", "blockchain_network"], asset === "BTC" ? "BITCOIN" : "TRC20"),
      walletAddress: first(row, ["wallet_address", "destination_address", "address"], "—"),
      confirmations: number(first(row, ["confirmations", "confirmation_count"])),
    };

    return kind === "fiat"
      ? { ...common, fiatIn: isOut ? 0 : amount, fiatOut: isOut ? amount : 0, cryptoIn: 0, cryptoOut: 0 }
      : { ...common, fiatIn: 0, fiatOut: 0, cryptoIn: isOut ? 0 : amount, cryptoOut: isOut ? amount : 0 };
  }

  async function loadOperationsData() {
    const [transactions, clientRows, fiatLegs, cryptoLegs, partnerRows, partnerDeskRows, partnerDeskQuotes, partnerDeskWallets, partnerDeskFiat, partnerDeskCrypto, partnerAccessRows, reconciliationRows, alertRows, auditRows, rateRows, bankAccounts, cryptoWallets] = await Promise.all([
      optionalTable("transactions"), optionalTable("clients"), optionalTable("fiat_legs"), optionalTable("crypto_legs"),
      optionalTable("partner_quotes"), optionalTable("partner_desks"), optionalTable("partner_desk_quotes"), optionalTable("partner_desk_wallets"),
      optionalTable("partner_desk_fiat_settlements"), optionalTable("partner_desk_crypto_settlements"), optionalTable("partner_access_requests"), optionalTable("reconciliation_entries"), optionalTable("aml_alerts"),
      optionalTable("audit_events"), optionalTable("asset_rates"), optionalTable("bank_accounts"), optionalTable("crypto_wallets"),
    ]);
    const clientNames = new Map(clientRows.map((row) => [String(first(row, ["id", "client_id"])), first(row, ["entity_name", "client_name", "name", "legal_name"], "Institutional client")]));
    return {
      clients: clientRows.map((row) => clientMetrics(row, transactions)),
      clientProfiles: Object.fromEntries(clientRows.map((row) => {
        const metric = clientMetrics(row, transactions);
        return [metric.id, metric.profile];
      })),
      fiatLegs: fiatLegs.map((row) => mapLeg(row, clientNames, "fiat")),
      cryptoLegs: cryptoLegs.map((row) => mapLeg(row, clientNames, "crypto")),
      partners: partnerDeskRows.length
        ? partnerDeskRows.map((desk) => mapPartnerDesk(desk, partnerDeskQuotes, partnerDeskWallets, partnerDeskFiat, partnerDeskCrypto))
        : partnerRows.map(mapPartner),
      partnerAccessRequests: partnerAccessRows.map(mapPartnerAccessRequest),
      bankReconciliation: reconciliationRows.map(mapReconciliation).filter((row) => row.scope !== "Wallet"),
      walletReconciliation: reconciliationRows.map(mapReconciliation).filter((row) => row.scope === "Wallet"),
      incidents: reconciliationRows.filter((row) => number(first(row, ["difference", "variance"])) !== 0).map((row) => ({
        id: first(row, ["incident_id", "id"]), timestamp: formatDate(first(row, ["created_at", "timestamp"])),
        scope: titleCase(first(row, ["scope", "reconciliation_type"], "bank")), account: first(row, ["account_name", "account", "wallet_address"], "—"),
        difference: number(first(row, ["difference", "variance"])), severity: titleCase(first(row, ["severity"], "medium")),
        status: titleCase(first(row, ["status"], "open")), owner: first(row, ["owner", "assigned_to"], "Treasury Operations"),
        note: first(row, ["note", "investigation_note"], "Reconciliation variance requires review."), target: first(row, ["account_id", "wallet_id", "id"]),
      })),
      alerts: alertRows.map((row) => mapAlert(row, transactions, clientNames)),
      audits: auditRows.map(mapAudit),
      rates: Object.fromEntries(rateRows.map((row) => [first(row, ["asset", "asset_code"]), number(first(row, ["idr_rate", "rate", "idrx_rate"]))])),
      reserves: [...bankAccounts.map((row, index) => mapReserve(row, "bank", index)), ...cryptoWallets.map((row, index) => mapReserve(row, "wallet", index + bankAccounts.length))].filter(Boolean),
    };
  }

  window.LBPManagementData = { loadOperationsData, loadTransactions, loadPartnerAccessRequests };
})();

(function(){
  const storageKey="lbp-otc-partner-desks-v1";
  const partners=[
    ["idrx","IDRX","Indonesia","PT IDRX Exchange Indonesia"],["btse","BTSE","Global","BTSE Technology Ltd"],["ajaib","Ajaib","Indonesia","PT Ajaib Sekuritas Asia"],["reku","Reku","Indonesia","PT Rekeningku Dotcom Indonesia"],["indodax","Indodax","Indonesia","PT Indodax Nasional Indonesia"],["osl","OSL","Hong Kong","OSL Digital Securities"],["nanovest","Nanovest","Indonesia","PT Nanovest Indonesia"],["samuel-kripto","Samuel Kripto","Indonesia","PT Samuel Aset Digital"],["mobee","Mobee","Indonesia","PT Mobee Digital Indonesia"],["tokocrypto","Tokocrypto","Indonesia","PT Crypto Indonesia Berkat"]
  ];
  const banks=["Bank Mandiri","Bank BCA","Bank BNI","Bank BRI","DBS Singapore"];
  const dateFor=offset=>{const date=new Date(2026,9,24-offset);return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric"}).format(date)};
  const initialPartner=([id,name,jurisdiction,legalName],index)=>{
    const buy=16138+index*17,sell=buy+88+(index%4)*7,spread=(.34+(index%5)*.03).toFixed(3),fee=(.08+(index%3)*.02).toFixed(3),baseVolume=1800000+index*235000;
    const priceHistory=Array.from({length:21},(_,row)=>{const move=((row*7+index*3)%17)-8,rowBuy=buy+move*4,rowSell=sell+move*4;return{date:dateFor(row),buy:rowBuy,sell:rowSell,spread:(Number(spread)+((row%3)-1)*.01).toFixed(3),fee,available:baseVolume-row*18500,status:row===0?"Current":"Reconciled"}});
    const fiatTransactions=Array.from({length:8},(_,row)=>{const incoming=(row+index)%2===0,amount=4800000000+index*360000000+row*175000000;return{id:`FIAT-${id.toUpperCase()}-${String(20261024-row).slice(-6)}-${String(row+1).padStart(3,"0")}`,date:`${dateFor(row)} ${String(9+row).padStart(2,"0")}:2${row} WIB`,direction:incoming?"IN":"OUT",currency:"IDR",amount,bank:banks[(index+row)%banks.length],reference:`${id.slice(0,3).toUpperCase()}-${20261024-row}-${String(8100+index*10+row)}`,status:row===0?"Processing":"Settled"}});
    const cryptoTransactions=Array.from({length:8},(_,row)=>{const incoming=(row+index)%2===1,asset=row%4===0?"USDC":row%5===0?"BTC":"USDT",amount=asset==="BTC"?Number((2.15+index*.07+row*.02).toFixed(4)):Math.round(185000+index*12000+row*8500),network=asset==="BTC"?"Bitcoin":asset==="USDC"?"ERC20":row%2?"TRC20":"ERC20";return{id:`CRYPTO-${id.toUpperCase()}-${String(20261024-row).slice(-6)}-${String(row+1).padStart(3,"0")}`,date:`${dateFor(row)} ${String(10+row).padStart(2,"0")}:1${row} WIB`,direction:incoming?"IN":"OUT",asset,amount,network,txid:`0x${id.replace(/-/g,"").padEnd(12,"a")}${String(20261024-row).padStart(12,"0")}a4c9e18f${String(row).padStart(2,"0")}`,confirmations:row===0?"Pending":String(12+row*6),status:row===0?"Processing":"Settled"}});
    return{id,name,jurisdiction,legalName,buy:String(buy),sell:String(sell),spread,fee,status:"Configured",operator:`${name} Partner Operations`,lastUpdated:"24 Oct 2026, 14:30 WIB",liquidity:{usdt:baseVolume,usdc:Math.round(baseVolume*.34),btc:Number((32.4+index*2.35).toFixed(4)),idr:Math.round(baseVolume*buy*.44)},limits:{dailyUsd:12000000+index*1500000,perTransactionUsd:1500000+index*125000},summary:{transactions:66+index*5,volume:Math.round((baseVolume*buy*18)/1000000)*1000000,revenue:Math.round(baseVolume*buy*.006),netFlow:Math.round((index%2?-1:1)*baseVolume*buy*.12)},priceHistory,bankAccounts:[{bank:banks[index%banks.length],accountName:`${legalName} — OTC Settlement`,accountNumber:`•••• ${String(1000+index*37).slice(-4)}`,currency:"IDR",status:"Verified"},{bank:"DBS Singapore",accountName:`${legalName} — USD Settlement`,accountNumber:`•••• ${String(5400+index*23).slice(-4)}`,currency:"USD",status:"Verified"}],wallets:[{asset:"USDT",network:"TRC20",address:`T${id.replace(/-/g,"").toUpperCase().padEnd(31,"X")}`,type:"Whitelisted settlement",status:"Clear"},{asset:"USDC",network:"ERC20",address:`0x${id.replace(/-/g,"").padEnd(40,"a")}`,type:"Whitelisted settlement",status:"Clear"},{asset:"BTC",network:"Bitcoin",address:`bc1q${id.replace(/-/g,"").padEnd(30,"x")}`,type:"Cold settlement",status:"Verified"}],fiatTransactions,cryptoTransactions};
  };
  const defaults=()=>partners.map(initialPartner);
  let state;
  try{const saved=localStorage.getItem(storageKey);state=saved?JSON.parse(saved):{partners:defaults()}}catch(error){state={partners:defaults()}}
  if(!state||!Array.isArray(state.partners)||state.partners.length!==partners.length)state={partners:defaults()};
  const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state))}catch(error){}};
  const getPartner=id=>state.partners.find(partner=>partner.id===id);
  const updatePartner=(id,changes)=>{const partner=getPartner(id);if(!partner)return null;Object.assign(partner,changes);partner.lastUpdated=new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date())+" WIB";const today=partner.priceHistory[0];partner.priceHistory[0]={...today,date:dateFor(0),buy:Number(partner.buy),sell:Number(partner.sell),spread:String(partner.spread),fee:String(partner.fee),available:partner.liquidity.usdt,status:"Current"};persist();return partner};
  const setPartners=partners=>{if(Array.isArray(partners)&&partners.length){state={partners};persist()}return state.partners};
  window.LBPPartnerDeskStore={getPartners:()=>state.partners,getPartner,updatePartner,persist,setPartners,reset:()=>{state={partners:defaults()};persist();return state.partners}};
})();

const ledger=[
 {id:"OTC-2026-0218",date:"24 Oct 2026 14:42",client:"Garuda Prima Capital",type:"Fiat → Crypto",asset:"USDT",fiatIn:46200000000,fiatOut:0,cryptoIn:0,cryptoOut:2915000,rate:15849,desk:"Desk 01",status:"Settled",kyc:"Verified",aml:"Clear",lp:"LP-001",bank:"MDR-20261024-8812",txid:"a4c9…8f1e"},
 {id:"OTC-2026-0217",date:"24 Oct 2026 11:16",client:"Nusantara Infrastruktur",type:"Crypto → Fiat",asset:"USDC",fiatIn:0,fiatOut:31800000000,cryptoIn:2000000,cryptoOut:0,rate:15875,desk:"Desk 03",status:"Reconciled",kyc:"Verified",aml:"Clear",lp:"LP-002",bank:"BCA-20261024-2201",txid:"f7d1…92bc"},
 {id:"OTC-2026-0215",date:"23 Oct 2026 16:18",client:"Meridian Payment Network",type:"Fiat → Crypto",asset:"BTC",fiatIn:22400000000,fiatOut:0,cryptoIn:0,cryptoOut:.154,rate:1035000000,desk:"Desk 02",status:"Processing",kyc:"Verified",aml:"Clear",lp:"LP-003",bank:"BRI-20261023-4018",txid:"Pending"},
 {id:"OTC-2026-0211",date:"23 Oct 2026 10:02",client:"Sarana Niaga Digital",type:"Crypto → Fiat",asset:"USDT",fiatIn:0,fiatOut:17800000000,cryptoIn:1125000,cryptoOut:0,rate:15822,desk:"Desk 04",status:"Pending",kyc:"Verified",aml:"Review",lp:"LP-001",bank:"MDR-20261023-1822",txid:"9bc3…e811"},
 {id:"OTC-2026-0208",date:"22 Oct 2026 15:50",client:"Kencana Asset Mandiri",type:"Fiat → Crypto",asset:"USDT",fiatIn:12600000000,fiatOut:0,cryptoIn:0,cryptoOut:795000,rate:15849,desk:"Desk 05",status:"Settled",kyc:"Verified",aml:"Clear",lp:"LP-002",bank:"BCA-20261022-7064",txid:"47e2…0a16"},
 {id:"OTC-2026-0204",date:"22 Oct 2026 09:24",client:"Cakrawala Dana Investama",type:"Fiat → Crypto",asset:"USDC",fiatIn:8900000000,fiatOut:0,cryptoIn:0,cryptoOut:560000,rate:15893,desk:"Desk 01",status:"Exception",kyc:"Verified",aml:"Hold",lp:"LP-004",bank:"WIRE-20261022-0911",txid:"Hold"}
];
const clients=[["CL-001","Garuda Prima Capital","Institutional Fund","42","Rp 684.2 B","Rp 118.5 B","Rp 86.7 B","Active"],["CL-002","Nusantara Infrastruktur","Corporate","31","Rp 424.1 B","Rp 31.8 B","Rp 59.2 B","Active"],["CL-003","Meridian Payment Network","Payment Gateway","26","Rp 291.7 B","Rp 22.4 B","Rp 42.8 B","Review"],["CL-004","Sarana Niaga Digital","Corporate","18","Rp 178.0 B","Rp 17.8 B","Rp 25.1 B","Hold"]];
const desks=[["Buy price","15,810","15,803","15,796","15,789","15,782"],["Sell price","15,855","15,849","15,843","15,836","15,830"],["Spread %","0.28%","0.31%","0.34%","0.30%","0.33%"],["Fee %","0.20%","0.22%","0.24%","0.21%","0.23%"]];
const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n).replace("Rp","Rp ");
const volume=r=>r.fiatIn+r.fiatOut;
const totalsFor=records=>({vol:records.reduce((a,r)=>a+volume(r),0),fiatIn:records.reduce((a,r)=>a+r.fiatIn,0),fiatOut:records.reduce((a,r)=>a+r.fiatOut,0),cryptoIn:records.reduce((a,r)=>a+r.cryptoIn,0),cryptoOut:records.reduce((a,r)=>a+r.cryptoOut,0),count:records.length});
const totals=()=>totalsFor(ledger);
function periodRecords(records,period,from="",to=""){const dated=records.map(record=>({record,date:new Date(record.date)})).filter(item=>!Number.isNaN(item.date.valueOf()));if(!dated.length||period==="Since Inception")return records;const latest=dated.reduce((max,item)=>item.date>max?item.date:max,new Date(0)),start=from?new Date(`${from}T00:00:00`):null,end=to?new Date(`${to}T23:59:59`):null;return dated.filter(item=>{if(period==="Custom Range")return(!start||item.date>=start)&&(!end||item.date<=end);if(period==="Today")return item.date.getFullYear()===latest.getFullYear()&&item.date.getMonth()===latest.getMonth()&&item.date.getDate()===latest.getDate();if(period==="Weekly")return item.date>=new Date(latest.getFullYear(),latest.getMonth(),latest.getDate()-6);if(period==="Monthly")return item.date.getFullYear()===latest.getFullYear()&&item.date.getMonth()===latest.getMonth();return true}).map(item=>item.record)}
function bindPeriodControl(id,refresh){const control=document.querySelector(id),range=document.querySelector(`${id}-range`),update=()=>{const period=control.querySelector(".active")?.textContent||"Since Inception";if(range)range.hidden=period!=="Custom Range";refresh()};control.querySelectorAll("button").forEach(button=>button.onclick=()=>{control.querySelectorAll("button").forEach(item=>item.classList.remove("active"));button.classList.add("active");update()});if(range)range.querySelectorAll("input").forEach(input=>input.onchange=update);update()}
const pill=v=>`<span class="pill ${String(v).toLowerCase().replace(/\s/g,"")}">${v}</span>`;
const rows=(cols,data,clickable=false)=>`<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>${data.map((r,i)=>`<tr ${clickable?`data-id="${ledger[i].id}"`:""}>${r.map((c,j)=>`<td class="${j===0?"mono":""}">${j===r.length-1&&["Settled","Reconciled","Processing","Pending","Exception","Clear","Verified","Active","Review","Hold"].includes(c)?pill(c):c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const txLink=r=>`<button class="tx-link" type="button" data-id="${r.id}" aria-label="Open detail for ${r.id}">${r.id}</button>`;
const app=document.querySelector("#admin-app");
app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><img src="assets/lbp-crypto-fiat-logo.png" alt="LBP"><div>PT LINTAS BATAS<small>PEMBAYARAN · OTC</small></div></div><div class="nav-label">OPERATIONS</div><button class="nav active" data-view="dashboard"><span>▦</span>Dashboard</button><button class="nav" data-view="ledger"><span>▤</span>Transaction Ledger</button><button class="nav" data-view="fiat"><span>Rp</span>Fiat Ledger</button><button class="nav" data-view="crypto"><span>₮</span>Crypto Ledger</button><div class="nav-label">BUSINESS</div><button class="nav" data-view="clients"><span>◫</span>B2B Corporate Clients</button><button class="nav" data-view="desks"><span>◉</span>OTC Partner Desk</button><button class="nav" data-view="partnerAccess"><span>◎</span>Partner Access Requests</button><button class="nav" data-view="aum"><span>◈</span>AUM Managed Assets</button><div class="nav-label">CONTROL</div><button class="nav" data-view="reports"><span>▥</span>Reports</button><button class="nav" data-view="reconciliation"><span>↻</span>Reconciliation</button><button class="nav" data-view="compliance"><span>✓</span>KYC AML Monitoring</button><button class="nav" data-view="exports"><span>↓</span>Export Center</button><button class="nav" data-view="audit"><span>◌</span>Audit Trail</button><button class="nav" data-view="settings"><span>⚙</span>Settings</button><div class="side-note">Management has complete visibility. Production implementation requires governed data, role enforcement and immutable server-side audit records.</div></aside><button class="mobile-sidebar-backdrop" id="mobile-sidebar-backdrop" type="button" aria-label="Close navigation"></button><main class="main"><header class="top"><div class="top-public-link"><button class="mobile-menu-toggle" id="mobile-menu-toggle" type="button" aria-label="Open navigation" aria-controls="management-sidebar" aria-expanded="false"><i class="fi fi-rr-menu-burger" aria-hidden="true"></i></button><a href="https://ptlbp.co.id/">← Back to public landing page</a></div><div class="top-actions"><div class="fx-rate" aria-live="polite"><span class="fx-dot"></span><div><small>USD / IDR · LIVE REFERENCE</small><strong id="usd-idr-rate">1 USD = Rp 15,850</strong></div><time id="usd-idr-time">Updating…</time></div><button class="profile role-switcher" id="role-switcher" type="button" aria-haspopup="dialog" title="Switch role">Management / Super Admin <i class="fi fi-rr-angle-small-down" aria-hidden="true"></i><span class="avatar">LBP</span></button></div></header><section class="content"><div id="view"></div></section></main></div><div class="modal" id="modal" hidden></div>`;
const view=document.querySelector("#view"),modal=document.querySelector("#modal");
const roleOptions=[
 {key:"management",label:"Management / Super Admin"},
 {key:"trader",label:"OTC Desk Trader"},
 {key:"finance",label:"Finance / Treasury"},
 {key:"compliance",label:"Compliance / AML"},
 {key:"client",label:"Corporate Client"}
];
const roleModules=[
 ["Dashboard",[1,1,1,1,1]],
 ["Transaction Ledger",[1,1,1,1,1]],
 ["Fiat Ledger",[1,1,1,0,0]],
 ["Crypto Ledger",[1,0,1,0,0]],
 ["B2B / Corporate Clients",[1,1,0,1,0]],
 ["OTC Desk 01–05",[1,1,0,0,0]],
 ["Partner Access Requests",[1,0,0,0,0]],
 ["Reports",[1,1,1,1,1]],
 ["AUM / Managed Assets",[1,0,1,0,0]],
 ["Reconciliation",[1,0,1,0,0]],
 ["KYC / AML",[1,0,0,1,0]],
 ["Export Center",[1,0,1,1,1]],
 ["Audit Trail",[1,0,0,1,0]],
 ["Settings",[1,0,1,0,0]]
];
const roleSwitch=document.querySelector("#role-switcher");
let activeRole="management";try{const savedRole=localStorage.getItem("lbp-management-role");if(roleOptions.some(role=>role.key===savedRole))activeRole=savedRole}catch(error){}
function applyActiveRole(){const role=roleOptions.find(item=>item.key===activeRole)||roleOptions[0];roleSwitch.innerHTML=`${role.label}<i class="fi fi-rr-angle-small-down" aria-hidden="true"></i><span class="avatar">LBP</span>`;try{localStorage.setItem("lbp-management-role",activeRole)}catch(error){}}
function openRoleSwitcher(){const active=roleOptions.find(item=>item.key===activeRole)||roleOptions[0],headerCells=roleOptions.map(role=>`<th class="${role.key===activeRole?"role-active-col":""}">${role.label}</th>`).join(""),matrixRows=roleModules.map(([moduleName,access])=>`<tr><td>${moduleName}</td>${access.map((allowed,index)=>`<td class="${roleOptions[index].key===activeRole?"role-active-col":""}"><span class="${allowed?"role-access-yes":"role-access-none"}">${allowed?"✓":"—"}</span></td>`).join("")}</tr>`).join("");modal.hidden=false;modal.innerHTML=`<article class="dialog role-dialog" role="dialog" aria-modal="true" aria-label="Switch role"><header class="dialog-head"><div><h2>Switch Role</h2><p class="sub">Role-based module access</p></div><button class="close" id="close-role-switcher" aria-label="Close role switcher">×</button></header><div class="role-current"><label>Current role<select id="active-role-select">${roleOptions.map(role=>`<option value="${role.key}" ${role.key===active.key?"selected":""}>${role.label}</option>`).join("")}</select></label><span>Access preview only</span></div><div class="table-wrap role-matrix-wrap"><table class="role-matrix"><thead><tr><th>Module</th>${headerCells}</tr></thead><tbody>${matrixRows}</tbody></table></div><footer class="dialog-footer"><button class="button ghost" id="close-role-switcher-footer">Close</button></footer></article>`;const close=()=>modal.hidden=true;document.querySelector("#close-role-switcher").onclick=close;document.querySelector("#close-role-switcher-footer").onclick=close;document.querySelector("#active-role-select").onchange=event=>{activeRole=event.target.value;applyActiveRole();openRoleSwitcher()};modal.onclick=event=>{if(event.target===modal)close()}}
roleSwitch.onclick=openRoleSwitcher;applyActiveRole();const managementShell=app.querySelector(".shell"),managementSidebar=app.querySelector(".sidebar"),managementBrand=managementSidebar.querySelector(".brand");
const navIcons={dashboard:"fi-rr-apps",ledger:"fi-rr-clipboard-list",fiat:"fi-rr-money-bill-wave",crypto:"fi-rr-coins",clients:"fi-rr-building",desks:"fi-rr-chart-line-up",reports:"fi-rr-file-chart-line",aum:"fi-rr-wallet",reconciliation:"fi-rr-refresh",compliance:"fi-rr-shield-check",exports:"fi-rr-download",audit:"fi-rr-time-past",settings:"fi-rr-settings"};
const navLabels={dashboard:"Dashboard",ledger:"Transaction Ledger",fiat:"Fiat Ledger",crypto:"Crypto Ledger",clients:"B2B Corporate Clients",desks:"OTC Partner Desks",reports:"Reports",aum:"AUM Managed Assets",reconciliation:"Reconciliation",compliance:"KYC AML Monitoring",exports:"Export Center",audit:"Audit Trail",settings:"Settings"};
managementSidebar.id="management-sidebar";managementSidebar.querySelectorAll(".nav").forEach(button=>{const label=navLabels[button.dataset.view]||button.dataset.view,icon=navIcons[button.dataset.view]||"fi-rr-circle";button.setAttribute("title",label);button.setAttribute("aria-label",label);button.innerHTML=`<i class="fi ${icon}" aria-hidden="true"></i><span>${label}</span>`});managementBrand.insertAdjacentHTML("beforeend",'<button class="side-toggle" id="sidebar-toggle" type="button" aria-label="Collapse navigation" title="Collapse navigation"><i class="fi fi-rr-angle-double-left" aria-hidden="true"></i></button>');managementSidebar.insertAdjacentHTML("beforeend",'<a class="flaticon-credit" href="https://www.flaticon.com/uicons" target="_blank" rel="noreferrer">Icons by Flaticon</a>');
function setSidebarCollapsed(collapsed){managementShell.classList.toggle("sidebar-collapsed",collapsed);const toggle=document.querySelector("#sidebar-toggle");toggle.setAttribute("aria-label",collapsed?"Expand navigation":"Collapse navigation");toggle.setAttribute("title",collapsed?"Expand navigation":"Collapse navigation");toggle.innerHTML=`<i class="fi fi-rr-angle-double-${collapsed?"right":"left"}" aria-hidden="true"></i>`;try{localStorage.setItem("lbp-management-sidebar-collapsed",String(collapsed))}catch(error){}}
let managementSidebarCollapsed=false;try{managementSidebarCollapsed=localStorage.getItem("lbp-management-sidebar-collapsed")==="true"}catch(error){}setSidebarCollapsed(managementSidebarCollapsed);document.querySelector("#sidebar-toggle").onclick=()=>setSidebarCollapsed(!managementShell.classList.contains("sidebar-collapsed"));
const mobileMenuToggle=document.querySelector("#mobile-menu-toggle"),mobileSidebarBackdrop=document.querySelector("#mobile-sidebar-backdrop");
function setMobileNavigation(open){managementShell.classList.toggle("mobile-nav-open",open);mobileMenuToggle.setAttribute("aria-expanded",String(open));mobileMenuToggle.setAttribute("aria-label",open?"Close navigation":"Open navigation");}
mobileMenuToggle.onclick=()=>setMobileNavigation(!managementShell.classList.contains("mobile-nav-open"));
mobileSidebarBackdrop.onclick=()=>setMobileNavigation(false);
document.addEventListener("keydown",event=>{if(event.key==="Escape")setMobileNavigation(false)});
window.matchMedia("(min-width: 701px)").addEventListener("change",event=>{if(event.matches)setMobileNavigation(false)});
function setUsdIdrHeader(rate,label){const value=document.querySelector("#usd-idr-rate"),time=document.querySelector("#usd-idr-time");if(value)value.textContent=`1 USD = ${new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(rate).replace("Rp","Rp ")}`;if(time)time.textContent=label}
function title(name,sub,actions=""){return `<div class="heading"><div><h1>${name}</h1><p>${sub}</p></div><div class="toolbar">${actions}</div></div>`}
function controls(){return `<button class="chip active">Today</button><button class="chip">Daily</button><button class="chip">Weekly</button><button class="chip">Monthly</button><button class="chip">Since inception</button><select><option>IDR</option><option>USD</option></select><select><option>All assets</option><option>USDT</option><option>USDC</option><option>BTC</option></select>`}
function kpis(){const t=totals();return `<div class="kpis section"><div class="kpi"><label>OTC total volume</label><strong>${money(t.vol)}</strong><span>Ledger derived</span></div><div class="kpi"><label>Fiat IN</label><strong>${money(t.fiatIn)}</strong><span>Bank settled inflow</span></div><div class="kpi"><label>Fiat OUT</label><strong>${money(t.fiatOut)}</strong><span>Bank settled outflow</span></div><div class="kpi"><label>Crypto IN</label><strong>${t.cryptoIn.toLocaleString()} USDT</strong><span>Wallet ledger</span></div><div class="kpi"><label>Crypto OUT</label><strong>${t.cryptoOut.toLocaleString()} USDT</strong><span>Wallet ledger</span></div><div class="kpi"><label>Net brokerage revenue</label><strong>Rp 2.14 B</strong><span>Fee and spread</span></div><div class="kpi"><label>Managed assets AUM</label><strong>Rp 312.8 B</strong><span>Current IDR equivalent</span></div><div class="kpi"><label>Transactions</label><strong>${t.count}</strong><span>1 exception needs action</span></div></div>`}
function dashboardFlow(t){const usdtIn=ledger.filter(item=>item.asset==="USDT"&&item.cryptoIn>0).reduce((sum,item)=>sum+item.cryptoIn,0),usdtOut=ledger.filter(item=>item.asset==="USDT"&&item.cryptoOut>0).reduce((sum,item)=>sum+item.cryptoOut,0),usdcIn=ledger.filter(item=>item.asset==="USDC"&&item.cryptoIn>0).reduce((sum,item)=>sum+item.cryptoIn,0),btcIn=ledger.filter(item=>item.asset==="BTC"&&item.cryptoIn>0).reduce((sum,item)=>sum+item.cryptoIn,0),net=t.fiatIn-t.fiatOut;return `<section class="card dashboard-flow-card"><header class="dashboard-flow-head"><h2>OTC Flow Monitoring</h2><p>Fiat ⇄ Treasury ⇄ On-chain</p></header><div class="dashboard-flow-layout"><div class="dashboard-flow-stack"><article class="dashboard-flow-node"><i class="fi fi-rr-arrow-down-left dashboard-flow-icon" aria-hidden="true"></i><div><label>Bank IN</label><strong>${money(t.fiatIn)}</strong><small>RTGS · BI-FAST · SKNBI · SWIFT</small></div></article><article class="dashboard-flow-node"><i class="fi fi-rr-arrow-down-left dashboard-flow-icon" aria-hidden="true"></i><div><label>Crypto IN</label><strong>${usdtIn.toLocaleString()} USDT</strong><small>${usdcIn.toLocaleString()} USDC · ${btcIn.toFixed(4)} BTC</small></div></article></div><article class="dashboard-flow-core"><i class="fi fi-rr-building dashboard-flow-core-icon" aria-hidden="true"></i><h3>PT LBP Treasury Core</h3><strong>Rp 312.8 B</strong><p>Net Flow: <b>${money(net)}</b></p></article><div class="dashboard-flow-stack"><article class="dashboard-flow-node out"><i class="fi fi-rr-arrow-up-right dashboard-flow-icon" aria-hidden="true"></i><div><label>Bank OUT</label><strong>${money(t.fiatOut)}</strong><small>Settlement & payout</small></div></article><article class="dashboard-flow-node out"><i class="fi fi-rr-arrow-up-right dashboard-flow-icon" aria-hidden="true"></i><div><label>Crypto OUT</label><strong>${usdtOut.toLocaleString()} USDT</strong><small>Controlled on-chain settlement</small></div></article></div></div></section>`}
function partnerReferenceQuote(desk){if(!Number.isFinite(binanceQuoteState.bid)||!Number.isFinite(binanceQuoteState.ask))return{buy:Number(desk.buy)||0,sell:Number(desk.sell)||0};return{buy:Math.round(binanceQuoteState.bid),sell:Math.round(binanceQuoteState.ask)}}
function dashboardPartnerOverview(){if(!partnerDesks.length)return "";const rows=partnerDesks.map(desk=>{const liquidity=desk.liquidity||{},quote=partnerReferenceQuote(desk);return `<tr><td><span class="dashboard-exchange"><i class="fi fi-rr-building" aria-hidden="true"></i>${desk.name}</span></td><td class="quote buy">Rp ${quote.buy.toLocaleString()}</td><td class="quote sell">Rp ${quote.sell.toLocaleString()}</td><td class="funds">${Number(liquidity.usdt||0).toLocaleString()} USDT<small>${liquidity.idr?`Rp ${(liquidity.idr/1000000000).toFixed(2)} B IDR`:"—"}</small></td><td>${pill(desk.status||"Pending")}</td><td><a class="dashboard-partner-open" href="../partner-desk/?partner=${desk.id}">Open Desk →</a></td></tr>`}).join("");return `<section class="card dashboard-partners"><header><div><h2>Exchange Partner Desk Quotes & Available Funds</h2><p>${binanceQuoteState.source} · indicative reference only; confirm the executable quote with each partner.</p></div><span class="eyebrow">${partnerDesks.length} exchanges</span></header><div class="table-wrap"><table class="dashboard-partner-table"><thead><tr><th>Exchange</th><th>Buy Price</th><th>Sell Price</th><th>Available Funds</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`}function dashboard(){const t=totals();view.innerHTML=title("OTC Management Dashboard","Executive monitoring across the master transaction ledger.",controls())+kpis()+dashboardFlow(t)+dashboardPartnerOverview()+`<section class="card section"><div class="split"><div><h2>Recent master ledger transactions</h2><p class="sub">Click a transaction to inspect settlement, counterparty and compliance details.</p></div><button class="button ghost" data-go="ledger">Open ledger</button></div>${ledgerTable(ledger.slice(0,5))}</section><section class="card section dashboard-control-status"><h2>Control status</h2><p class="sub">Daily operating controls</p><div class="metric"><span>Bank reconciliation</span><b>99.1% ${pill("Reconciled")}</b></div><div class="metric"><span>Wallet reconciliation</span><b>99.7% ${pill("Reconciled")}</b></div><div class="metric"><span>KYC AML queue</span><b>02 ${pill("Review")}</b></div><div class="metric"><span>Open exceptions</span><b>01 ${pill("Exception")}</b></div></section>`;bindLedger()}function ledgerTable(data){return rows(["TX ID","Date time","Client","Type","Asset","IN","OUT","Rate","Desk","Status","KYC / AML"],data.map(r=>[txLink(r),r.date,r.client,pill(r.type.startsWith("Fiat")?"BUY":"SELL"),r.asset,r.fiatIn?`<span class="amount in">${money(r.fiatIn)}</span>`:`<span class="amount in">${r.cryptoIn.toLocaleString()} ${r.asset}</span>`,r.fiatOut?`<span class="amount out">${money(r.fiatOut)}</span>`:`<span class="amount out">${r.cryptoOut.toLocaleString()} ${r.asset}</span>`,r.rate.toLocaleString(),r.desk,pill(r.status),`${pill(r.kyc)} ${pill(r.aml)}`]))}
function ledgerKpis(records){const volumeValue=records.reduce((sum,r)=>sum+volume(r),0),fiatIn=records.reduce((sum,r)=>sum+r.fiatIn,0),fiatOut=records.reduce((sum,r)=>sum+r.fiatOut,0);return `<div class="ledger-kpis"><div class="kpi"><label>OTC total volume</label><strong>${money(volumeValue)}</strong></div><div class="kpi"><label>Fiat IN</label><strong>${money(fiatIn)}</strong></div><div class="kpi"><label>Fiat OUT</label><strong>${money(fiatOut)}</strong></div><div class="kpi"><label>Transaction count</label><strong>${records.length}</strong></div></div>`}
function ledgerView(){const options=values=>`<option value="">All</option>${values.map(value=>`<option value="${value}">${value}</option>`).join("")}`,clientOptions=[...new Set(ledger.map(r=>r.client))],deskOptions=[...new Set(ledger.map(r=>r.desk))],assetOptions=[...new Set(ledger.map(r=>r.asset))],typeOptions=[...new Set(ledger.map(r=>r.type))],statusOptions=[...new Set(ledger.map(r=>r.status))];view.innerHTML=title("Master Transaction Ledger","Single source of truth for all daily, weekly, monthly, AUM and export views.",`<button class="button green" id="export-ledger">Export CSV</button>`)+`<section class="card ledger-period-panel"><span class="eyebrow">Period</span><div class="ledger-period-switch" id="ledger-period"><button>Today</button><button>Weekly</button><button class="active">Monthly</button><button>Since Inception</button><button>Custom Range</button></div><div class="period-custom-range" id="ledger-period-range" hidden><label>From<input type="date"></label><label>To<input type="date"></label></div></section><section class="card ledger-filter-panel"><div class="ledger-filters"><label>Client<select id="client-filter">${options(clientOptions)}</select></label><label>Desk<select id="desk-filter">${options(deskOptions)}</select></label><label>Asset<select id="asset-filter">${options(assetOptions)}</select></label><label>Transaction type<select id="type-filter">${options(typeOptions)}</select></label><label>Settlement status<select id="status-filter">${options(statusOptions)}</select></label><label>KYC / AML<select id="compliance-filter"><option value="">All</option><option value="verified-clear">Verified / Clear</option><option value="review">Review</option><option value="hold">Hold</option></select></label><label class="search-filter">Search TX ID / Client / Bank Ref / TXID<input id="search" placeholder="OTC-2026..."></label></div></section><div id="ledger-kpis">${ledgerKpis(ledger)}</div><div class="ledger-summary"><strong id="ledger-count">${ledger.length} transactions</strong><button class="button ghost" id="reset-ledger">Reset filters</button></div><section class="card" id="ledger-results">${ledgerTable(ledger)}</section>`;bindLedger();bindPeriodControl("#ledger-period",filterLedger);["#search","#client-filter","#desk-filter","#asset-filter","#type-filter","#status-filter","#compliance-filter"].forEach(selector=>{const el=document.querySelector(selector);el.addEventListener(el.tagName==="INPUT"?"input":"change",filterLedger)});document.querySelector("#reset-ledger").onclick=()=>{["#search","#client-filter","#desk-filter","#asset-filter","#type-filter","#status-filter","#compliance-filter"].forEach(selector=>document.querySelector(selector).value="");filterLedger()};document.querySelector("#export-ledger").onclick=()=>exportCsv(periodRecords(ledger,document.querySelector("#ledger-period .active").textContent))}
function filterLedger(){const value=id=>document.querySelector(id).value,query=value("#search").toLowerCase(),client=value("#client-filter"),desk=value("#desk-filter"),asset=value("#asset-filter"),type=value("#type-filter"),status=value("#status-filter"),compliance=value("#compliance-filter"),period=value("#ledger-period .active")||"Monthly",range=document.querySelector("#ledger-period-range").querySelectorAll("input"),scoped=periodRecords(ledger,period,range[0].value,range[1].value);const found=scoped.filter(r=>{const complianceValue=`${r.kyc.toLowerCase()}-${r.aml.toLowerCase()}`;return(!query||Object.values(r).join(" ").toLowerCase().includes(query))&&(!client||r.client===client)&&(!desk||r.desk===desk)&&(!asset||r.asset===asset)&&(!type||r.type===type)&&(!status||r.status===status)&&(!compliance||complianceValue===compliance)});document.querySelector("#ledger-kpis").innerHTML=ledgerKpis(found);document.querySelector("#ledger-count").textContent=`${found.length} transactions`;document.querySelector("#ledger-results").innerHTML=found.length?ledgerTable(found):'<div class="empty">No matching transactions.</div>';bindLedger()}
function bindLedger(){document.querySelectorAll("[data-id]").forEach(el=>el.onclick=()=>detail(el.dataset.id));document.querySelectorAll("[data-go]").forEach(el=>el.onclick=()=>render(el.dataset.go))}
function clientCode(r){return `C${String(ledger.findIndex(item=>item.id===r.id)+10).padStart(3,"0")}`}
function operatorFor(r){return {"Desk 01":"Dewi Anggraini","Desk 02":"Siti Nurhaliza Putri","Desk 03":"Rizky Pratama","Desk 04":"Nadia Kusuma","Desk 05":"Fajar Aditya"}[r.desk]}
function counterpartyFor(r){return `${r.client} — ${operatorFor(r)}`}
function lpName(r){return {["LP-001"]:"LP-001 Wintermute",["LP-002"]:"LP-002 FalconX",["LP-003"]:"LP-003 Cumberland",["LP-004"]:"LP-004 Institutional Liquidity"}[r.lp]||r.lp}
function fullWalletAddress(r){const seed=(r.id.replace(/[^0-9a-f]/gi,"")+"8ca4a14fb498c500f34101246").toLowerCase();if(cryptoNetwork(r)==="BITCOIN")return `bc1q${seed.repeat(3).slice(0,38)}`;if(cryptoNetwork(r)==="TRC20")return `T${seed.toUpperCase().repeat(3).slice(0,33)}`;return `0x${seed.repeat(3).slice(0,40)}`}
function fullBlockchainHash(r){const seed=(r.id.replace(/[^0-9a-f]/gi,"")+"e9638bbfaade234212e7da4856bdc21227dbf109d021dd3e193cd718d7b924").toLowerCase();const hash=seed.repeat(4).slice(0,64);return cryptoNetwork(r)==="ERC20"?`0x${hash}`:hash}
function explorerUrl(r){const hash=fullBlockchainHash(r);return cryptoNetwork(r)==="TRC20"?`https://tronscan.org/#/transaction/${hash}`:cryptoNetwork(r)==="BITCOIN"?`https://mempool.space/tx/${hash}`:`https://etherscan.io/tx/${hash}`}
function tokenContract(r){if(r.asset==="BTC")return "Native Bitcoin asset";if(r.asset==="USDC")return cryptoNetwork(r)==="TRC20"?"USDC TRC20": "USDC ERC20 · 0xA0b8…eB48";return cryptoNetwork(r)==="TRC20"?"USDT TRC20 · TR7NHq…8q8" : "USDT ERC20 · 0xdAC1…31ec7"}
function settlementFinality(r){return r.status==="Settled"||r.status==="Reconciled"?"Final":"Awaiting settlement control"}
function detail(id){const r=ledger.find(x=>x.id===id)||fiatRecords().find(x=>x.id===id)||cryptoRecords().find(x=>x.id===id);if(!r)return;const fiatAmount=r.fiatIn||r.fiatOut,crypto=cryptoAmount(r),direction=r.fiatIn>0?"IN":"OUT",order=(r.type||"").startsWith("Fiat")?"BUY":"SELL",spread="0.28%",fee="0.20%",revenue=Math.round(fiatAmount*.0028),network=cryptoNetwork(r),status=pill(r.status),hash=fullBlockchainHash(r);modal.hidden=false;modal.innerHTML=`<article class="dialog transaction-dialog" role="dialog" aria-modal="true" aria-label="Transaction detail ${r.id}"><header class="dialog-head"><div><h2>${r.id}</h2><p class="sub">Transaction Detail</p></div><div class="dialog-actions">${status}<button class="close" id="close" aria-label="Close transaction detail">×</button></div></header><div class="settlement-legs"><section><label>Fiat leg</label><strong>${money(fiatAmount)}</strong><span>${direction} · ${fiatRail(r)}</span></section><section><label>Crypto leg</label><strong>${crypto.toLocaleString()} ${r.asset}</strong><span>${cryptoDirection(r)} · ${network}</span></section></div><dl class="detail-list">${[["Date / time",`${r.date} WIB`],["Client",`${r.client} (${clientCode(r)})`],["Counterparty",counterpartyFor(r)],["Type",`${pill(order)} ${r.type||"Settlement leg"}`],["Rate",`IDR ${(r.rate||0).toLocaleString()} / ${r.asset}`],["Broker spread",spread],["Broker fee",fee],["Broker revenue",money(revenue)],["Desk",r.desk],["Liquidity provider",lpName(r)],["Bank",bankName(r)],["Bank reference",r.bank],["Network",network],["Token contract",tokenContract(r)],["Wallet address",`<code>${fullWalletAddress(r)}</code>`],["Blockchain TXID",`<a class="hash-link" href="${explorerUrl(r)}" target="_blank" rel="noreferrer">${hash} ↗</a>`],["Confirmations",cryptoConfirmations(r)],["Settlement finality",settlementFinality(r)],["Wallet screening",r.aml==="Clear"?pill("Clear"):pill(r.aml)],["KYC / AML",`${pill(r.kyc)} ${pill(r.aml)}`],["Operator",operatorFor(r)]].map(x=>`<div><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`).join("")}</dl><footer class="dialog-footer"><button class="button ghost" id="close-footer">Close</button><button class="button" id="voucher">⇩ Download Transaction Voucher</button></footer></article>`;const close=()=>modal.hidden=true;document.querySelector("#close").onclick=close;document.querySelector("#close-footer").onclick=close;document.querySelector("#voucher").onclick=()=>alert(`Transaction voucher prepared for ${r.id}.`);modal.onclick=event=>{if(event.target===modal)close()}}
function bankName(r){if(r.bank&&!["—", ""].includes(r.bank)&&!r.bank.startsWith("MDR")&&!r.bank.startsWith("BCA")&&!r.bank.startsWith("BRI"))return r.bank;return r.bank&&r.bank.startsWith("MDR")?"Bank Mandiri":r.bank&&r.bank.startsWith("BCA")?"Bank BCA":r.bank&&r.bank.startsWith("BRI")?"Bank BRI":"Bank BNI"}
function fiatRail(r){return r.rail|| (r.bank&&r.bank.startsWith("BCA")?"BI-FAST":r.bank&&r.bank.startsWith("WIRE")?"SWIFT":r.bank&&r.bank.startsWith("BRI")?"RTGS":"RTGS")}
function fiatKpis(records){const fiatIn=records.reduce((sum,r)=>sum+r.fiatIn,0),fiatOut=records.reduce((sum,r)=>sum+r.fiatOut,0),net=fiatIn-fiatOut;return `<div class="ledger-kpis fiat-kpis"><div class="kpi"><label>Fiat IN</label><strong>${money(fiatIn)}</strong></div><div class="kpi"><label>Fiat OUT</label><strong>${money(fiatOut)}</strong></div><div class="kpi"><label>Net flow</label><strong>${money(net)}</strong></div><div class="kpi"><label>Transaction count</label><strong>${records.length}</strong></div></div>`}
function fiatBankTable(records){const banks=["Bank Mandiri","Bank BCA","Bank BNI","Bank BRI"].map(bank=>{const group=records.filter(r=>bankName(r)===bank),fiatIn=group.reduce((sum,r)=>sum+r.fiatIn,0),fiatOut=group.reduce((sum,r)=>sum+r.fiatOut,0);return[bank,String(group.length),money(fiatIn),money(fiatOut),money(fiatIn-fiatOut)]});return rows(["Bank","Transactions","IN","OUT","Net flow"],banks)}
function fiatTransactionTable(records){return rows(["TX ID","Date / time","Client","IN / OUT","Amount","IDR","Bank","Rail","Bank reference","KYC / AML","Status"],records.map(r=>{const amount=r.fiatIn||r.fiatOut,direction=r.fiatIn>0?"in":"out";return[txLink(r),r.date,r.client,`<span class="direction ${direction}">${direction.toUpperCase()}</span>`,`<span class="amount ${direction}">IDR ${amount.toLocaleString("id-ID")}</span>`,`<span class="amount ${direction}">${money(amount)}</span>`,bankName(r),fiatRail(r),r.bank,`${pill(r.kyc)} ${pill(r.aml)}`,pill(r.status)]}))}
function fiatTransactions(records){return `<section class="card fiat-transactions"><div class="section-title"><span>Fiat Ledger</span><small>${records.length} transactions</small></div><div id="fiat-transaction-results">${fiatTransactionTable(records)}</div></section>`}
const fiatRecords=()=>window.LBPManagementLiveLegs?.fiat||[];
function fiatView(){const records=fiatRecords();view.innerHTML=title("Fiat Ledger","RTGS · BI-FAST · SKNBI · SWIFT",`<button class="button ghost" id="fiat-csv">⇩ CSV</button>`)+`<section class="card fiat-filter-panel"><div class="fiat-filters"><div><span class="eyebrow">Period</span><div class="period-switch" id="fiat-period"><button>Today</button><button>Weekly</button><button class="active">Monthly</button><button>Since Inception</button><button>Custom Range</button></div><div class="period-custom-range" id="fiat-period-range" hidden><label>From<input type="date"></label><label>To<input type="date"></label></div></div><label>Rail<select id="rail-filter"><option value="">All</option><option>RTGS</option><option>BI-FAST</option><option>SKNBI</option><option>SWIFT</option></select></label><label>IN / OUT<select id="fiat-direction"><option value="">All</option><option value="in">IN</option><option value="out">OUT</option></select></label></div></section><div id="fiat-kpis">${fiatKpis(records)}</div><section class="card fiat-breakdown"><div class="section-title">Bank Breakdown</div><div id="fiat-results">${fiatBankTable(records)}</div></section>${fiatTransactions(records)}`;bindPeriodControl("#fiat-period",filterFiat);document.querySelector("#rail-filter").onchange=filterFiat;document.querySelector("#fiat-direction").onchange=filterFiat;document.querySelector("#fiat-csv").onclick=()=>exportCsv(periodRecords(fiatRecords(),document.querySelector("#fiat-period .active").textContent));bindLedger()}
function filterFiat(){const rail=document.querySelector("#rail-filter").value,direction=document.querySelector("#fiat-direction").value,period=document.querySelector("#fiat-period .active").textContent,range=document.querySelector("#fiat-period-range").querySelectorAll("input"),found=periodRecords(fiatRecords(),period,range[0].value,range[1].value).filter(r=>(!rail||fiatRail(r)===rail)&&(!direction||(direction==="in"?r.fiatIn>0:r.fiatOut>0)));document.querySelector("#fiat-kpis").innerHTML=fiatKpis(found);document.querySelector("#fiat-results").innerHTML=fiatBankTable(found);document.querySelector(".fiat-transactions").outerHTML=fiatTransactions(found);bindLedger()}
function cryptoNetwork(r){if(r.network)return r.network;if(r.asset==="BTC")return "BITCOIN";if(r.asset==="USDC")return "ERC20";return r.id.endsWith("17")?"ERC20":"TRC20"}
function cryptoAddress(r){if(r.walletAddress&&r.walletAddress!=="—")return r.walletAddress;const network=cryptoNetwork(r);if(network==="BITCOIN")return "bc1q0dbfa1…0c0424";if(network==="TRC20")return "T"+(r.id.replace(/[^0-9]/g,"")+"B635A7D85").slice(0,14)+"…101246";return "0x"+(r.id.replace(/[^0-9]/g,"")+"8ebf5095").slice(0,14)+"…364d3d"}
function cryptoConfirmations(r){return Number.isFinite(r.confirmations)&&r.confirmations>0?String(r.confirmations):(r.status==="Processing"?"0":r.status==="Pending"?"5":r.status==="Exception"?"0":"12")}
function cryptoDirection(r){return r.cryptoIn>0?"IN":"OUT"}
function cryptoAmount(r){return r.cryptoIn||r.cryptoOut}
function cryptoKpis(records){const usdtIn=records.filter(r=>r.asset==="USDT"&&r.cryptoIn>0).reduce((sum,r)=>sum+r.cryptoIn,0),usdtOut=records.filter(r=>r.asset==="USDT"&&r.cryptoOut>0).reduce((sum,r)=>sum+r.cryptoOut,0),usdcIn=records.filter(r=>r.asset==="USDC"&&r.cryptoIn>0).reduce((sum,r)=>sum+r.cryptoIn,0),btcIn=records.filter(r=>r.asset==="BTC"&&r.cryptoIn>0).reduce((sum,r)=>sum+r.cryptoIn,0);return `<div class="ledger-kpis crypto-kpis"><div class="kpi"><label>Crypto IN (USDT)</label><strong>${usdtIn.toLocaleString()} USDT</strong><span>${money(usdtIn*15850)}</span></div><div class="kpi"><label>Crypto OUT (USDT)</label><strong>${usdtOut.toLocaleString()} USDT</strong><span>${money(usdtOut*15850)}</span></div><div class="kpi"><label>USDC / BTC IN</label><strong>${usdcIn.toLocaleString()} USDC</strong><span>${btcIn.toFixed(4)} BTC</span></div><div class="kpi"><label>Transaction count</label><strong>${records.length}</strong><span>On-chain legs</span></div></div>`}
function cryptoTable(records){return rows(["TX ID","Date / time","Client","IN / OUT","Asset","Amount","Network","Wallet address","Blockchain TXID","Confirmations","KYC / AML","Status"],records.map(r=>{const direction=cryptoDirection(r).toLowerCase();return[txLink(r),r.date,r.client,`<span class="direction ${direction}">${direction.toUpperCase()}</span>`,r.asset,`<span class="amount ${direction}">${cryptoAmount(r).toLocaleString()} ${r.asset}</span>`,cryptoNetwork(r),cryptoAddress(r),r.txid,cryptoConfirmations(r),`${pill(r.kyc)} ${pill(r.aml)}`,pill(r.status)]}))}
function cryptoTransactions(records){return `<section class="card crypto-transactions"><div class="section-title"><span>Crypto Ledger</span><small>${records.length} on-chain legs</small></div><div id="crypto-transaction-results">${cryptoTable(records)}</div></section>`}
const cryptoRecords=()=>window.LBPManagementLiveLegs?.crypto||[];
function cryptoView(){const records=cryptoRecords();view.innerHTML=title("Crypto Ledger","TRC20 · ERC20 · BEP20 · BTC",`<button class="button ghost" id="crypto-csv">⇩ CSV</button>`)+`<section class="card crypto-filter-panel"><div class="crypto-filters"><div><span class="eyebrow">Period</span><div class="period-switch" id="crypto-period"><button>Today</button><button>Weekly</button><button class="active">Monthly</button><button>Since Inception</button><button>Custom Range</button></div><div class="period-custom-range" id="crypto-period-range" hidden><label>From<input type="date"></label><label>To<input type="date"></label></div></div><label>Asset<select id="crypto-asset"><option value="">All</option><option>USDT</option><option>USDC</option><option>BTC</option></select></label><label>Network<select id="crypto-network"><option value="">All</option><option>TRC20</option><option>ERC20</option><option>BITCOIN</option></select></label></div></section><div id="crypto-kpis">${cryptoKpis(records)}</div>${cryptoTransactions(records)}`;bindPeriodControl("#crypto-period",filterCrypto);document.querySelector("#crypto-asset").onchange=filterCrypto;document.querySelector("#crypto-network").onchange=filterCrypto;document.querySelector("#crypto-csv").onclick=()=>exportCsv(periodRecords(cryptoRecords(),document.querySelector("#crypto-period .active").textContent));bindLedger()}
function filterCrypto(){const asset=document.querySelector("#crypto-asset").value,network=document.querySelector("#crypto-network").value,period=document.querySelector("#crypto-period .active").textContent,range=document.querySelector("#crypto-period-range").querySelectorAll("input"),found=periodRecords(cryptoRecords(),period,range[0].value,range[1].value).filter(r=>(!asset||r.asset===asset)&&(!network||cryptoNetwork(r)===network));document.querySelector("#crypto-kpis").innerHTML=cryptoKpis(found);document.querySelector(".crypto-transactions").outerHTML=cryptoTransactions(found);bindLedger()}
const corporateDirectory=[
 {id:"C001",name:"PT Arta Nusantara Digital",tier:"Corporate",transactions:22,volume:189160000000,netFlow:215170000, revenue:1260000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C002",name:"Garuda Capital Partners",tier:"Institutional Fund",transactions:19,volume:154790000000,netFlow:25820000000,revenue:1090000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C003",name:"PT Sentra Bayar Lintas",tier:"Payment Gateway",transactions:24,volume:233230000000,netFlow:34860000000,revenue:1820000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C004",name:"Meridian Asset Management",tier:"Institutional Fund",transactions:25,volume:235420000000,netFlow:29640000000,revenue:1760000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C005",name:"PT Samudra Logistik Global",tier:"Corporate",transactions:41,volume:405560000000,netFlow:52220000000,revenue:2940000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C006",name:"PT Nusantara Remit Teknologi",tier:"Payment Gateway",transactions:34,volume:273780000000,netFlow:53840000000,revenue:1860000000,kyc:"Verified",aml:"Review",status:"Active"},
 {id:"C007",name:"Batavia Treasury Fund",tier:"Institutional Fund",transactions:28,volume:178110000000,netFlow:35390000000,revenue:1250000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C008",name:"PT Cakrawala Energi Prima",tier:"Corporate",transactions:19,volume:210680000000,netFlow:41900000000,revenue:1450000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C009",name:"Straits Digital Ventures",tier:"Institutional Fund",transactions:17,volume:160900000000,netFlow:16090000000,revenue:1130000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C010",name:"PT Mitra Dagang Sejahtera",tier:"Corporate",transactions:21,volume:246300000000,netFlow:12370000000,revenue:1710000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C011",name:"Kencana Asset Mandiri",tier:"Institutional Fund",transactions:18,volume:228740000000,netFlow:-18500000000,revenue:1600000000,kyc:"Verified",aml:"Review",status:"Review"},
 {id:"C012",name:"PT Kirana Payment Solusi",tier:"Payment Gateway",transactions:16,volume:192120000000,netFlow:27400000000,revenue:1340000000,kyc:"Verified",aml:"Clear",status:"Active"},
 {id:"C013",name:"Sarana Niaga Digital",tier:"Corporate",transactions:14,volume:154950000000,netFlow:-9100000000,revenue:1080000000,kyc:"Pending",aml:"Hold",status:"Hold"},
 {id:"C014",name:"PT Trans Pasifik Ekspor",tier:"Corporate",transactions:15,volume:218260000000,netFlow:-12970000000,revenue:1530000000,kyc:"Pending",aml:"Clear",status:"Review"}
];
const clientProfiles={
 C001:{pic:"Dimas Prayoga",bank:"Bank Mandiri",country:"Indonesia",onboarded:"Feb 11, 2025"},
 C002:{pic:"Alvin Pratama",bank:"Bank BCA",country:"Indonesia",onboarded:"Mar 02, 2025"},
 C003:{pic:"Nadia Kurniawan",bank:"Bank BRI",country:"Indonesia",onboarded:"Jan 20, 2025"},
 C004:{pic:"Fajar Wijaya",bank:"DBS Indonesia",country:"Indonesia",onboarded:"Apr 18, 2025"},
 C005:{pic:"Raka Santoso",bank:"Bank Mandiri",country:"Indonesia",onboarded:"May 09, 2025"},
 C006:{pic:"Melati Kusuma",bank:"Bank BCA",country:"Indonesia",onboarded:"Jun 01, 2025"},
 C007:{pic:"Aditya Putra",bank:"DBS Singapore",country:"Singapore",onboarded:"Jun 23, 2025"},
 C008:{pic:"Citra Lestari",bank:"Bank BNI",country:"Indonesia",onboarded:"Jul 14, 2025"},
 C009:{pic:"Evan Prakoso",bank:"DBS Singapore",country:"Singapore",onboarded:"Aug 05, 2025"},
 C010:{pic:"Siti Nurhaliza Putri",bank:"Bank Mandiri",country:"Indonesia",onboarded:"Jan 12, 2026"},
 C011:{pic:"Wahyu Hidayat",bank:"Bank BCA",country:"Indonesia",onboarded:"Feb 18, 2026"},
 C012:{pic:"Rina Kartika",bank:"Bank BRI",country:"Indonesia",onboarded:"Mar 09, 2026"},
 C013:{pic:"Bima Arya",bank:"Bank Mandiri",country:"Indonesia",onboarded:"Apr 21, 2026"},
 C014:{pic:"Gina Prameswari",bank:"Bank BCA",country:"Indonesia",onboarded:"May 27, 2026"}
};
const clientAmount=value=>`Rp ${(value/1000000000).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} B`;
const clientRevenue=value=>`Rp ${(value/1000000000).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} B`;
function clientKpis(){const verified=corporateDirectory.filter(client=>client.kyc==="Verified").length,flagged=corporateDirectory.filter(client=>client.aml!=="Clear").length,volume=corporateDirectory.reduce((sum,client)=>sum+client.volume,0);return `<div class="kpis client-kpis"><div class="kpi"><label>B2B / Corporate Clients</label><strong>${corporateDirectory.length}</strong></div><div class="kpi"><label>KYC Verified</label><strong>${verified} / ${corporateDirectory.length}</strong></div><div class="kpi"><label>OTC Total Volume</label><strong>Rp ${(volume/1000000000000).toFixed(2)} T</strong></div><div class="kpi"><label>AML Flagged</label><strong>${flagged}</strong></div></div>`}
function corporateRows(records){return `<div class="table-wrap"><table class="client-table"><thead><tr><th>Client ID</th><th>Client</th><th>Tier</th><th>Transactions</th><th>Volume</th><th>Net Flow</th><th>Revenue</th><th>KYC / AML</th><th>Status</th><th></th></tr></thead><tbody>${records.map(client=>`<tr><td class="client-id">${client.id}</td><td><span class="client-name"><i class="fi fi-rr-building" aria-hidden="true"></i>${client.name}</span></td><td class="client-tier">${client.tier}</td><td class="client-number">${client.transactions}</td><td class="client-number">${clientAmount(client.volume)}</td><td class="client-flow ${client.netFlow<0?"report-negative":""}">${clientAmount(client.netFlow)}</td><td class="client-revenue">${clientRevenue(client.revenue)}</td><td>${pill(client.kyc)} ${pill(client.aml)}</td><td>${pill(client.status)}</td><td><button class="client-dossier" type="button" data-client-id="${client.id}">View Dossier</button></td></tr>`).join("")}</tbody></table></div>`}
function clientsView(){view.innerHTML=title("B2B / Corporate Clients",`${corporateDirectory.length} institutional counterparties`,`<button class="button client-heading-action" id="add-corporate-client">+ Add Corporate Client</button>`)+clientKpis()+`<section class="card client-directory"><div class="client-filters"><label>Tier<select id="client-tier-filter"><option value="">All</option>${[...new Set(corporateDirectory.map(client=>client.tier))].map(tier=>`<option value="${tier}">${tier}</option>`).join("")}</select></label><label>KYC / AML<select id="client-compliance-filter"><option value="">All</option><option value="verified-clear">Verified / Clear</option><option value="review">Review</option><option value="hold">Hold</option><option value="pending">Pending</option></select></label><label>Client<input id="client-search" placeholder="C001 / PT ..."></label></div><div id="corporate-results">${corporateRows(corporateDirectory)}</div></section>`;document.querySelector("#client-tier-filter").onchange=filterCorporateClients;document.querySelector("#client-compliance-filter").onchange=filterCorporateClients;document.querySelector("#client-search").oninput=filterCorporateClients;document.querySelector("#add-corporate-client").onclick=openCorporateClientForm;bindCorporateDossiers()}
function filterCorporateClients(){const tier=document.querySelector("#client-tier-filter").value,compliance=document.querySelector("#client-compliance-filter").value,query=document.querySelector("#client-search").value.toLowerCase();const records=corporateDirectory.filter(client=>{const complianceValue=`${client.kyc.toLowerCase()}-${client.aml.toLowerCase()}`;return(!tier||client.tier===tier)&&(!compliance||complianceValue===compliance||client.kyc.toLowerCase()===compliance||client.aml.toLowerCase()===compliance)&&(!query||Object.values(client).join(" ").toLowerCase().includes(query))});document.querySelector("#corporate-results").innerHTML=corporateRows(records);bindCorporateDossiers()}
function bindCorporateDossiers(){document.querySelectorAll("[data-client-id]").forEach(button=>button.onclick=()=>openClientDossier(button.dataset.clientId))}
function openClientDossier(id){const client=corporateDirectory.find(item=>item.id===id),profile=clientProfiles[id]||{pic:"—",bank:"—",country:"Indonesia",onboarded:"—"};if(!client)return;const recent=ledger.filter(item=>item.client===client.name).slice(0,3);const recentRows=(recent.length?recent:[{id:"OTC-20260909-0387",asset:"BTC",status:"Settled",fiatIn:0,fiatOut:7194805586,cryptoIn:4.1863,cryptoOut:0},{id:"OTC-20260909-0386",asset:"USDT",status:"Reconciled",fiatIn:7534754000,fiatOut:0,cryptoIn:0,cryptoOut:463000},{id:"OTC-20260903-0380",asset:"USDT",status:"Reconciled",fiatIn:10480000000,fiatOut:0,cryptoIn:0,cryptoOut:644000}]).map(item=>{const amount=item.fiatIn||item.fiatOut?clientAmount(item.fiatIn||item.fiatOut):`${Number(item.cryptoIn||item.cryptoOut||0).toLocaleString()} ${item.asset}`;return `<tr><td class="dossier-tx">${item.id}</td><td>${item.asset}</td><td class="dossier-amount">${amount}</td><td>${pill(item.status)}</td></tr>`}).join("");modal.hidden=false;modal.innerHTML=`<article class="dialog client-dialog client-dossier-dialog" role="dialog" aria-modal="true" aria-label="Client dossier ${client.name}"><header class="dialog-head"><h2>${client.name}</h2><button class="close" id="close-client" aria-label="Close dossier">×</button></header><div class="client-dossier-content"><div class="dossier-kpis"><div><label>Volume</label><strong>${clientAmount(client.volume)}</strong></div><div><label>Net flow</label><strong class="${client.netFlow<0?"report-negative":""}">${clientAmount(client.netFlow)}</strong></div><div><label>Transactions</label><strong>${client.transactions}</strong></div></div><dl class="dossier-facts">${[["Client ID",client.id],["Tier",client.tier],["PIC",profile.pic],["Bank",profile.bank],["Country",profile.country],["Onboarded",profile.onboarded],["KYC / AML",`${pill(client.kyc)} ${pill(client.aml)}`],["Status",pill(client.status)]].map(item=>`<div><dt>${item[0]}</dt><dd>${item[1]}</dd></div>`).join("")}</dl><section class="dossier-transactions"><h3>Recent transactions</h3><div class="table-wrap"><table><thead><tr><th>TX ID</th><th>Asset</th><th>Amount</th><th>Status</th></tr></thead><tbody>${recentRows}</tbody></table></div></section></div><footer class="dialog-footer"><button class="button ghost" id="close-client-footer">Close</button></footer></article>`;const close=()=>modal.hidden=true;document.querySelector("#close-client").onclick=close;document.querySelector("#close-client-footer").onclick=close;modal.onclick=event=>{if(event.target===modal)close()}}function openCorporateClientForm(){modal.hidden=false;modal.innerHTML=`<article class="dialog client-dialog" role="dialog" aria-modal="true" aria-label="Add corporate client"><header class="dialog-head"><div><h2>Add Corporate Client</h2><p class="sub">Local preview record</p></div><button class="close" id="close-client-form" aria-label="Close form">×</button></header><form class="client-form" id="corporate-client-form"><label>Entity name<input name="name" required placeholder="PT Example Indonesia"></label><label>Tier<select name="tier"><option>Corporate</option><option>Institutional Fund</option><option>Payment Gateway</option></select></label><label>KYC status<select name="kyc"><option>Pending</option><option>Verified</option></select></label><div class="client-form-actions"><button class="button ghost" type="button" id="cancel-client-form">Cancel</button><button class="button" type="submit">Add Client</button></div></form></article>`;const close=()=>modal.hidden=true;document.querySelector("#close-client-form").onclick=close;document.querySelector("#cancel-client-form").onclick=close;document.querySelector("#corporate-client-form").onsubmit=event=>{event.preventDefault();const values=new FormData(event.currentTarget);corporateDirectory.push({id:`C${String(corporateDirectory.length+1).padStart(3,"0")}`,name:values.get("name"),tier:values.get("tier"),transactions:0,volume:0,netFlow:0,revenue:0,kyc:values.get("kyc"),aml:"Review",status:"Review"});close();clientsView()};modal.onclick=event=>{if(event.target===modal)close()}}
const bankReconciliation=[
 {key:"mandiri",account:"Bank Mandiri — 1220004455901 (Operational IDR)",expected:184250000000,actual:184250000000},
 {key:"bca",account:"Bank BCA — 5480998877 (Settlement IDR)",expected:96400000000,actual:96400000000},
 {key:"bri",account:"Bank BRI — 002401000556307 (Client Escrow IDR)",expected:37800000000,actual:37795500000},
 {key:"dbs",account:"DBS Singapore — 0072-118934 (USD Wire)",expected:4150000,actual:4150000}
];
const walletReconciliation=[
 {key:"usdt-trc",wallet:"USDT TRC20 — TQ5nRmWy3fTgXbLh9dK2vAeF7pMz8cR4Nu",asset:"USDT",expected:12640000,actual:12640000},
 {key:"usdt-erc",wallet:"USDT ERC20 — 0x9f42ab7e5c1d83b06fa254e9cd71b08e3a5d6c11",asset:"USDT",expected:5780000,actual:5777500},
 {key:"usdc-erc",wallet:"USDC ERC20 — 0x3c18de94ba7f205c6e1d90aa4b73f2016d8e5a27",asset:"USDC",expected:6180000,actual:6180000},
 {key:"btc-cold",wallet:"BTC Cold — bc1q7ktp0294ndzw8u5vkq0ye7m3r6asxgl2j9hf4",asset:"BTC",expected:62.4,actual:62.4}
];
const reconciliationIncidents=[
 {id:"EXC-2026-0041",timestamp:"Sep 15, 2026",scope:"Bank",account:"Bank BRI — 002401000556307 (Client Escrow IDR)",difference:4500000,severity:"Medium",status:"Investigating",owner:"Finance / Treasury — Yudha Anggara",note:"Selisih Rp 4.500.000 diduga biaya RTGS belum dibukukan. Menunggu rekening koran BRI.",target:"bri"},
 {id:"EXC-2026-0040",timestamp:"Sep 12, 2026",scope:"Wallet",account:"USDT ERC20 — 0x9f42ab7e5c1d83…",difference:2500,severity:"High",status:"Open",owner:"Treasury Ops — Melinda Sari",note:"2.500 USDT gas & bridge fee belum tercatat pada ledger crypto.",target:"usdt-erc"},
 {id:"EXC-2026-0038",timestamp:"Aug 28, 2026",scope:"Bank",account:"Bank BCA — 5480998877 (Settlement IDR)",difference:0,severity:"Low",status:"Resolved",owner:"Finance / Treasury — Yudha Anggara",note:"Selisih timing BI-FAST H-1, telah terealisasi dan reconciled.",target:"bca"}
];
const reconMoney=value=>money(value);const reconWalletAmount=(value,asset)=>asset==="BTC"?`${Number(value).toFixed(4)} BTC`:`${Number(value).toLocaleString()} ${asset}`;const reconBadge=value=>`<span class="recon-badge ${String(value).toLowerCase().replace(/\s/g,"-")}">${value}</span>`;
function reconciliationView(){const bankDone=bankReconciliation.filter(item=>item.expected===item.actual).length,walletDone=walletReconciliation.filter(item=>item.expected===item.actual).length,activeIncidents=reconciliationIncidents.filter(item=>item.status!=="Resolved"),resolved=reconciliationIncidents.filter(item=>item.status==="Resolved");const bankRows=bankReconciliation.map(item=>{const difference=item.expected-item.actual,isException=difference!==0;return `<tr><td>${item.account}</td><td class="mono">${reconMoney(item.expected)}</td><td class="mono">${reconMoney(item.actual)}</td><td class="mono difference ${isException?"exception":""}">${reconMoney(difference)}</td><td>${reconBadge(isException?"Exception":"Reconciled")}</td></tr>`}).join(""),walletRows=walletReconciliation.map(item=>{const difference=item.expected-item.actual,isException=difference!==0;return `<tr><td>${item.wallet}</td><td class="mono">${reconWalletAmount(item.expected,item.asset)}</td><td class="mono">${reconWalletAmount(item.actual,item.asset)}</td><td class="mono difference ${isException?"exception":""}">${reconWalletAmount(difference,item.asset)}</td><td>${reconBadge(isException?"Exception":"Reconciled")}</td></tr>`}).join(""),incidentRows=reconciliationIncidents.map(item=>`<tr><td class="mono">${item.id}</td><td>${item.timestamp}</td><td class="scope">${item.scope}</td><td>${item.account}</td><td class="mono difference ${item.difference?"exception":""}">${item.scope==="Bank"?reconMoney(item.difference):`${item.difference.toLocaleString()} USDT`}</td><td>${reconBadge(item.severity)}</td><td>${reconBadge(item.status)}</td><td>${item.owner}</td><td>${item.status==="Resolved"?"—":`<div class="recon-actions"><button class="recon-action" data-recon-action="investigate" data-incident="${item.id}">Investigate</button><button class="recon-action primary" data-recon-action="reverse" data-incident="${item.id}">Approve Reversal</button></div>`}</td></tr>`).join("");view.innerHTML=title("Reconciliation","Bank Reconciliation · On-chain Wallet Reconciliation")+`<div class="kpis reconciliation-kpis"><div class="kpi"><label>Bank Reconciliation</label><strong>${bankDone} / ${bankReconciliation.length}</strong><span>Reconciled</span></div><div class="kpi"><label>On-chain Wallet Reconciliation</label><strong>${walletDone} / ${walletReconciliation.length}</strong><span>Reconciled</span></div><div class="kpi"><label>Exception / Incident Log</label><strong>${activeIncidents.length}</strong><span>Open controls</span></div><div class="kpi"><label>Resolved</label><strong>${resolved.length}</strong><span>Closed with evidence</span></div></div><section class="card reconciliation-card"><header><h2>Bank Reconciliation</h2></header><div class="table-wrap"><table class="reconciliation-table"><thead><tr><th>Bank</th><th>Expected Ledger Balance</th><th>Actual Balance</th><th>Difference</th><th>Status</th></tr></thead><tbody>${bankRows}</tbody></table></div></section><section class="card reconciliation-card"><header><h2>On-chain Wallet Reconciliation</h2></header><div class="table-wrap"><table class="reconciliation-table"><thead><tr><th>Wallet</th><th>Expected Ledger Balance</th><th>Actual Balance</th><th>Difference</th><th>Status</th></tr></thead><tbody>${walletRows}</tbody></table></div></section><section class="card reconciliation-card"><header><h2>Exception / Incident Log</h2><p>No permanent deletion. Use Void / Cancel / Reversal with reason and approval.</p></header><div class="table-wrap"><table class="reconciliation-table"><thead><tr><th>ID</th><th>Timestamp</th><th>Scope</th><th>Account</th><th>Difference</th><th>Severity</th><th>Status</th><th>Owner</th><th></th></tr></thead><tbody>${incidentRows}</tbody></table></div><div class="recon-notes">${reconciliationIncidents.map(item=>`<span><b>${item.id}</b> — ${item.note}</span>`).join("")}</div></section>`;document.querySelectorAll("[data-recon-action]").forEach(button=>button.onclick=()=>updateReconciliationIncident(button.dataset.incident,button.dataset.reconAction))}
function updateReconciliationIncident(id,action){const incident=reconciliationIncidents.find(item=>item.id===id);if(!incident)return;if(action==="investigate"){incident.status="Investigating";incident.owner="Treasury Investigation Queue";incident.note="Investigation opened locally. Awaiting supporting settlement evidence."}else{const collection=incident.scope==="Bank"?bankReconciliation:walletReconciliation,target=collection.find(item=>item.key===incident.target);if(target)target.actual=target.expected;incident.difference=0;incident.status="Resolved";incident.note="Approved reversal recorded locally; expected and actual balances are reconciled."}reconciliationView()}
const kycOnboarded=["Feb 11, 2025","Mar 02, 2025","Jan 20, 2025","Apr 18, 2025","May 09, 2025","Jun 01, 2025","Jun 23, 2025","Jul 14, 2025","Aug 05, 2025","Jan 12, 2026","Feb 28, 2026","Mar 16, 2026","Apr 08, 2026","May 21, 2026"];
const amlAlerts=[
 {id:"OTC-20260916-0394",date:"Sep 16, 2026 11:59",client:"PT Nusantara Remit Teknologi",amount:"Rp 2.09 B",asset:"USDT",aml:"Review",kyc:"Verified",status:"Processing"},
 {id:"OTC-20260916-0396",date:"Sep 16, 2026 09:31",client:"PT Mitra Dagang Sejahtera",amount:"Rp 7.80 B",asset:"USDT",aml:"Review",kyc:"Pending",status:"Processing"},
 {id:"OTC-20260911-0389",date:"Sep 11, 2026 10:58",client:"PT Nusantara Remit Teknologi",amount:"Rp 2.94 B",asset:"USDC",aml:"Review",kyc:"Verified",status:"Settled"},
 {id:"OTC-20260902-0379",date:"Sep 02, 2026 17:13",client:"PT Nusantara Remit Teknologi",amount:"Rp 12.99 B",asset:"USDT",aml:"Review",kyc:"Verified",status:"Settled"},
 {id:"OTC-20260902-0378",date:"Sep 02, 2026 13:46",client:"PT Bumi Andalas Sawit",amount:"Rp 6.37 B",asset:"USDC",aml:"Flagged",kyc:"Review",status:"Reconciled"},
 {id:"OTC-20260901-0376",date:"Sep 01, 2026 15:29",client:"PT Bumi Andalas Sawit",amount:"Rp 8.59 B",asset:"USDT",aml:"Flagged",kyc:"Review",status:"Settled"},
 {id:"OTC-20260828-0371",date:"Aug 28, 2026 16:46",client:"PT Bumi Andalas Sawit",amount:"Rp 17.89 B",asset:"BTC",aml:"Flagged",kyc:"Review",status:"Settled"},
 {id:"OTC-20260827-0370",date:"Aug 27, 2026 11:10",client:"PT Bumi Andalas Sawit",amount:"Rp 14.77 B",asset:"USDC",aml:"Flagged",kyc:"Review",status:"Reconciled"},
 {id:"OTC-20260827-0369",date:"Aug 27, 2026 09:16",client:"PT Bumi Andalas Sawit",amount:"Rp 4.64 B",asset:"USDC",aml:"Flagged",kyc:"Review",status:"Settled"},
 {id:"OTC-20260826-0368",date:"Aug 26, 2026 08:24",client:"PT Bumi Andalas Sawit",amount:"Rp 5.99 B",asset:"USDC",aml:"Flagged",kyc:"Review",status:"Exception"},
 {id:"OTC-20260819-0358",date:"Aug 19, 2026 13:42",client:"PT Bumi Andalas Sawit",amount:"Rp 8.41 B",asset:"BTC",aml:"Flagged",kyc:"Review",status:"Reconciled"},
 {id:"OTC-20260813-0347",date:"Aug 13, 2026 12:21",client:"PT Mitra Dagang Sejahtera",amount:"Rp 6.26 B",asset:"USDT",aml:"Review",kyc:"Pending",status:"Reconciled"}
];
function kycMonitoringView(){const verified=corporateDirectory.filter(client=>client.kyc==="Verified").length,pending=corporateDirectory.length-verified,clientRows=corporateDirectory.map((client,index)=>`<tr><td class="kyc-id">${client.id}</td><td>${client.name}</td><td class="kyc-tier">${client.tier}</td><td>${pill(client.kyc)}</td><td>${pill(client.aml)}</td><td>${kycOnboarded[index]||"—"}</td><td><span class="kyc-active">${client.status==="Hold"?"Restricted":"Active"}</span></td></tr>`).join(""),alertRows=amlAlerts.map(alert=>`<tr><td class="aml-alert-id">${alert.id}</td><td>${alert.date}</td><td>${alert.client}</td><td class="aml-alert-amount">${alert.amount}</td><td>${alert.asset}</td><td><span class="aml-alert-state"><i class="fi fi-rr-shield-exclamation" aria-hidden="true"></i>${pill(alert.aml)}</span></td><td>${pill(alert.kyc)}</td><td>${pill(alert.status)}</td></tr>`).join("");view.innerHTML=title("KYC / AML & Transaction Monitoring","Threshold Rp 5 B · PPATK-style monitoring")+`<div class="kpis kyc-kpis"><div class="kpi"><label>Verified</label><strong>${verified} / ${corporateDirectory.length}</strong></div><div class="kpi"><label>KYC Pending / Review</label><strong>${pending}</strong></div><div class="kpi"><label>AML Alerts</label><strong>99</strong></div><div class="kpi"><label>Monitored Transactions</label><strong>40</strong></div></div><section class="card kyc-register"><header><h2>Client KYC Register</h2></header><div class="table-wrap"><table class="kyc-register-table"><thead><tr><th>Client ID</th><th>Client</th><th>Tier</th><th>KYC</th><th>AML</th><th>Onboarded</th><th>Status</th></tr></thead><tbody>${clientRows}</tbody></table></div></section><section class="card aml-alerts"><header><div><h2>AML Alerts</h2><p>99 transactions flagged or under review</p></div></header><div class="table-wrap"><table class="aml-alert-table"><thead><tr><th>TX ID</th><th>Date / Time</th><th>Client</th><th>Amount</th><th>Asset</th><th>AML</th><th>KYC</th><th>Status</th></tr></thead><tbody>${alertRows}</tbody></table></div></section>`}function simple(kind){const data={fiat:["Fiat Ledger","Bank settlement positions across Mandiri, BCA, BRI and wire rails",["Bank reference","Rail","Expected","Actual","Status"],ledger.map(r=>[r.bank,r.bank.startsWith("BCA")?"BI FAST":"RTGS / Wire",money(volume(r)),money(volume(r)),r.status])],audit:["Audit Trail","Append-only record. Use void, cancellation or reversal - never hard delete.",["Timestamp","User","Action","Object","Old value","New value"],[["14:42","Desk Operator","Settle transaction","OTC-2026-0218","Processing","Settled"],["13:07","Compliance Lead","Update screening","AML-0041","Review","Hold"],["11:16","Treasury Manager","Reconcile bank","OTC-2026-0217","Pending","Reconciled"]]]}[kind];view.innerHTML=title(data[0],data[1],`<button class="button green">Export view</button>`)+`<section class="card section">${rows(data[2],data[3])}</section>`}
const auditTrail=[
 {timestamp:"Sep 16, 2026 03:05",user:"Manager — Dewi Anggraini",role:"role.Management",action:"APPROVE_SETTLEMENT",object:"OTC-20260916-0002",oldValue:"PENDING",newValue:"APPROVED"},
 {timestamp:"Sep 16, 2026 03:01",user:"Operator — Rangga Wibisono",role:"role.OTC Desk",action:"UPDATE_DESK_PRICE",object:"Desk 01 / Buy Price",oldValue:"16,000",newValue:"16,185"},
 {timestamp:"Sep 15, 2026 09:22",user:"Compliance — Farah Aulia",role:"role.Compliance",action:"KYC_REVIEW",object:"C013 PT Bumi Andalas Sawit",oldValue:"VERIFIED",newValue:"REVIEW"},
 {timestamp:"Sep 15, 2026 02:30",user:"Finance — Yudha Anggara",role:"role.Finance",action:"RAISE_EXCEPTION",object:"EXC-2026-0041",oldValue:"—",newValue:"INVESTIGATING"},
 {timestamp:"Sep 14, 2026 06:12",user:"Operator — Bayu Prakoso",role:"role.OTC Desk",action:"UPDATE_SPREAD",object:"Desk 03 / Spread %",oldValue:"0.50",newValue:"0.42"},
 {timestamp:"Sep 12, 2026 08:40",user:"Manager — Dewi Anggraini",role:"role.Management",action:"VOID_TRANSACTION",object:"OTC-20260912-0187",oldValue:"PENDING",newValue:"VOID (duplicate wire)"},
 {timestamp:"Sep 10, 2026 01:55",user:"Compliance — Farah Aulia",role:"role.Compliance",action:"ADD_CLIENT",object:"C014 PT Trans Pasifik Ekspor",oldValue:"—",newValue:"ACTIVE"},
 {timestamp:"Sep 08, 2026 10:05",user:"Finance — Yudha Anggara",role:"role.Finance",action:"UPDATE_FX_RATE",object:"USD / IDR",oldValue:"16,120",newValue:"16,180"}
];
function auditTrailRows(records){return records.map(entry=>`<tr><td>${entry.timestamp}</td><td>${entry.user}</td><td class="audit-role">${entry.role}</td><td class="audit-action">${entry.action}</td><td class="audit-object">${entry.object}</td><td class="audit-old">${entry.oldValue}</td><td class="audit-new">${entry.newValue}</td></tr>`).join("")}
function filterAuditTrail(){const action=document.querySelector("#audit-action-filter").value,query=document.querySelector("#audit-search").value.toLowerCase(),records=auditTrail.filter(entry=>(!action||entry.action===action)&&(!query||Object.values(entry).join(" ").toLowerCase().includes(query)));document.querySelector("#audit-entry-count").textContent=`${records.length} entries`;document.querySelector("#audit-table-body").innerHTML=auditTrailRows(records)}
function exportAuditCsv(){const records=auditTrail.map(entry=>[entry.timestamp,entry.user,entry.role,entry.action,entry.object,entry.oldValue,entry.newValue]),csv=[["Timestamp","User","Active role","Action","Object","Old value","New value"],...records].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\\n"),file=new Blob([csv],{type:"text/csv"}),link=document.createElement("a");link.href=URL.createObjectURL(file);link.download="lbp-audit-trail.csv";link.click();URL.revokeObjectURL(link.href)}
function auditTrailView(){const actions=[...new Set(auditTrail.map(entry=>entry.action))];view.innerHTML=title("Audit Trail","No permanent deletion. Use Void / Cancel / Reversal with reason and approval.",`<button class="button ghost audit-export" id="audit-csv"><i class="fi fi-rr-download" aria-hidden="true"></i>CSV</button>`)+`<div class="kpis audit-kpis"><div class="kpi"><label>Audit Trail</label><strong>${auditTrail.length}</strong></div><div class="kpi"><label>Void / Reversal</label><strong>${auditTrail.filter(entry=>/VOID|REVERSAL/.test(entry.action)).length}</strong></div><div class="kpi"><label>Hard Deletes</label><strong>0</strong></div></div><section class="card audit-log"><div class="audit-filters"><label>Action<select id="audit-action-filter"><option value="">All</option>${actions.map(action=>`<option value="${action}">${action}</option>`).join("")}</select></label><label>Search TX ID / Client / Bank Ref / TXID<input id="audit-search" placeholder="Search audit trail"></label></div><header class="audit-log-head"><h2 id="audit-entry-count">${auditTrail.length} entries</h2><span><i class="fi fi-rr-lock" aria-hidden="true"></i> immutable</span></header><div class="table-wrap"><table class="audit-table"><thead><tr><th>Timestamp</th><th>User</th><th>Active Role</th><th>Action</th><th>Object</th><th>Old Value</th><th>New Value</th></tr></thead><tbody id="audit-table-body">${auditTrailRows(auditTrail)}</tbody></table></div></section>`;document.querySelector("#audit-action-filter").onchange=filterAuditTrail;document.querySelector("#audit-search").oninput=filterAuditTrail;document.querySelector("#audit-csv").onclick=exportAuditCsv}
const partnerDesks=window.LBPPartnerDeskStore?window.LBPPartnerDeskStore.getPartners():[];
const partnerAccessRequests=[];
const deskAuditLog=[];
function partnerCalculation(desk){const buy=Number(desk.buy),sell=Number(desk.sell),spread=Number(desk.spread),fee=Number(desk.fee);if(![buy,sell,spread,fee].every(Number.isFinite)||buy<=0||sell<=0)return null;const adjustment=(spread+fee)/100,gross=sell-buy;return{clientBuy:buy*(1+adjustment),clientSell:sell*(1-adjustment),gross,margin:(gross/buy*100)+fee}}
function partnerValue(value){return Number.isFinite(value)?`Rp ${Math.round(value).toLocaleString("en-US")}`:"—"}
function partnerPercent(value){return Number.isFinite(value)?`${value.toFixed(3)}%`:"—"}
function deskCompactNumber(value,asset){const amount=Number(value||0);if(!amount)return "—";if(asset==="IDR")return money(amount);return `${amount.toLocaleString(undefined,{maximumFractionDigits:8})} ${asset}`}
function deskGroupedVolumes(values,isFiat=false){const entries=Object.entries(values||{}).filter(([,value])=>Number(value)>0);if(!entries.length)return `<span class="desk-empty-value">—</span>`;return entries.map(([asset,value])=>`<span>${deskCompactNumber(value,isFiat&&asset==="IDR"?"IDR":asset)}</span>`).join("")}
function deskLiquidity(desk){const liquidity=desk.liquidity||{},items=[];if(Number(liquidity.idr))items.push(deskCompactNumber(liquidity.idr,"IDR"));["usdt","usdc","btc"].forEach(asset=>{if(Number(liquidity[asset]))items.push(deskCompactNumber(liquidity[asset],asset.toUpperCase()))});return items.length?items.map(item=>`<span>${item}</span>`).join(""):`<span class="desk-empty-value">—</span>`}
function deskMaskedWallet(desk){const wallet=desk.wallet||{},address=String(wallet.address||"").trim();if(!address)return `<span class="desk-empty-value">—</span>`;const compact=address.replace(/\s/g,"");const masked=compact.length>8?`${compact.slice(0,4)}…${compact.slice(-4)}`:compact;return `<span class="desk-wallet-address">${masked}</span><small>${wallet.asset||""}${wallet.network&&wallet.network!=="—"?` · ${wallet.network}`:""}</small>`}
function partnerDeskRow(desk){return `<tr><td><a class="desk-exchange-link" href="../partner-desk/?partner=${desk.id}"><i class="fi fi-rr-building" aria-hidden="true"></i><span><strong>${desk.name}</strong><small>${desk.lastUpdated||"Awaiting update"}</small></span></a></td><td class="desk-buy">${Number(desk.buy)?money(Number(desk.buy)):"—"}</td><td class="desk-sell">${Number(desk.sell)?money(Number(desk.sell)):"—"}</td><td>${Number(desk.spread||0).toFixed(3)}%</td><td>${Number(desk.fee||0).toFixed(3)}%</td><td class="desk-stack">${deskLiquidity(desk)}</td><td class="desk-wallet">${deskMaskedWallet(desk)}</td><td class="desk-stack">${deskGroupedVolumes(desk.settledFiat,true)}</td><td class="desk-stack">${deskGroupedVolumes(desk.settledCrypto)}</td></tr>`}
function deskView(){const tableRows=partnerDesks.map(partnerDeskRow).join("");view.innerHTML=title("OTC Partner Desk","Read-only consolidated partner quotes, liquidity, settlement wallets, and settled volumes from Supabase.")+`<section class="card partner-desk-table-card"><header><div><h2>Partner Exchange Overview</h2><p>One exchange per row. Prices and operating balances are supplied by each authorised partner.</p></div><span class="eyebrow">${partnerDesks.length} exchanges</span></header><div class="table-wrap"><table class="partner-desk-table"><thead><tr><th>Exchange</th><th>Buy Price</th><th>Sell Price</th><th>Spread</th><th>Fee</th><th>Available Liquidity</th><th>Crypto Wallet</th><th>Settled Fiat Volume</th><th>Settled Crypto Volume</th></tr></thead><tbody>${tableRows||`<tr><td colspan="9" class="empty">No partner desk data available.</td></tr>`}</tbody></table></div></section>`}
const accessSafe=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
function partnerAccessRows(){return partnerAccessRequests.map(request=>{const selected=request.assignedPartnerId||request.requestedPartnerId,options=partnerDesks.map(desk=>`<option value="${accessSafe(desk.id)}" ${desk.id===selected?"selected":""}>${accessSafe(desk.name)}</option>`).join(""),pending=request.status.toLowerCase()==="pending";return `<tr data-access-request="${accessSafe(request.id)}"><td><strong>${accessSafe(request.company)}</strong><small>${accessSafe(request.position)}</small></td><td><strong>${accessSafe(request.contact)}</strong><small>${accessSafe(request.email)}</small></td><td>${accessSafe(request.phone)}</td><td><select class="access-partner-select" aria-label="Assigned partner desk"><option value="">Select partner</option>${options}</select></td><td>${pill(request.status)}</td><td>${accessSafe(request.createdAt)}</td><td class="access-actions">${pending?`<button type="button" class="access-approve" data-access-action="approved">Approve</button><button type="button" class="access-reject" data-access-action="rejected">Reject</button>`:`<span>${accessSafe(request.reviewedAt||"Reviewed")}</span>`}</td></tr>`}).join("")}
async function reviewPartnerAccess(requestId,status){const row=document.querySelector(`[data-access-request="${requestId}"]`),partnerId=row?.querySelector(".access-partner-select")?.value||"";if(status==="approved"&&!partnerId){alert("Select the partner exchange before approving access.");return}const request=partnerAccessRequests.find(item=>item.id===requestId),note=status==="rejected"?(prompt("Reason for rejection (visible to the applicant):",request?.reviewNote||"")||"").trim():"Approved by Management";if(status==="rejected"&&!note)return;row.querySelectorAll("button,select").forEach(control=>control.disabled=true);const {error}=await window.LBPSupabase.from("partner_access_requests").update({status,assigned_partner_id:status==="approved"?partnerId:null,review_note:note}).eq("id",requestId);if(error){alert(error.message);row.querySelectorAll("button,select").forEach(control=>control.disabled=false);return}const refreshed=await window.LBPManagementData.loadPartnerAccessRequests();partnerAccessRequests.splice(0,partnerAccessRequests.length,...refreshed);partnerAccessView()}
function partnerAccessView(){const pending=partnerAccessRequests.filter(item=>item.status.toLowerCase()==="pending").length,approved=partnerAccessRequests.filter(item=>item.status.toLowerCase()==="approved").length,rejected=partnerAccessRequests.filter(item=>item.status.toLowerCase()==="rejected").length;view.innerHTML=title("Partner Access Requests","Review company-email registrations before granting access to an exchange desk.")+`<div class="kpis access-kpis"><div class="kpi"><label>Pending Review</label><strong>${pending}</strong><span>Requires Management decision</span></div><div class="kpi"><label>Approved</label><strong>${approved}</strong><span>Active Partner Desk profiles</span></div><div class="kpi"><label>Rejected</label><strong>${rejected}</strong><span>Access remains disabled</span></div></div><section class="card access-request-card"><header><div><h2>Registration Queue</h2><p>Verify company identity and exchange assignment before approval.</p></div><a class="button ghost" href="../partner-desk/register.html" target="_blank" rel="noopener">Open Registration Form</a></header><div class="table-wrap"><table class="access-request-table"><thead><tr><th>Company</th><th>Applicant</th><th>Phone</th><th>Partner Desk</th><th>Status</th><th>Requested</th><th>Decision</th></tr></thead><tbody>${partnerAccessRows()||`<tr><td colspan="7" class="empty">No partner access requests.</td></tr>`}</tbody></table></div></section>`;document.querySelectorAll("[data-access-action]").forEach(button=>button.onclick=()=>reviewPartnerAccess(button.closest("tr").dataset.accessRequest,button.dataset.accessAction))}
function updatePartnerDesk(id){const desk=partnerDesks.find(item=>item.id===id),card=document.querySelector(`[data-partner-card="${id}"]`);if(!desk||!card)return;card.querySelectorAll("[data-partner-input]").forEach(input=>desk[input.dataset.partnerInput]=input.value);const calc=partnerCalculation(desk),setMetric=(name,value)=>card.querySelector(`[data-partner-metric="${name}"]`).textContent=value;setMetric("clientBuy",calc?partnerValue(calc.clientBuy):"—");setMetric("clientSell",calc?partnerValue(calc.clientSell):"—");setMetric("gross",calc?partnerValue(calc.gross):"—");setMetric("grossRate",calc?partnerPercent(calc.gross/Number(desk.buy)*100):"Awaiting prices");setMetric("margin",calc?partnerPercent(calc.margin):"—")}
function savePartnerDesk(id){const desk=partnerDesks.find(item=>item.id===id),calc=partnerCalculation(desk);if(!calc){alert("Enter buy price, sell price, spread, and fee before saving the partner configuration.");return}desk.status="Configured";if(window.LBPPartnerDeskStore)window.LBPPartnerDeskStore.updatePartner(id,{buy:desk.buy,sell:desk.sell,spread:desk.spread,fee:desk.fee,status:desk.status});deskAuditLog.unshift({time:new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date()),partner:desk.name,detail:`Buy ${partnerValue(Number(desk.buy))} · Sell ${partnerValue(Number(desk.sell))} · Spread ${desk.spread}% · Fee ${desk.fee}%`});const card=document.querySelector(`[data-partner-card="${id}"]`),status=card.querySelector("[data-partner-status]");status.textContent=desk.status;status.classList.add("configured")}
function openDeskAudit(){modal.hidden=false;modal.innerHTML=`<article class="dialog" role="dialog" aria-modal="true" aria-label="OTC partner desk audit log"><header class="dialog-head"><div><h2>OTC Partner Desk Audit Log</h2><p class="sub">Local configuration changes only</p></div><button class="close" id="close-desk-audit" aria-label="Close audit log">×</button></header><div class="desk-audit-list">${deskAuditLog.length?deskAuditLog.map(item=>`<div><time>${item.time}</time><span>${item.partner}<br><small>${item.detail}</small></span><b>Saved</b></div>`).join(""):`<div><span>No partner configuration has been saved yet.</span></div>`}</div><footer class="dialog-footer"><button class="button ghost" id="close-desk-audit-footer">Close</button></footer></article>`;const close=()=>modal.hidden=true;document.querySelector("#close-desk-audit").onclick=close;document.querySelector("#close-desk-audit-footer").onclick=close;modal.onclick=event=>{if(event.target===modal)close()}}
function reportBuilder(kind="Reports"){view.innerHTML=title(kind,"Generate daily, weekly, monthly and since-inception summaries from the master ledger.",`<button class="button green">Generate report</button>`)+`<div class="grid section"><section class="card"><h2>Report period</h2><p class="sub">All report views calculate from the same ledger.</p><div class="filters"><select><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Since inception</option></select><input value="24/10/2026"><button class="button">Generate</button></div><div class="bars section">${[["Transaction volume",82],["Fiat flow",68],["Crypto flow",74],["Desk revenue",55],["Reconciliation",99]].map(x=>`<div class="bar-row"><span>${x[0]}</span><div class="bar"><i style="width:${x[1]}%"></i></div><b>${x[1]}%</b></div>`).join("")}</div></section><section class="card"><h2>Export package</h2><p class="sub">Structured output includes executive summary, transaction ledger, fiat and crypto flows, five desks, clients, AUM, reconciliation, KYC AML and audit trail.</p><button class="button green">Excel XLSX</button> <button class="button ghost">CSV</button> <button class="button ghost">PDF</button></section></div>`}
const aumReserves=[
 {asset:"IDR",quantity:318450000000,rate:1,custody:"Bank Mandiri / BCA Operational",color:"#2945b3"},
 {asset:"USD",quantity:4150000,rate:16180,custody:"DBS Singapore Wire Account",color:"#3b916d"},
 {asset:"USDT",quantity:18420000,rate:16240,custody:"Fireblocks Vault — TRC20/ERC20",color:"#4a9cda"},
 {asset:"USDC",quantity:6180000,rate:16235,custody:"Fireblocks Vault — ERC20",color:"#eea432"},
 {asset:"BTC",quantity:62.4,rate:1720000000,custody:"Cold Storage Multi-sig 3/5",color:"#7440dc"}
];
const aumOpening=742500000000;
const aumNumber=value=>new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
const aumCompact=value=>`Rp ${(value/1000000000).toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1})} B`;
function aumAllocation(total){let start=0;return aumReserves.map(item=>{const share=item.quantity*item.rate/total*100,end=start+share,segment=`${item.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;start=end;return segment}).join(",")}
function reports(period="Monthly"){
 const reportLedger=periodRecords(ledger,period),t=totalsFor(reportLedger),compact=value=>`Rp ${(value/1000000000).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} B`,revenue=value=>`Rp ${(value/1000000).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} M`;
 const usdtIn=reportLedger.filter(item=>item.asset==="USDT"&&item.cryptoIn>0).reduce((sum,item)=>sum+item.cryptoIn,0),usdtOut=reportLedger.filter(item=>item.asset==="USDT"&&item.cryptoOut>0).reduce((sum,item)=>sum+item.cryptoOut,0),netFlow=t.fiatIn-t.fiatOut;
 const deskRows=["Desk 01","Desk 02","Desk 03","Desk 04","Desk 05"].map((desk,index)=>{const items=reportLedger.filter(item=>item.desk===desk),volumeValue=items.reduce((sum,item)=>sum+volume(item),0),revenueValue=volumeValue*.0072;return `<tr><td class="report-id">D${index+1}</td><td class="report-number">${items.length}</td><td class="report-number">${compact(volumeValue)}</td><td class="report-revenue">${revenue(revenueValue)}</td><td class="report-number">${volumeValue?(revenueValue/volumeValue*100).toFixed(3):"0.000"}%</td></tr>`}).join("");
 const groupedClients=[...new Set(reportLedger.map(item=>item.client))].map((client,index)=>{const items=reportLedger.filter(item=>item.client===client),volumeValue=items.reduce((sum,item)=>sum+volume(item),0),flow=items.reduce((sum,item)=>sum+item.fiatIn-item.fiatOut,0),revenueValue=volumeValue*.0072,flowClass=flow<0?"report-negative":"report-positive";return `<tr><td class="report-id">C${String(index+1).padStart(3,"0")}</td><td>${client}</td><td class="report-number">${items.length}</td><td class="report-number">${compact(volumeValue)}</td><td class="report-number ${flowClass}">${compact(flow)}</td><td class="report-revenue">${revenue(revenueValue)}</td></tr>`}).join("");
 const summary=[
  ["OTC Total Volume",compact(t.vol),""],["Fiat IN",compact(t.fiatIn),""],["Fiat OUT",compact(t.fiatOut),""],["Net Brokerage Revenue",revenue(t.vol*.0072),""],
  ["Crypto IN USDT",`${usdtIn.toLocaleString()} USDT`,""],["Crypto OUT USDT",`${usdtOut.toLocaleString()} USDT`,""],["Net Flow",compact(netFlow),""],["Transaction Count",String(t.count),""]
 ];
 view.innerHTML=title("Report Center",`${period} ledger view`, `<div class="report-heading-actions"><button class="button ghost" id="report-print"><i class="fi fi-rr-print" aria-hidden="true"></i>Print / PDF</button><button class="button" id="report-xlsx"><i class="fi fi-rr-download" aria-hidden="true"></i>XLSX</button></div>`)+`<section class="card report-period-card"><span class="report-period-label">Period</span><div class="report-period-switch" id="report-period"><button class="${period==="Today"?"active":""}">Today</button><button class="${period==="Weekly"?"active":""}">Weekly</button><button class="${period==="Monthly"?"active":""}">Monthly</button><button class="${period==="Since Inception"?"active":""}">Since Inception</button><button class="${period==="Custom Range"?"active":""}">Custom Range</button></div></section><section class="card report-summary"><header class="report-summary-head"><h2>Executive Summary</h2><p>${period} report scope · ${reportLedger.length} transactions</p></header><div class="report-summary-grid">${summary.map(item=>`<div class="kpi"><label>${item[0]}</label><strong>${item[1]}</strong>${item[2]?`<span>${item[2]}</span>`:""}</div>`).join("")}</div></section><section class="card report-performance"><header><h2>Desk Performance</h2></header><div class="table-wrap"><table class="report-table"><thead><tr><th>Desk</th><th>Transactions</th><th>Volume</th><th>Revenue</th><th>Margin</th></tr></thead><tbody>${deskRows}</tbody></table></div></section><section class="card report-performance"><header><h2>Client Performance</h2></header><div class="table-wrap"><table class="report-table"><thead><tr><th>Client ID</th><th>Client</th><th>Transactions</th><th>Volume</th><th>Net Flow</th><th>Revenue</th></tr></thead><tbody>${groupedClients}</tbody></table></div></section>`;
 document.querySelectorAll("#report-period button").forEach(button=>button.onclick=()=>reports(button.textContent));
 document.querySelector("#report-print").onclick=()=>window.print();
 document.querySelector("#report-xlsx").onclick=()=>alert("Local XLSX report preparation is ready. Connect the governed export service for production downloads.");
}
function aum(){
 view.innerHTML=title("AUM / Managed Assets","Multi-Asset Reserve Breakdown")+`<div id="aum-content"></div>`;
 renderAum();
}
function renderAum(){
 const content=document.querySelector("#aum-content");
 if(!content)return;
 const total=aumReserves.reduce((sum,item)=>sum+item.quantity*item.rate,0),netInflow=total-aumOpening,growth=netInflow/aumOpening*100;
 const tableRows=aumReserves.map(item=>{const equivalent=item.quantity*item.rate,share=equivalent/total*100;return `<tr><td class="asset-code">${item.asset}</td><td class="aum-number">${aumNumber(item.quantity)}</td><td><input class="aum-rate-input" data-aum-asset="${item.asset}" type="number" min="0" step="${item.asset==="BTC"?"1000":"1"}" value="${item.rate}" aria-label="IDR rate for ${item.asset}"></td><td class="aum-equivalent">${aumCompact(equivalent)}</td><td class="aum-share">${share.toFixed(1)}%</td><td>${item.custody}</td></tr>`}).join("");
 const legend=aumReserves.map(item=>`<span class="aum-legend-item" style="--asset-color:${item.color}"><i></i>${item.asset}</span>`).join("");
 content.innerHTML=`<div class="kpis section aum-kpis"><div class="kpi"><label>Opening AUM</label><strong>${aumCompact(aumOpening)}</strong></div><div class="kpi"><label>Current AUM</label><strong>${aumCompact(total)}</strong></div><div class="kpi"><label>Net inflow</label><strong>${aumCompact(netInflow)}</strong><span>${growth.toFixed(2)}%</span></div><div class="kpi"><label>Net flow</label><strong>Rp 310.15 B</strong><span>397 tx</span></div></div><div class="aum-layout"><section class="card aum-reserve-card"><header class="aum-panel-head"><div class="split"><div><h2>Multi-Asset Reserve Breakdown</h2><p>Exchange Rate Table (configurable)</p></div><span class="aum-rate-status">Live reference</span></div></header><div class="table-wrap"><table class="aum-table"><thead><tr><th>Asset</th><th>Quantity</th><th>Rate (IDR)</th><th>IDR Equivalent</th><th>%</th><th>Custody</th></tr></thead><tbody>${tableRows}</tbody><tfoot><tr><td>Total</td><td>—</td><td>—</td><td class="aum-equivalent">${aumCompact(total)}</td><td>100%</td><td>—</td></tr></tfoot></table></div></section><section class="card aum-chart-card"><header class="aum-panel-head"><h2>Asset Allocation</h2><p>Current reserve composition</p></header><div class="aum-chart-inner"><div class="aum-donut" style="background:conic-gradient(${aumAllocation(total)})"><div class="aum-donut-value"><small>Current AUM</small><strong>${aumCompact(total)}</strong></div></div><div class="aum-legend">${legend}</div></div></section></div><p class="aum-note">IDR Equivalent = Quantity × Rate · <b>Rate edits are local preview controls and not executable OTC pricing.</b></p>`;
 content.querySelectorAll("[data-aum-asset]").forEach(input=>input.addEventListener("input",()=>{const reserve=aumReserves.find(item=>item.asset===input.dataset.aumAsset),next=Number(input.value);if(reserve&&Number.isFinite(next)&&next>=0){reserve.rate=next;renderAum()}}));
}
function exportRecordsFor(period,client,desk,asset){
 const dated=ledger.map(item=>({...item,parsedDate:new Date(item.date)})).filter(item=>!Number.isNaN(item.parsedDate.valueOf()));
 const latest=dated.reduce((max,item)=>item.parsedDate>max?item.parsedDate:max,new Date(0));
 return dated.filter(item=>{
  const age=Math.floor((latest-item.parsedDate)/86400000);
  const withinPeriod=period==="Today"?age===0:period==="Weekly"?age<=6:period==="Monthly"?item.parsedDate.getMonth()===latest.getMonth()&&item.parsedDate.getFullYear()===latest.getFullYear():true;
  return withinPeriod&&(!client||item.client===client)&&(!desk||item.desk===desk)&&(!asset||item.asset===asset);
 });
}
function exportPeriodLabel(records){
 if(!records.length)return "No transactions match these filters";
 const dates=records.map(item=>item.parsedDate).sort((a,b)=>a-b),format={day:"2-digit",month:"short",year:"numeric"};
 return `${new Intl.DateTimeFormat("en-US",format).format(dates[0])} — ${new Intl.DateTimeFormat("en-US",format).format(dates.at(-1))}`;
}
function exportCompact(value){return `Rp ${(value/1000000000).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} B`}
function exportCsv(records){
 const headers=["TX ID","Date / Time","Client","Type","Asset","Fiat IN","Fiat OUT","Crypto IN","Crypto OUT","Rate","Desk","Settlement Status","KYC","AML","Bank Reference","Blockchain TXID"];
 const escape=value=>`"${String(value??"").replaceAll('"','""')}"`;
 const csv=[headers,...records.map(item=>[item.id,item.date,item.client,item.type,item.asset,item.fiatIn,item.fiatOut,item.cryptoIn,item.cryptoOut,item.rate,item.desk,item.status,item.kyc,item.aml,item.bank,item.txid])].map(row=>row.map(escape).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");
 link.href=url;link.download="lbp-otc-transaction-ledger.csv";link.click();URL.revokeObjectURL(url);
}
function exportsView(){
 const clientOptions=[...new Set(ledger.map(item=>item.client))],deskOptions=[...new Set(ledger.map(item=>item.desk))],assetOptions=[...new Set(ledger.map(item=>item.asset))];
 const optionList=items=>`<option value="">All</option>${items.map(item=>`<option value="${item}">${item}</option>`).join("")}`;
 const sheets=["Executive Summary","Transaction Ledger","Fiat Flow","Crypto Flow","OTC Brokerage","OTC Partner Desks","B2B Corporate Clients","Daily Summary","Weekly Summary","Monthly Summary","AUM","Reconciliation","KYC AML Summary","Audit Trail"];
 view.innerHTML=title("Export Center","Structured multi-sheet reports, not dashboard screenshots.")+`<section class="card export-filter-panel"><div class="export-filters"><label class="export-period-control">Period<div class="export-period-switch" id="export-period"><button>Today</button><button>Weekly</button><button class="active">Monthly</button><button>Since Inception</button><button>Custom Range</button></div></label><label>Client<select id="export-client">${optionList(clientOptions)}</select></label><label>Desk<select id="export-desk">${optionList(deskOptions)}</select></label><label>Asset<select id="export-asset">${optionList(assetOptions)}</select></label></div></section><div id="export-center-content"></div>`;
 const renderExportContent=()=>{
  const period=document.querySelector("#export-period .active").textContent,records=exportRecordsFor(period,document.querySelector("#export-client").value,document.querySelector("#export-desk").value,document.querySelector("#export-asset").value),volumeValue=records.reduce((sum,item)=>sum+volume(item),0),revenueValue=volumeValue*.0072,periodLabel=exportPeriodLabel(records);
  document.querySelector("#export-center-content").innerHTML=`<section class="export-kpis"><article class="kpi"><label>Transaction count</label><strong>${records.length}</strong></article><article class="kpi"><label>OTC total volume</label><strong>${exportCompact(volumeValue)}</strong></article><article class="kpi export-revenue"><label>Net brokerage revenue</label><strong>${exportCompact(revenueValue)}</strong></article></section><section class="export-actions-grid"><article class="card export-action-card"><div class="export-action-icon"><i class="fi fi-rr-file" aria-hidden="true"></i></div><h2>CSV</h2><p>Raw master ledger for downstream analysis.</p><button class="button ghost export-action-button" id="export-csv" type="button">Export CSV</button></article><article class="card export-action-card export-xlsx-card"><div class="export-action-icon"><i class="fi fi-rr-file-chart-line" aria-hidden="true"></i></div><h2>XLSX</h2><p>Full multi-sheet reporting workbook.</p><button class="button export-action-button" id="export-xlsx" type="button">Export XLSX</button></article><article class="card export-action-card"><div class="export-action-icon"><i class="fi fi-rr-print" aria-hidden="true"></i></div><h2>PDF</h2><p>Print this period’s summary via the print dialog.</p><button class="button ghost export-action-button" id="export-pdf" type="button">Export PDF</button></article></section><section class="card generated-sheets"><header><h2>Generated sheets</h2><p>${periodLabel}</p></header><div class="export-sheet-grid">${sheets.map((sheet,index)=>`<div class="export-sheet"><span>${String(index+1).padStart(2,"0")}</span>${sheet}</div>`).join("")}</div></section>`;
  document.querySelector("#export-csv").onclick=()=>exportCsv(records);
  document.querySelector("#export-xlsx").onclick=()=>alert("The 14-sheet workbook structure is ready. Connect the governed XLSX generation service before using this for production reporting.");
  document.querySelector("#export-pdf").onclick=()=>window.print();
 };
 document.querySelectorAll("#export-period button").forEach(button=>button.onclick=()=>{document.querySelectorAll("#export-period button").forEach(item=>item.classList.remove("active"));button.classList.add("active");renderExportContent()});
 ["#export-client","#export-desk","#export-asset"].forEach(selector=>document.querySelector(selector).onchange=renderExportContent);
 renderExportContent();
}
const settingsAssetRates={IDR:1,USD:16180,USDT:16240,USDC:16235,BTC:1720000000};
const liveRateState={updatedAt:null,source:"Loading market reference…",level:"loading"};
const binanceQuoteState={bid:null,ask:null,updatedAt:null,source:"Loading Binance USDT/IDR reference…",direct:false};
let currentView="dashboard";
function marketTime(){return new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date())}
function applyLiveRates(nextRates,source){Object.assign(settingsAssetRates,nextRates);aumReserves.forEach(reserve=>{if(Number.isFinite(nextRates[reserve.asset]))reserve.rate=nextRates[reserve.asset]});liveRateState.updatedAt=new Date();liveRateState.source=source;liveRateState.level=source.includes("Unavailable")?"fallback":"live";setUsdIdrHeader(settingsAssetRates.USD,`${source} · ${marketTime()}`);document.querySelectorAll("[data-rate-asset]").forEach(input=>{const rate=settingsAssetRates[input.dataset.rateAsset];if(Number.isFinite(rate)){input.value=Math.round(rate);const equivalent=document.querySelector(`#settings-equivalent-${input.dataset.rateAsset}`);if(equivalent)equivalent.textContent=money(rate)}});const status=document.querySelector("#settings-live-rate-status");if(status)status.textContent=`${source} · updated ${marketTime()}`}
function applyBinancePartnerReference(bid,ask,source,direct){binanceQuoteState.bid=bid;binanceQuoteState.ask=ask;binanceQuoteState.source=source;binanceQuoteState.direct=direct;binanceQuoteState.updatedAt=new Date();if(["dashboard","settings"].includes(currentView))render(currentView)}
async function refreshLiveRates(){const fetchJson=async url=>{const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error(`Market feed ${response.status}`);return response.json()};try{const [fxResult,cryptoResult,bookResult]=await Promise.allSettled([fetchJson("https://open.er-api.com/v6/latest/USD"),fetchJson("https://data-api.binance.vision/api/v3/ticker/price?symbols=%5B%22BTCUSDT%22%2C%22USDCUSDT%22%5D"),fetchJson("https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=USDTIDR")]);const usdIdr=fxResult.status==="fulfilled"?Number(fxResult.value.rates?.IDR):NaN;if(!Number.isFinite(usdIdr)||usdIdr<=0)throw new Error("USD/IDR rate unavailable");const prices=cryptoResult.status==="fulfilled"?Object.fromEntries((cryptoResult.value||[]).map(item=>[item.symbol,Number(item.price)])):{};const btcUsd=prices.BTCUSDT,usdcUsd=prices.USDCUSDT,binanceBid=bookResult.status==="fulfilled"?Number(bookResult.value.bidPrice):NaN,binanceAsk=bookResult.status==="fulfilled"?Number(bookResult.value.askPrice):NaN,hasBinanceBook=Number.isFinite(binanceBid)&&binanceBid>0&&Number.isFinite(binanceAsk)&&binanceAsk>0,usdtReference=hasBinanceBook?(binanceBid+binanceAsk)/2:usdIdr;const next={IDR:1,USD:usdIdr,USDT:usdtReference,USDC:Number.isFinite(usdcUsd)&&usdcUsd>0?usdIdr*usdcUsd:usdIdr,BTC:Number.isFinite(btcUsd)&&btcUsd>0?usdIdr*btcUsd:settingsAssetRates.BTC};const source=hasBinanceBook?"Binance USDT/IDR live reference":"Latest FX reference";applyLiveRates(next,source);applyBinancePartnerReference(hasBinanceBook?binanceBid:null,hasBinanceBook?binanceAsk:null,hasBinanceBook?`Binance USDT/IDR live bid/ask · updated ${marketTime()}`:"Binance USDT/IDR unavailable — retaining partner quote inputs",hasBinanceBook)}catch(error){liveRateState.source="Market reference unavailable";liveRateState.level="fallback";setUsdIdrHeader(settingsAssetRates.USD,"Indicative fallback");const status=document.querySelector("#settings-live-rate-status");if(status)status.textContent="Market reference unavailable — showing last known values.";console.warn("Live market rates could not be refreshed.",error)}}
function loadSettingRates(){return settingsAssetRates}
function saveSettingRates(){}
function settings(){const rates=loadSettingRates(),rateRows=Object.entries(rates).map(([asset,rate])=>`<tr><td class="settings-asset">${asset}</td><td><input class="settings-rate-input" type="number" readonly min="0" step="${asset==="BTC"?"1000":"1"}" value="${rate}" data-rate-asset="${asset}" aria-label="${asset} live IDR reference rate"></td><td class="settings-equivalent" id="settings-equivalent-${asset}">${money(Number(rate))}</td></tr>`).join(""),deskRows=partnerDesks.map(desk=>{const liquidity=desk.liquidity||{},updated=desk.lastUpdated||"Awaiting partner update",quote=partnerReferenceQuote(desk);return `<tr><td class="settings-desk">${desk.name}</td><td>${desk.operator||"Partner Operations"}</td><td class="settings-money">${money(quote.buy)}</td><td class="settings-money">${money(quote.sell)}</td><td class="settings-money">${Number(desk.spread||0).toFixed(3)}%</td><td class="settings-money">${Number(desk.fee||0).toFixed(3)}%</td><td class="settings-money">${Number(liquidity.usdt||0).toLocaleString()} USDT</td><td>${updated}</td></tr>`}).join("");let defaultLanguage="English";try{defaultLanguage=localStorage.getItem("lbp-management-default-language")||"English"}catch(error){}view.innerHTML=title("Settings","OTC Brokerage & Institutional Settlement")+`<section class="card settings-card settings-rates"><header><div><h2>Exchange Rate Table</h2><p id="settings-live-rate-status">${liveRateState.source}</p></div><button class="button ghost" id="refresh-live-rates" type="button">↻ Refresh</button></header><div class="table-wrap"><table><thead><tr><th>Asset</th><th>IDR</th><th>IDR Equivalent</th></tr></thead><tbody>${rateRows}</tbody></table></div></section><section class="card settings-card settings-desks"><header><h2>OTC Partner Desk Configuration</h2><p>${binanceQuoteState.source}. This is an indicative market reference; partner execution quotes must be confirmed before settlement.</p></header><div class="table-wrap"><table><thead><tr><th>Exchange</th><th>Operator</th><th>Buy Price</th><th>Sell Price</th><th>Spread %</th><th>Fee %</th><th>Available USDT</th><th>Last Updated</th></tr></thead><tbody>${deskRows||`<tr><td colspan="8">No partner desk data available.</td></tr>`}</tbody></table></div></section><section class="card settings-card settings-language"><header><h2>Default Language</h2></header><label>Default language<select id="settings-default-language"><option ${defaultLanguage==="English"?"selected":""}>English</option><option ${defaultLanguage==="Bahasa Indonesia"?"selected":""}>Bahasa Indonesia</option></select></label></section>`;document.querySelector("#refresh-live-rates").onclick=refreshLiveRates;document.querySelector("#settings-default-language").onchange=event=>{try{localStorage.setItem("lbp-management-default-language",event.target.value)}catch(error){}}}
function render(name){currentView=name;document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===name));({dashboard,ledger:ledgerView,fiat:fiatView,crypto:cryptoView,clients:clientsView,desks:deskView,partnerAccess:partnerAccessView,reports, aum,reconciliation:reconciliationView,compliance:kycMonitoringView,exports:exportsView,audit:auditTrailView,settings})[name]()}
document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>{render(n.dataset.view);setMobileNavigation(false)});

function showDataLoadError(error){
  console.error("Unable to load the Supabase Management ledger.",error);
  view.innerHTML=title("Management data unavailable","The dashboard could not load its governed ledger.")+`<section class="card section"><h2>Supabase connection required</h2><p class="sub">The authenticated account could not read transaction data. Check the Supabase connection and Row Level Security policy, then refresh this page.</p></section>`;
}

async function bootstrapManagementLedger(){
  try{
    const [liveLedger,operations]=await Promise.all([
      window.LBPManagementData.loadTransactions(),
      window.LBPManagementData.loadOperationsData(),
    ]);
    ledger.splice(0,ledger.length,...liveLedger);
    corporateDirectory.splice(0,corporateDirectory.length,...operations.clients);
    Object.keys(clientProfiles).forEach(key=>delete clientProfiles[key]);
    Object.assign(clientProfiles,operations.clientProfiles);
    bankReconciliation.splice(0,bankReconciliation.length,...operations.bankReconciliation);
    walletReconciliation.splice(0,walletReconciliation.length,...operations.walletReconciliation);
    reconciliationIncidents.splice(0,reconciliationIncidents.length,...operations.incidents);
    amlAlerts.splice(0,amlAlerts.length,...operations.alerts);
    auditTrail.splice(0,auditTrail.length,...operations.audits);
    partnerDesks.splice(0,partnerDesks.length,...operations.partners);
    partnerAccessRequests.splice(0,partnerAccessRequests.length,...operations.partnerAccessRequests);
    if(Object.keys(operations.rates).length)Object.assign(settingsAssetRates,operations.rates);
    if(operations.reserves.length){aumReserves.splice(0,aumReserves.length,...operations.reserves.map(item=>({...item,rate:operations.rates[item.asset]||settingsAssetRates[item.asset]||1})));}
    window.LBPManagementLiveLegs={fiat:operations.fiatLegs,crypto:operations.cryptoLegs};
    render("dashboard");
    refreshLiveRates();window.setInterval(refreshLiveRates,60000);
  }catch(error){
    ledger.splice(0,ledger.length);
    showDataLoadError(error);
  }
}

window.LBPManagementAuth.ready.then(bootstrapManagementLedger).catch(showDataLoadError);
