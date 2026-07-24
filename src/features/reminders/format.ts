/** Humanized lead time: "At start", "45 min before", "2 hours before", "1 day before". */
export function formatLead(minutes: number): string {
  if (minutes <= 0) return 'At start';
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 day before' : `${days} days before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour before' : `${hours} hours before`;
  }
  return `${minutes} min before`;
}
