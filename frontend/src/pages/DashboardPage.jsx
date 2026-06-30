import React from 'react';
import { useAuth } from '@/context/AuthContext.jsx';
import SMEDashboard from './SMEDashboard.jsx';
import BankAdminDashboard from './BankAdminDashboard.jsx';





export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'sme') {
    return <SMEDashboard />;
  }

  return <BankAdminDashboard />;
}
