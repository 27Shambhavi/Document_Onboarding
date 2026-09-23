import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PageHeaderActionsProps {
  children: React.ReactNode;
}

/**
 * PageHeaderActions teleports page-specific header action buttons, badges,
 * or status indicators directly into the unified Top Page Header in DashboardLayout.
 */
export const PageHeaderActions: React.FC<PageHeaderActionsProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const target = document.getElementById('dashboard-header-actions');
  if (!target) return null;

  return createPortal(children, target);
};

export default PageHeaderActions;
