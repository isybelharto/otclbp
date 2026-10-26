type LbpMarkProps = { compact?: boolean };

export function LbpMark({ compact = false }: LbpMarkProps) {
  return <div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#1e40af] text-lg font-bold text-white">₿</div>{!compact && <div><p className="text-xs font-extrabold tracking-wide text-slate-950">PT LINTAS BATAS</p><p className="mt-0.5 text-[10px] font-semibold tracking-[0.14em] text-slate-500">PEMBAYARAN · OTC</p></div>}</div>;
}
