import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';





export function cn(...inputs) {
  return twMerge(clsx(inputs));
}





export function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}





export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(date));
}





export function truncate(str, maxLength = 50) {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength)}...`;
}





export function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
