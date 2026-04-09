/**
 * master-auth-validate — Supabase Edge Function
 *
 * Validates master login (email + password + TOTP) entirely server-side.
 * Secrets NEVER reach the browser. Stored in Supabase Dashboard → Edge Functions → Secrets.
 *
 * Required secrets (set in Supabase Dashboard):
 *   MASTER_EMAIL          → e-mail do super admin
 *   MASTER_PASSWORD       → senha forte do super admin
 *   MASTER_TOTP_SECRET    → segredo Base32 para TOTP (RFC 6238)
 *   MASTER_SESSION_TOKEN  → token aleatório retornado ao browser após login com sucesso
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── TOTP (RFC 6238) — Deno compatible ───────────────────────────────────────

function base32Decode(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  const output = new Uint8Array(Math.floor((cleaned.length * 5) / 8));
  let bits = 0, value = 0, index = 0;
  for (let i = 0; i < cleaned.length; i++) {
    value = (value << 5) | alphabet.indexOf(cleaned[i]);
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return output;
}

async function hmacSHA1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
}

async function generateTOTP(secret: string, window = 0): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor(Math.floor(Date.now() / 1000) / 30) + window;
  const counterBuf = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { counterBuf[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac = await hmacSHA1(key, counterBuf);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  );
  return String(code % 1_000_000).padStart(6, '0');
}

async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  for (const w of [-1, 0, 1]) {
    if (await generateTOTP(secret, w) === token.trim()) return true;
  }
  return false;
}

// ─── Rate Limiting (in-memory per instance) ──────────────────────────────────
// Note: For multi-instance deployments, use a KV store or Supabase table instead.

const attempts = new Map<string, { count: number; lockedUntil: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remainingSecs?: number } {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry) {
    if (entry.lockedUntil > now) {
      return { allowed: false, remainingSecs: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    if (entry.count >= 3) {
      // Expired lockout — reset
      attempts.delete(ip);
    }
  }
  return { allowed: true };
}

function registerFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= 3) {
    entry.lockedUntil = now + 5 * 60 * 1000; // 5 minute lockout
    entry.count = 0;
  }
  attempts.set(ip, entry);
}

function clearAttempts(ip: string): void {
  attempts.delete(ip);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  // Anti-timing: always wait ≥1.2s so response time reveals nothing
  const start = Date.now();
  const minDelay = () => new Promise(r => setTimeout(r, Math.max(0, 1200 - (Date.now() - start))));

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  try {
    const { email, password, totp } = await req.json();

    // Rate limit check
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      await minDelay();
      return new Response(JSON.stringify({
        success: false,
        error: `Acesso bloqueado. Tente novamente em ${rateCheck.remainingSecs} segundos.`,
        lockedSecs: rateCheck.remainingSecs,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load secrets from Supabase Dashboard (never in browser bundle)
    const masterEmail = Deno.env.get('MASTER_EMAIL');
    const masterPassword = Deno.env.get('MASTER_PASSWORD');
    const masterTotpSecret = Deno.env.get('MASTER_TOTP_SECRET');
    const masterSessionToken = Deno.env.get('MASTER_SESSION_TOKEN');

    if (!masterEmail || !masterPassword || !masterTotpSecret || !masterSessionToken) {
      await minDelay();
      return new Response(JSON.stringify({ success: false, error: 'Configuração de segurança incompleta no servidor.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate all 3 factors
    const emailOk = typeof email === 'string' && email.trim().toLowerCase() === masterEmail.toLowerCase();
    const passOk = typeof password === 'string' && password === masterPassword;
    const totpOk = typeof totp === 'string' && totp.length === 6 && await verifyTOTP(masterTotpSecret, totp);

    await minDelay();

    if (emailOk && passOk && totpOk) {
      clearAttempts(ip);
      return new Response(JSON.stringify({
        success: true,
        sessionToken: masterSessionToken, // Opaque token returned to browser — never the secrets
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      registerFailedAttempt(ip);
      return new Response(JSON.stringify({
        success: false,
        error: 'Credenciais inválidas ou código TOTP incorreto.',
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (err) {
    await minDelay();
    return new Response(JSON.stringify({ success: false, error: 'Requisição inválida.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
