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

  window.LBPManagementData = { loadTransactions };
})();
