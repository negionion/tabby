/** Removes keys, tokens and passwords from text before it is sent to the AI provider */

/** Secret names; the lookbehind also matches after "_" (sae_password, wpa_passphrase) but not inside words */
const SECRET_NAMES = '(?<![A-Za-z0-9])(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|pwd|passphrase|psk)'
const SECRET_QUOTED_PATTERN = new RegExp(`${SECRET_NAMES}(["']?\\s*[:=]\\s*)(["'])(?:(?!\\3).)*\\3`, 'gi')
const SECRET_PLAIN_PATTERN = new RegExp(`${SECRET_NAMES}(["']?\\s*[:=]\\s*)([^\\s'",;]+)`, 'gi')

export function redactSensitiveText (text: string): string {
    return text
        .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted-private-key]')
        .replace(/(authorization\s*:\s*bearer\s+)[^\s'"]+/gi, '$1[redacted]')
        .replace(/\b(sk-[A-Za-z0-9_-]{20,})\b/g, '[redacted-openai-key]')
        .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g, '[redacted-github-token]')
        .replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[redacted-aws-key]')
        .replace(/\b(xox[baprs]-[A-Za-z0-9-]{20,})\b/g, '[redacted-slack-token]')
        .replace(/:\/\/([^:\s/@]+):([^@\s]+)@/g, '://[redacted]@')
        // name=value, name: value, "name": "value", sae_password=..., wpa_passphrase=...
        .replace(SECRET_QUOTED_PATTERN, '$1$2$3[redacted]$3')
        .replace(SECRET_PLAIN_PATTERN, '$1$2[redacted]')
        // OpenWrt Wi-Fi keys: `uci show` (wireless.x.key='...') and /etc/config (option key '...')
        .replace(/(\.key=|\boption\s+key\s+)(["'])(?:(?!\2).)*\2/gi, '$1$2[redacted]$2')
        .replace(/(\.key=)([^\s'"]+)/gi, '$1[redacted]')
}
