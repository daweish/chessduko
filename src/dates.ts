export function LocalDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function RecentDates(now = new Date()): string[] {
  return Array.from({ length: 7 }, (_, n) =>
    LocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 12)),
  );
}
export function DateLabel(seed: string): string {
  const [year, month, day] = seed.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(year, month - 1, day, 12),
  );
}
export function UntilMidnight(now = new Date()): number {
  return (
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 100
  );
}
