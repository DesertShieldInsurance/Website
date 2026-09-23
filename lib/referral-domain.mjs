import { z } from 'zod';
import { randomBytes, createHash, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

export const statuses = ['received', 'contacted', 'info_needed', 'quoted', 'bound', 'closed'];
export const publicNotes = [
  'Your referral is with our team. We will contact the carrier.',
  'We have connected with the carrier.',
  'We are gathering the information needed to prepare options.',
  'We are waiting on loss runs.',
  'Coverage options have been shared with the carrier.',
  'Coverage has been placed. Thank you for the introduction.',
  'This referral is closed. Contact our team with any questions.'
];
const text = z.string().trim().min(1).max(160);
const phone = z.string().trim().max(30).refine(v => /^\+?[\d\s().-]+$/.test(v) && v.replace(/\D/g, '').length >= 10 && v.replace(/\D/g, '').length <= 15, 'Enter a valid phone number.');
const email = z.email().max(254);
export function dateValid(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function phoenixToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function within30(date, today = phoenixToday()) {
  if (!dateValid(date)) return false;
  const delta = (Date.parse(date) - Date.parse(today)) / 86400000;
  return delta >= 0 && delta <= 30;
}
const states = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
export const driverSchema = z.object({
  name: text,
  license: z.string().trim().min(3).max(30).regex(/^[A-Z0-9 -]+$/i),
  state: z.enum(states),
  dob: z.string().refine(v => dateValid(v) && v < phoenixToday() && v >= '1900-01-01', 'Enter a valid date of birth.')
});
export const referralSchema = z.object({
  requestId: z.uuid(),
  brokerName: text, brokerCompany: text, brokerEmail: email, brokerPhone: phone,
  insuredName: text, dot: z.string().trim().regex(/^\d{1,8}$/),
  insuredPhone: phone, insuredEmail: email,
  permission: z.literal(true),
  complete: z.boolean().default(false),
  coverageDate: z.string().refine(dateValid).optional(),
  vins: z.array(z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/)).max(100).default([]),
  drivers: z.array(driverSchema).max(100).default([]),
  allVehicles: z.boolean().default(false),
  allDrivers: z.boolean().default(false),
  sensitivePermission: z.boolean().default(false),
  website: z.string().max(0).optional()
}).superRefine((r, c) => {
  if (new Set(r.vins).size !== r.vins.length) c.addIssue({ code: 'custom', message: 'Each VIN must be unique.', path: ['vins'] });
  if (new Set(r.drivers.map(d=>`${d.state}:${d.license.toUpperCase().replace(/[ -]/g,'')}`)).size !== r.drivers.length) c.addIssue({ code: 'custom', message: 'Each driver license must be unique.', path: ['drivers'] });
  if (r.drivers.length && !r.sensitivePermission) c.addIssue({ code: 'custom', message: 'Driver-sharing permission is required.', path: ['sensitivePermission'] });
  if (r.complete && (!r.coverageDate || !r.vins.length || !r.drivers.length || !r.allVehicles || !r.allDrivers || !r.sensitivePermission)) {
    c.addIssue({ code: 'custom', message: 'A complete packet requires the coverage date, every VIN, every driver, and authorization.', path: ['complete'] });
  }
});
export const patchSchema = z.object({
  id: z.uuid(), version: z.number().int().positive(),
  status: z.enum(statuses), publicNote: z.enum(publicNotes),
  rewardStatus: z.enum(['not_eligible', 'pending_review', 'approved', 'sent', 'declined']),
  revoke: z.boolean().optional()
});
export const hash = v => createHash('sha256').update(v).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
function encryptionKey() {
  const key = Buffer.from(process.env.REFERRAL_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('Encryption is not configured');
  return key;
}
export function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString('base64url')).join('.');
}
export function decrypt(value) {
  const [iv, tag, body] = value.split('.').map(v => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8'));
}
export function verifyPassword(password, encoded) {
  try {
    const [salt, expected] = encoded.split(':');
    const actual = scryptSync(password, salt, 64);
    const wanted = Buffer.from(expected, 'hex');
    return wanted.length === actual.length && timingSafeEqual(wanted, actual);
  } catch { return false; }
}
function base32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of value.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid TOTP key');
    bits += index.toString(2).padStart(5, '0');
  }
  return Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
}
export function totpCode(secret, step) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function verifyTotp(code, secret, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const n of [step, step - 1, step + 1]) {
    if (timingSafeEqual(Buffer.from(code), Buffer.from(totpCode(secret, n)))) return n;
  }
  return null;
}
export function publicReferral(row, events = []) {
  return {
    id: row.id, company: row.company, status: row.status, publicNote: row.public_note,
    createdAt: row.created_at, updatedAt: row.updated_at, complete: row.packet_complete,
    vehicleCount: row.vehicle_count, driverCount: row.driver_count,
    rewardStatus: row.reward_status,
    events: events.map(e => ({ status: e.status, note: e.note, createdAt: e.created_at }))
  };
}
