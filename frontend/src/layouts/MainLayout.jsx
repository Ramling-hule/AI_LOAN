
import React from 'react';
import { Outlet } from 'react-router-dom';

export default function MainLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      {}
      <aside className="w-64 border-r border-border bg-card hidden lg:block">
        <div className="p-4">
          <p className="text-sm text-muted-foreground">Sidebar — not yet implemented</p>
        </div>
      </aside>

      {}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
