const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validMonitorTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shouldRunMonitor(now: Date, time: string, lastAttempt?: string): boolean {
  if (!validMonitorTime(time)) return false;
  if (lastAttempt && localDate(new Date(lastAttempt)) === localDate(now)) return false;
  const [hour, minute] = time.split(":").map(Number);
  return now.getHours() > hour! || (now.getHours() === hour && now.getMinutes() >= minute!);
}

export function recoveryStartDate(now: Date, lastSuccess?: string): string {
  return lastSuccess ? localDate(new Date(lastSuccess)) : localDate(now);
}
