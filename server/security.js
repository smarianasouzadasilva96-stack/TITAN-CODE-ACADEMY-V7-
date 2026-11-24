import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import ipaddr from 'ipaddr.js';

const derive = promisify(scrypt);
export const day = 86400000;
export const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('base64url');
export const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

export function equal(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function passwordHash(password, salt = randomBytes(16).toString('base64url')) {
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}.${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const hash = await passwordHash(password, stored?.split('.')[0] || 'auth-unknown-account');
  return Boolean(stored && equal(hash, stored));
}

export function parseMaster(raw) {
  if (!raw) return null;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw) || Buffer.from(raw, 'base64').length !== 32) {
    throw new Error('TITAN_MASTER_KEY deve conter 32 bytes aleatórios codificados em base64.');
  }
  return Buffer.from(raw, 'base64');
}

export function vault(master) {
  const aad = identity => Buffer.from(JSON.stringify(['titan-credential-v1', ...identity]));
  return {
    seal(secret, identity) {
      if (!master) throw fail(503, 'Armazenamento persistente indisponível. Use a opção de sessão.');
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', master, nonce);
      cipher.setAAD(aad(identity));
      const payload = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
      return [nonce, cipher.getAuthTag(), payload].map(part => part.toString('base64url')).join('.');
    },
    open(sealed, identity) {
      if (!master) throw fail(503, 'Armazenamento de credenciais indisponível.');
      try {
        const parts = sealed.split('.');
        if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part))) throw new Error();
        const [nonce, tag, data] = parts.map(part => Buffer.from(part, 'base64url'));
        if (nonce.length !== 12 || tag.length !== 16) throw new Error();
        const cipher = createDecipheriv('aes-256-gcm', master, nonce, { authTagLength: 16 });
        cipher.setAAD(aad(identity));
        cipher.setAuthTag(tag);
        return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
      } catch { throw fail(503, 'Credencial indisponível. Cadastre a chave novamente.'); }
    }
  };
}

export function rateLimiter() {
  const buckets = new Map();
  let salt = token();
  let rotation = Date.now() + day;
  const limit = (id, scope, max, time = 60000) => {
    const now = Date.now();
    if (now > rotation) { buckets.clear(); salt = token(); rotation = now + day; }
    const key = createHmac('sha256', salt).update(scope + ':' + id).digest('base64url');
    const bucket = buckets.get(key);
    if (bucket && now < bucket.expires) {
      if (bucket.count >= max) throw fail(429, 'Limite de solicitações atingido. Tente novamente em instantes.');
      bucket.count++;
      return;
    }
    if (buckets.size >= 10000) {
      for (const [oldKey, entry] of buckets) if (entry.expires <= now) buckets.delete(oldKey);
      if (buckets.size >= 10000 && !buckets.has(key)) throw fail(429, 'Muitas solicitações simultâneas.');
    }
    buckets.set(key, { expires: now + time, count: 1 });
  };
  limit.prune = () => {
    const now = Date.now();
    for (const [key, entry] of buckets) if (now >= entry.expires) buckets.delete(key);
  };
  return limit;
}

export function text(value, max, label, { optional = false, trim = true } = {}) {
  if (value == null && optional) return '';
  if (typeof value !== 'string' || value.length > max) throw fail(400, `${label} inválido.`);
  const result = trim ? value.trim() : value;
  if (!result && !optional) throw fail(400, `${label} obrigatório.`);
  return result;
}

export function checkOrigin(req, origin) {
  const received = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site' || (received != null && received !== origin)) {
    throw fail(403, 'Origem não autorizada.');
  }
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw fail(415, 'Envie application/json.');
  }
}

export async function body(req, max = 262144) {
  const length = Number(req.headers['content-length']);
  if (length > max) throw fail(413, 'Conteúdo excede o limite.');
  const parts = [];
  let size = 0;
  for await (const part of req.iterator({ destroyOnReturn: false })) {
    size += part.length;
    if (size > max) throw fail(413, 'Conteúdo excede o limite.');
    parts.push(part);
  }
  try {
    const data = JSON.parse(Buffer.concat(parts).toString());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw fail(400, 'Envie um objeto JSON válido.'); }
}

const emailInName = /[^\s@]+@[^\s@]+\.[^\s@]+/;
export function displayName(value) {
  return typeof value === 'string' && value.trim() && !emailInName.test(value) ? value.trim() : 'Estudante';
}

export function profileName(value) {
  const name = text(value, 70, 'Nome de exibição');
  if (emailInName.test(name)) throw fail(400, 'Escolha um nome de exibição diferente do seu endereço de e-mail.');
  return name;
}

export function proxyPeer(address, allow = '') {
  const ip = ipaddr.isValid(address || '') ? ipaddr.process(address) : null;
  if (!ip) return false;
  if (ip.range() === 'loopback') return true;
  return allow.split(',').map(item => item.trim()).some(item => {
    if (item === 'private') return ['private', 'uniqueLocal'].includes(ip.range());
    return ipaddr.isValid(item) && ipaddr.process(item).toString() === ip.toString();
  });
}
