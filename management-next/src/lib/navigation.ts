export const navigationGroups = [
  { label: "Operations", items: [["Dashboard", "/management"], ["Transaction Ledger", "/management/transactions"], ["Fiat Ledger", "/management/fiat-ledger"], ["Crypto Ledger", "/management/crypto-ledger"]] },
  { label: "Business", items: [["B2B / Corporate Clients", "/management/clients"], ["OTC Partner Desk", "/management/partner-desk"], ["AUM / Managed Assets", "/management/aum"]] },
  { label: "Control", items: [["Reconciliation", "/management/reconciliation"], ["KYC / AML", "/management/kyc-aml"], ["Reports", "/management/reports"], ["Audit Trail", "/management/audit-trail"], ["Settings", "/management/settings"]] },
] as const;
