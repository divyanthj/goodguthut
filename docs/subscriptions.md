# Prepaid kanji subscriptions

New website subscriptions are weekly, with six bottles per delivery. Plans are Trial (one week), two weeks, and four weeks. Customers can select a mixed box (two each of the three active kanji variants) or six bottles of one variant. The mixed option is available only when there are exactly three active kanji SKUs; no arbitrary variant is omitted to fit the box.

The server reads current SKU prices and charges the bottle subtotal for all weeks plus a single INR 50 processing fee. Delivery is included. TRAYA gives 5% off bottles for two weeks and 10% for four weeks; it cannot discount the trial or the fee and cannot be used on one-time orders. No coupon means regular pricing.

New records retain `mode: recurring` for compatibility with weekly fulfillment, but have `paymentType: one_time`. Razorpay receives one payment order for the full amount; no payment mandate or Razorpay subscription is created. Weekly item quantities remain per delivery, while `subtotal`, `discount`, and `total` represent the whole prepaid purchase. `payment.totalCount` stores the delivery count. Inventory is reserved for all weeks, and payment confirmation commits those quantities. Admin delivery actions advance the existing schedule and mark the plan fulfilled after its final delivery. Delivery invoices allocate bottle discounts across weeks and include the processing fee only on the first delivery invoice.

Existing autopay records retain their legacy billing and editing behavior. They are not migrated or cancelled by this change.

## Renewal emails

`vercel.json` runs `/api/cron/subscription-renewals` daily at 04:30 UTC (10:00 IST). Configure `CRON_SECRET` in the deployment environment so Vercel can authenticate the job. The existing `RESEND_API_KEY`, optional `RESEND_FROM_EMAIL`, and `SITE_URL` email configuration also apply. On other hosts, schedule an authenticated GET to that endpoint daily with `Authorization: Bearer <CRON_SECRET>`.

Paid subscriptions receive a renewal invitation during the final three days of their purchased period. The end date is the first delivery date plus the number of purchased weeks, minus one day. Cancelled, failed, and unpaid plans are excluded. The database stores the sent timestamp and claims each reminder to prevent concurrent sends; failed sends can be retried. The provider also receives an idempotency key. Renewal links open subscription selection on the storefront; the customer must place and pay for a new order themselves.

## Validation

Run `npm run test:subscriptions`, `npm run lint`, and `npm run build`. The subscription tests use service doubles and never charge customers or send real emails. Before release, verify the active catalog, delivery configuration, Razorpay checkout and capture/webhook flow, and renewal job in a connected staging environment.
