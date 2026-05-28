import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ---------------------------------------------------------------------------
// cn — shadcn/ui utility for merging Tailwind classes safely
// ---------------------------------------------------------------------------

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Format currency (INR for SME loans in India)
// ---------------------------------------------------------------------------

export function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Format date
// ---------------------------------------------------------------------------

export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(date));
}

// ---------------------------------------------------------------------------
// Truncate text
// ---------------------------------------------------------------------------

export function truncate(str, maxLength = 50) {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength)}...`;
}

// ---------------------------------------------------------------------------
// Get initials from a name
// ---------------------------------------------------------------------------

export function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
