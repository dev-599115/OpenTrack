/** [SCAC, display name]. Shared by the track form and the bookings list. */
export const CARRIERS: [string, string][] = [
  ['APLU', 'American Presidents Line'], ['CMDU', 'CMA CGM'], ['COSU', 'COSCO'], ['EGLV', 'Evergreen'],
  ['SUDU', 'Hamburg Süd'], ['HLCU', 'Hapag-Lloyd'], ['HDMU', 'HMM'], ['MAEU', 'Maersk'], ['MATU', 'Matson'],
  ['MEDU', 'MSC'], ['ONEY', 'Ocean Network Express'], ['OOLU', 'OOCL'], ['SAFM', 'Safmarine'],
  ['SMLM', 'SM Line'], ['MRSU', 'Sealand Maersk'], ['WHLC', 'Wan Hai'], ['YMLU', 'Yang Ming'], ['ZIMU', 'ZIM'],
];

/**
 * Best-effort SCAC for a booking row: master bills are normally prefixed with the carrier's SCAC, otherwise match the
 * carrier name. Returns undefined when nothing matches confidently, so callers can disable "Track" rather than guess.
 */
export function scacFor(carrierName?: string, masterBill?: string): string | undefined {
  const prefix = masterBill?.trim().slice(0, 4).toUpperCase();
  if (prefix && CARRIERS.some(([code]) => code === prefix)) return prefix;

  const n = carrierName?.trim().toLowerCase();
  if (!n || n.length < 3) return undefined;
  return CARRIERS.find(([code, name]) => code.toLowerCase() === n || n.includes(name.toLowerCase()) || name.toLowerCase().includes(n))?.[0];
}
