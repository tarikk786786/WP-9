# WP-9 Security & Hardening Architecture

## 1. Zero-Trust Ingress & Credentials
- **Worker API Secret**: Communication between Vercel dashboard and the worker uses timing-safe token verification via `WORKER_API_SECRET`.
- **SSRF Hardening**: `SafeWebFetcher` strictly denies private loopback addresses, local class A/B/C subnets, and cloud instance metadata services (`169.254.169.254`).
- **Prompt Injection Defense**: Untrusted external web content and incoming messages are scrubbed of prompt injection patterns and treated exclusively as data.

## 2. HTTP Security Headers
All worker responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`

## 3. Contact & Tenant Privacy
- Contact metadata, private vocabulary, and memory are scoped exclusively to their respective chats and never leak across conversations.
