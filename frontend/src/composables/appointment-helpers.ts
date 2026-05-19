/**
 * Pure helper utilities for appointment UI — color palette, formatting, time math.
 * Separate from use-appointments.ts (stateful composable) to keep that file lean
 * and so SFCs can import these without pulling the composable into every render path.
 */
import type { Appointment } from './use-appointments';
import { APPOINTMENT_TYPE_OPTIONS, APPOINTMENT_STATUS_OPTIONS } from './use-appointments';

// Re-export so component imports stay short
export { APPOINTMENT_TYPE_OPTIONS, APPOINTMENT_STATUS_OPTIONS };

/**
 * Extended appointment fields that the backend may or may not populate yet.
 * UI degrades gracefully when absent.
 */
export interface AppointmentExtras {
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string | null; email: string } | null;
  durationMin?: number | null;
}

export type AppointmentEx = Appointment & AppointmentExtras;

const SALE_PALETTE = [
  { bg: '#2f6ee5', soft: '#e8f0fe' },
  { bg: '#16a34a', soft: '#dcfce7' },
  { bg: '#d97706', soft: '#fef3c7' },
  { bg: '#7c3aed', soft: '#ede9fe' },
  { bg: '#db2777', soft: '#fce7f3' },
  { bg: '#0891b2', soft: '#cffafe' },
  { bg: '#dc2626', soft: '#fee2e2' },
  { bg: '#65a30d', soft: '#ecfccb' },
];

export function saleColor(userId: string | null | undefined): { bg: string; soft: string } {
  if (!userId) return { bg: '#64748b', soft: '#f1f5f9' };
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return SALE_PALETTE[h % SALE_PALETTE.length];
}

export function appointmentOwnerId(a: AppointmentEx): string | null {
  return a.assignedToId || a.statusChangedBy?.id || null;
}

export function appointmentOwnerName(a: AppointmentEx): string {
  return a.assignedTo?.fullName || a.statusChangedBy?.fullName || a.statusChangedBy?.email || 'Chưa gán';
}

export function typeIcon(type: string): string {
  switch (type) {
    case 'consultation': return '💬';
    case 'follow_up': return '🔁';
    case 'new_visit': return '🆕';
    default: return '📌';
  }
}

export function typeLabel(type: string): string {
  return APPOINTMENT_TYPE_OPTIONS.find(o => o.value === type)?.text ?? type;
}

export function statusLabel(status: string): string {
  return APPOINTMENT_STATUS_OPTIONS.find(o => o.value === status)?.text ?? status;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Trust `appointmentDate` (ISO with timezone) — never parse the legacy `appointmentTime` string. */
export function appointmentStart(a: AppointmentEx): Date {
  return new Date(a.appointmentDate);
}

export function appointmentEnd(a: AppointmentEx): Date {
  const start = appointmentStart(a);
  const dur = a.durationMin ?? 30;
  return new Date(start.getTime() + dur * 60_000);
}
