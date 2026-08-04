import crypto from 'node:crypto'

// Minimal RFC 6238 (TOTP) / RFC 4226 (HOTP) implementation using only Node's
// built-in crypto — no external dependency for something this small and
// security-sensitive to get exactly right.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1]! & 0xf
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  return (code % 10 ** DIGITS).toString().padStart(DIGITS, '0')
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

export function generateTotpUri(base32Secret: string, accountEmail: string, issuer = 'Ich habe Zeit'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`)
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

// Accepts a code from the current step or one step before/after, to tolerate
// clock drift between the server and the authenticator app.
export function verifyTotpToken(base32Secret: string, token: string, windowSteps = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false
  const secret = base32Decode(base32Secret)
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS)
  for (let drift = -windowSteps; drift <= windowSteps; drift++) {
    if (hotp(secret, counter + drift) === token) return true
  }
  return false
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-')
  )
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex')
}
