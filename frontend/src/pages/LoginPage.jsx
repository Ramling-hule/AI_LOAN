import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Landmark, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl flex flex-col items-center gap-12">
        {}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Secure Enterprise Loan Portal
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            AI Loan Underwriter
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base">
            Select your portal below to access the smart underwriting environment.
          </p>
        </div>

        {}
        <div className="grid md:grid-cols-2 gap-8 w-full">
          {}
          <div 
            onClick={() => navigate('/sme/login')}
            className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:border-blue-500/30 hover:bg-blue-500/[0.02] cursor-pointer transition-all duration-300 shadow-xl flex flex-col justify-between"
          >
            {}
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-6 group-hover:scale-110 transition-transform duration-300">
                <Building2 className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">SME Portal</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Are you a business owner seeking funding? Apply for dynamic credit lines, upload financials, and track underwriting decisions in real-time.
              </p>
              
              <ul className="space-y-2 text-xs text-slate-300 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Self-serve loan applications
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Real-time bank document uploads
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Automated eligibility checks
                </li>
              </ul>
            </div>

            <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors shadow-lg shadow-blue-500/10 group-hover:shadow-blue-500/20">
              Enter SME Portal
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {}
          <div 
            onClick={() => navigate('/bank/login')}
            className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] cursor-pointer transition-all duration-300 shadow-xl flex flex-col justify-between"
          >
            {}
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-6 group-hover:scale-110 transition-transform duration-300">
                <Landmark className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Bank Partner Portal</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Are you a credit reviewer or branch administrator? Analyze applications, evaluate AI-driven credit indicators, and approve loan offers.
              </p>

              <ul className="space-y-2 text-xs text-slate-300 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Risk scoring dashboard & analysis
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Audit logs & compliance checks
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Decision workflow controls
                </li>
              </ul>
            </div>

            <button className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors shadow-lg shadow-emerald-500/10 group-hover:shadow-emerald-500/20">
              Enter Bank Portal
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {}
        <p className="text-slate-400 text-xs">
          AI Loan Underwriting Platform · Multi-Tenant Isolation · Encrypted Sessions
        </p>
      </div>
    </div>
  );
}
