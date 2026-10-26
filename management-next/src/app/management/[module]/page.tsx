const labels: Record<string, string> = {
  transactions: "Transaction Ledger", "fiat-ledger": "Fiat Ledger", "crypto-ledger": "Crypto Ledger",
  clients: "B2B / Corporate Clients", "partner-desk": "OTC Partner Desk", aum: "AUM / Managed Assets",
  reconciliation: "Reconciliation", "kyc-aml": "KYC / AML", reports: "Reports", "audit-trail": "Audit Trail", settings: "Settings",
};

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const title = labels[module] ?? "Management Module";

  return <div className="mx-auto max-w-[1600px] p-5 sm:p-8"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">Management</p><h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1><div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-500">This route is ready for the {title} module. Its data view and role permission will be connected to Supabase in the next implementation stage.</div></div>;
}
