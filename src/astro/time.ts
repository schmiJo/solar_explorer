/** Julian date helpers. Everything in the simulation is driven by a JD. */

export const J2000 = 2451545.0;
export const DAY_MS = 86_400_000;
/** Julian date of the Unix epoch, 1970-01-01T00:00:00Z. */
const UNIX_EPOCH_JD = 2440587.5;

export const dateToJD = (d: Date): number => d.getTime() / DAY_MS + UNIX_EPOCH_JD;
export const jdToDate = (jd: number): Date => new Date((jd - UNIX_EPOCH_JD) * DAY_MS);
export const nowJD = (): number => dateToJD(new Date());

/** Julian centuries since J2000.0. */
export const centuriesSinceJ2000 = (jd: number): number => (jd - J2000) / 36525;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Mar 2031  09:42 UTC", or a bare year once we are far outside human timescales. */
export function formatJD(jd: number): string {
  const d = jdToDate(jd);
  const year = d.getUTCFullYear();
  if (!Number.isFinite(year)) return 'beyond range';
  if (year < -9999 || year > 9999) {
    const kyr = year / 1000;
    return `${kyr > 0 ? '+' : ''}${kyr.toFixed(1)} kyr`;
  }
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const era = year < 0 ? ` BC` : '';
  return `${day} ${MONTHS[d.getUTCMonth()]} ${Math.abs(year)}${era}  ${hh}:${mm} UTC`;
}

/** Human-readable simulation rate, given days of simulated time per real second. */
export function formatRate(daysPerSecond: number): string {
  const a = Math.abs(daysPerSecond);
  const sign = daysPerSecond < 0 ? '−' : '';
  if (a === 0) return 'paused';
  if (a < 1 / 86400) return `${sign}${(a * 86400 * 1000).toFixed(0)} ms/s`;
  if (a < 1 / 1440) return `${sign}${(a * 86400).toFixed(1)} sec/s`;
  if (a < 1 / 24) return `${sign}${(a * 1440).toFixed(1)} min/s`;
  if (a < 1) return `${sign}${(a * 24).toFixed(1)} hr/s`;
  if (a < 365.25) return `${sign}${a.toFixed(a < 10 ? 1 : 0)} days/s`;
  if (a < 36525) return `${sign}${(a / 365.25).toFixed(a < 3652 ? 1 : 0)} yr/s`;
  return `${sign}${(a / 365250).toFixed(1)} kyr/s`;
}
