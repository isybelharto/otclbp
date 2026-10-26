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
      liquidity: {
        usdt: number(first(row, ["available_usdt", "usdt_available", "liquidity_usdt"])),
        idr: number(first(row, ["available_idr", "idr_available", "liquidity_idr"])),
      },
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
    const [transactions, clientRows, fiatLegs, cryptoLegs, partnerRows, reconciliationRows, alertRows, auditRows, rateRows, bankAccounts, cryptoWallets] = await Promise.all([
      optionalTable("transactions"), optionalTable("clients"), optionalTable("fiat_legs"), optionalTable("crypto_legs"),
      optionalTable("partner_quotes"), optionalTable("reconciliation_entries"), optionalTable("aml_alerts"),
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
      partners: partnerRows.map(mapPartner),
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

  window.LBPManagementData = { loadOperationsData, loadTransactions };
})();
