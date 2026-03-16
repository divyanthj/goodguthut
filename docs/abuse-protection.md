# Abuse Protection

This app now rejects cross-site browser POSTs, oversized payloads, and malformed public API input in code. Production rate limiting still needs to be enforced at the hosting or proxy layer.

## Recommended proxy/WAF rules

Apply per-IP rate limits keyed by both client IP and path:

- `POST /api/preorder`
  - Burst: 5 requests per 10 minutes
  - Sustained: 20 requests per day
- `POST /api/lead`
  - Burst: 3 requests per 10 minutes
  - Sustained: 10 requests per day
- `POST /api/preorder/address-autocomplete`
  - Burst: 20 requests per 5 minutes
  - Sustained: 120 requests per hour
- `POST /api/preorder/address-place`
  - Burst: 10 requests per 10 minutes
  - Sustained: 60 requests per hour
- `POST /api/preorder/delivery-quote`
  - Burst: 10 requests per 10 minutes
  - Sustained: 60 requests per hour

## Proxy response contract

When a request is throttled, return:

- Status: `429 Too Many Requests`
- Body:

```json
{
  "error": "Too many attempts right now. Please wait a moment and try again."
}
```

## Client IP source

Configure the proxy or host to trust the platform forwarded client IP header and avoid keying limits from the raw origin socket IP. The app reads:

1. `x-forwarded-for`
2. `x-real-ip`
3. `cf-connecting-ip`
4. `x-vercel-forwarded-for`

## Monitoring

- Track 429 counts per protected path in hosting analytics.
- Watch for repeated structured logs with `"category":"abuse-protection"` to identify malformed or suspicious traffic that was blocked in-app.
