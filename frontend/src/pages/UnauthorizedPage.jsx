import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-slate-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
          {}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-6 animate-pulse">
            <ShieldAlert className="w-8 h-8" />
          </div>

          {}
          <h1 className="text-2xl font-bold text-white mb-2">Access Restricted</h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Your account does not have the necessary permissions to access this page. If you believe this is an error, please contact your administrator.
          </p>

          {}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium rounded-xl py-3 text-sm transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl py-3 text-sm transition-all shadow-lg shadow-blue-500/15"
            >
              <Home className="w-4 h-4" />
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
