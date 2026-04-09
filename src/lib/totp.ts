
/**
 * TOTP (RFC 6238) — Pure Web Crypto API implementation.
 * No external dependencies. Works in any modern browser.
 */

function base32Decode(base32: string): Uint8Array {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    let index = 0;
    const output = new Uint8Array(Math.floor((cleaned.length * 5) / 8));

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
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return new Uint8Array(sig);
}

export async function generateTOTP(secret: string, window = 0): Promise<string> {
    const key = base32Decode(secret);
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30) + window;

    // Counter as 8-byte big-endian
    const counterBuffer = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
        counterBuffer[i] = c & 0xff;
        c = Math.floor(c / 256);
    }

    const hmac = await hmacSHA1(key, counterBuffer);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return String(code % 1_000_000).padStart(6, '0');
}

export async function verifyTOTP(secret: string, token: string): Promise<boolean> {
    // Allow window of -1, 0, +1 (30s tolerance each side)
    for (const w of [-1, 0, 1]) {
        const expected = await generateTOTP(secret, w);
        if (expected === token.trim()) return true;
    }
    return false;
}

export function getTOTPUri(secret: string, account: string, issuer = 'Nexus Master'): string {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
