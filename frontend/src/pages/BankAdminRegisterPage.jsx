import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Landmark,
  User,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Home,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext.jsx';





const PasswordStrength = ({ password = '' }) => {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 mt-2">
      {checks.map(({ label, ok }) => (
        <div key={label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-400' : 'text-slate-300'}`}>
          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
          {label}
        </div>
      ))}
    </div>
  );
};

export default function BankAdminRegisterPage() {
  const navigate = useNavigate();
  const { registerBank, isLoading } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const password = watch('password', '');

  const onSubmit = async (data) => {
    setServerError('');
    try {
      await registerBank({
        bank_name: data.bank_name,
        branch_name: data.branch_name,
        ifsc_code: data.ifsc_code,
        admin_name: data.admin_name,
        phone: data.phone,
        email: data.email,
        password: data.password,
        branch_address: {
          city: data.city,
          state: data.state,
          pincode: data.pincode,
        }
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(
        err?.response?.data?.message || 'Registration failed. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 flex items-center justify-center p-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 mb-4">
              <Landmark className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Bank Branch Registration</h1>
            <p className="text-slate-400 text-sm">Register as an underwriter partner branch</p>
          </div>

          {}
          {serverError && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-red-400 text-sm">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="reg-admin-name" className="block text-sm font-medium text-slate-300">
                  Officer Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input
                    id="reg-admin-name"
                    type="text"
                    placeholder="Vijay Kumar"
                    className={`w-full bg-white/5 border rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${errors.admin_name ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10 focus:ring-emerald-500/30 focus:border-emerald-500/50'}`}
                    {...register('admin_name', { required: 'Required', minLength: { value: 2, message: 'Too short' } })}
                  />
                </div>
                {errors.admin_name && <p className="text-red-400 text-xs">{errors.admin_name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reg-phone" className="block text-sm font-medium text-slate-300">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input
                    id="reg-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    className={`w-full bg-white/5 border rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${errors.phone ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10 focus:ring-emerald-500/30 focus:border-emerald-500/50'}`}
                    {...register('phone', {
                      required: 'Phone is required',
                      pattern: { value: /^\+?[1-9]\d{7,14}$/, message: 'Invalid phone number' },
                    })}
                  />
                </div>
                {errors.phone && <p className="text-red-400 text-xs">{errors.phone.message}</p>}
              </div>
            </div>

            {}
            <div className="space-y-1.5">
              <label htmlFor="reg-email" className="block text-sm font-medium text-slate-300">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  id="reg-email"
                  type="email"
                  placeholder="vijay.kumar@sbi.co.in"
                  className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${errors.email ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10 focus:ring-emerald-500/30 focus:border-emerald-500/50'}`}
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' },
                  })}
                />
              </div>
              {errors.email && <p className="text-red-400 text-xs">{errors.email.message}</p>}
            </div>

            {}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="reg-bank-name" className="block text-sm font-medium text-slate-300">
                  Bank Name
                </label>
                <div className="relative">
                  <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input
                    id="reg-bank-name"
                    type="text"
                    placeholder="State Bank of India"
                    className={`w-full bg-white/5 border rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${errors.bank_name ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10 focus:ring-emerald-500/30 focus:border-emerald-500/50'}`}
                    {...register('bank_name', { required: 'Required' })}
                  />
                </div>
                {errors.bank_name && <p className="text-red-400 text-xs">{errors.bank_name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reg-branch-name" className="block text-sm font-medium text-slate-300">
                  Branch Name
                </label>
                <div className="relative">
                  <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input
                    id="reg-branch-name"
                    type="text"
                    placeholder="Mumbai Main"
                    className={`w-full bg-white/5 border rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${errors.branch_name ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10 focus:ring-emerald-500/30 focus:border-emerald-500/50'}`}
                    {...register('branch_name', { required: 'Required' })}
                  />
                </div>
                {errors.branch_name && <p className="text-red-400 text-xs">{errors.branch_name.message}</p>}
              </div>
            </div>

            {}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="reg-ifsc" className="block text-sm font-medium text-slate-300">
                  IFSC Code (11 chars)
                </label>
                <input
                  id="reg-ifsc"
                  type="text"
                  placeholder="SBIN0000300"
                  className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all uppercase ${errors.ifsc_code ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10 focus:ring-emerald-500/30 focus:border-emerald-500/50'}`}
                  {...register('ifsc_code', {
                    required: 'IFSC is required',
                    maxLength: { value: 11, message: 'Max 11 characters' },
                    minLength: { value: 11, message: 'Must be 11 characters' }
                  })}
                />
                {errors.ifsc_code && <p className="text-red-400 text-xs">{errors.ifsc_code.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reg-city" className="block text-sm font-medium text-slate-300">
                  Branch City
                </label>
                <input
                  id="reg-city"
                  type="text"
                  placeholder="Mumbai"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
                  {...register('city')}
                />
              </div>
            </div>

            {}
            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  className={`w-full bg-white/5 border rounded-xl pl-10 pr-11 py-3 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all ${errors.password ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10 focus:ring-emerald-500/30 focus:border-emerald-500/50'}`}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'At least 8 characters' },
                    validate: {
                      hasUpper: (v) => /[A-Z]/.test(v) || 'Needs uppercase letter',
                      hasNumber: (v) => /[0-9]/.test(v) || 'Needs a number',
                      hasSpecial: (v) => /[^A-Za-z0-9]/.test(v) || 'Needs special character',
                    },
                  })}
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
              {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
              <PasswordStrength password={password} />
            </div>

            {}
            <button
              id="bank-register-btn"
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 shadow-lg shadow-emerald-500/20 mt-2"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Registering...</>
              ) : (
                <>Register Branch<ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-slate-300 text-sm mt-6">
            Already registered?{' '}
            <Link to="/bank/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
        <p className="text-center text-slate-400 text-xs mt-6">
          AI Loan Underwriting Platform · Secure & Encrypted
        </p>
      </div>
    </div>
  );
}
