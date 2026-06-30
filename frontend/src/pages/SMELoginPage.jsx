import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext.jsx';





export default function SMELoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginSME, verifyMfa, isLoading } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');

  const from = location.state?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    setServerError('');
    try {
      const result = await loginSME(data);
      if (result && result.mfaRequired) {
        setMfaRequired(true);
        setTempToken(result.tempToken);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setServerError(
        err?.response?.data?.message || 'Login failed. Please check your credentials.'
      );
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpError('');
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Please enter a valid 6-digit verification code.');
      return;
    }
    try {
      await verifyMfa(tempToken, otpCode);
      navigate(from, { replace: true });
    } catch (err) {
      setOtpError(
        err?.response?.data?.message || 'Verification failed. Please check the code.'
      );
    }
  };

  if (mfaRequired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        {}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          {}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            {}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/30 mb-4">
                <Lock className="w-7 h-7 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">MFA Verification</h1>
              <p className="text-slate-400 text-sm">Please enter the 6-digit OTP code sent to your email</p>
            </div>

            {}
            {otpError && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-400 text-sm">{otpError}</p>
              </div>
            )}

            {}
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="otp-code" className="block text-sm font-medium text-slate-300">
                  Verification Code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-white placeholder-slate-500 text-lg tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify & Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setMfaRequired(false)}
                className="text-slate-400 hover:text-slate-300 text-sm transition-colors"
              >
                ← Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      {}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/30 mb-4">
              <Building2 className="w-7 h-7 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">SME Portal</h1>
            <p className="text-slate-400 text-sm">Sign in to your business account</p>
          </div>

          {}
          {serverError && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-red-400 text-sm">{serverError}</p>
            </div>
          )}

          {}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {}
            <div className="space-y-1.5">
              <label htmlFor="sme-email" className="block text-sm font-medium text-slate-300">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  id="sme-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.email
                      ? 'border-red-500/50 focus:ring-red-500/30'
                      : 'border-white/10 focus:ring-blue-500/30 focus:border-blue-500/50'
                  }`}
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email address' },
                  })}
                />
              </div>
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {}
            <div className="space-y-1.5">
              <label htmlFor="sme-password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  id="sme-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`w-full bg-white/5 border rounded-xl pl-10 pr-11 py-3 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.password
                      ? 'border-red-500/50 focus:ring-red-500/30'
                      : 'border-white/10 focus:ring-blue-500/30 focus:border-blue-500/50'
                  }`}
                  {...register('password', { required: 'Password is required' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {}
            <button
              id="sme-login-btn"
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {}
          <div className="mt-6 text-center space-y-2">
            <p className="text-slate-300 text-sm">
              Don't have an account?{' '}
              <Link
                to="/sme/register"
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Create one free
              </Link>
            </p>
            <p className="text-slate-400 text-xs">
              Bank officer?{' '}
              <Link
                to="/bank/login"
                className="text-slate-400 hover:text-slate-300 transition-colors"
              >
                Sign in here →
              </Link>
            </p>
          </div>
        </div>

        {}
        <p className="text-center text-slate-400 text-xs mt-6">
          AI Loan Underwriting Platform · Secure & Encrypted
        </p>
      </div>
    </div>
  );
}
