import { format, formatDistanceToNow } from 'date-fns';

export function fmtDate(value?: string | Date | null) {
  if (!value) return '—';
  return format(new Date(value), 'dd MMM yyyy');
}

export function fmtDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return format(new Date(value), 'dd MMM, h:mm a');
}

export function fmtTime(value?: string | Date | null) {
  if (!value) return '—';
  return format(new Date(value), 'h:mm a');
}

export function ago(value?: string | Date | null) {
  if (!value) return '';
  return `${formatDistanceToNow(new Date(value))} ago`;
}

export function humanize(value?: string | null) {
  if (!value) return '';
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
