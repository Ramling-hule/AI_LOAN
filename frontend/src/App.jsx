import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';


import LoginPage from '@/pages/LoginPage';
import SMELoginPage from '@/pages/SMELoginPage';
import SMERegisterPage from '@/pages/SMERegisterPage';
import BankAdminLoginPage from '@/pages/BankAdminLoginPage';
import BankAdminRegisterPage from '@/pages/BankAdminRegisterPage';
import UnauthorizedPage from '@/pages/UnauthorizedPage';
import DashboardPage from '@/pages/DashboardPage';
import LoanApplicationPage from '@/pages/LoanApplicationPage';


import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';





function App() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground animate-fade-in">
      <Routes>
        {}
        <Route
          path="/"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
          }
        />
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
          }
        />

        {}
        <Route
          path="/sme/login"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <SMELoginPage />
          }
        />
        <Route
          path="/sme/register"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <SMERegisterPage />
          }
        />

        {}
        <Route
          path="/bank/login"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <BankAdminLoginPage />
          }
        />
        <Route
          path="/bank/register"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <BankAdminRegisterPage />
          }
        />

        {}
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {}
        <Route
          path="/loan/apply"
          element={
            <ProtectedRoute roles={['sme']}>
              <LoanApplicationPage />
            </ProtectedRoute>
          }
        />

        {}
        <Route
          path="*"
          element={
            <div className="flex min-h-screen items-center justify-center bg-slate-950">
              <div className="text-center space-y-4">
                <h1 className="text-4xl font-extrabold text-white">404</h1>
                <p className="text-slate-400">Page not found</p>
                <button
                  onClick={() => window.history.back()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-all"
                >
                  Go Back
                </button>
              </div>
            </div>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
