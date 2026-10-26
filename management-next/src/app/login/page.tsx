import { LbpMark } from "@/components/lbp-mark";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-[#0f1e3d] via-[#1e40af] to-[#3156b9] p-5"><section className="w-full max-w-md rounded-2xl border border-white/20 bg-white p-7 shadow-2xl"><LbpMark /><div className="mt-8"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">Secure Management Access</p><h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Sign in to LBP OTC</h1><p className="mt-2 text-sm leading-6 text-slate-500">Use your approved institutional email and password.</p></div><LoginForm /><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Access is limited to active Management / Super Admin profiles.</p></section></main>;
}
