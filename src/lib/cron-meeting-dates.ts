import { subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { MY_TZ } from './timezone';

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const DD_MM_YYYY = /^\d{2}\/\d{2}\/\d{4}$/;

function normalizeMeetingDate(date: string): string | null {
  if (YYYY_MM_DD.test(date)) {
    return date;
  }

  if (DD_MM_YYYY.test(date)) {
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function getMalaysiaTodayKey(now: Date = new Date()): string {
  return formatInTimeZone(now, MY_TZ, 'yyyy-MM-dd');
}

export function getMeetingDateKey(date: string): string | null {
  return normalizeMeetingDate(date);
}

export function getReminderTargetDateKey(date: string, daysBefore: number): string | null {
  const normalizedDate = normalizeMeetingDate(date);
  if (!normalizedDate) {
    return null;
  }

  const malaysiaNoon = fromZonedTime(`${normalizedDate}T12:00:00`, MY_TZ);
  return formatInTimeZone(subDays(malaysiaNoon, daysBefore), MY_TZ, 'yyyy-MM-dd');
}