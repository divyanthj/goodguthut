# Admin face-to-face QR orders

In **Admin → Orders → Add phone or face-to-face order**, enter the customer's
details, address, and items, then choose **Show payment QR code**. Email is
optional. The customer scans the Razorpay UPI QR on their own phone. Public
website checkout continues to use the existing Razorpay checkout.

The QR accepts one payment for the server-calculated INR total. Its expiry is
set to 30 minutes and the actual expiry returned by Razorpay is stored alongside
the inventory hold. The screen checks payment status every five seconds while
visible, and provides **Check payment now**. A pending QR can be reopened from
its order card after closing the screen. Refreshing Orders also reconciles up to
20 pending QR orders.

Only a captured payment fetched from that specific Razorpay QR, for the exact
amount and currency, confirms the order. Verification commits the existing
inventory allocation, updates delivery routes, and sends the usual customer and
admin confirmations. Inventory shortfalls remain available for admin review.
Unpaid expiry or cancellation closes payment and releases inventory. Cancelling
or deleting a pending QR order closes its QR first; a payment arriving during
cancellation is reconciled before allowing the destructive action.

The existing mark-paid, collect-later, and never-collect actions remain under
**Other payment options**. These are separate from verified QR payments.

## Razorpay setup

Use the existing `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and webhook secret.
The account must have QR Codes enabled. Subscribe the existing
`/api/webhook/razorpay` endpoint to `qr_code.credited` and `qr_code.closed` so
orders reconcile even while no admin screen is open. The QR screen and Orders
refresh provide API reconciliation in addition to the webhook.

References: [QR creation](https://razorpay.com/docs/api/qr-codes/create/),
[QR payment lookup](https://razorpay.com/docs/api/qr-codes/fetch-payments/),
[QR webhooks](https://razorpay.com/docs/webhooks/qr-codes/).

## Verification

Run `npm run test:admin-qr` for authorization, exact-amount captured-payment
checks, cancellation races, expiry, inventory, webhook routing, and public
checkout regression coverage. Run `npm run test:subscriptions` for the existing
subscription payment tests. Browser tests should mock creation and QR status
responses to avoid creating production orders; a real scan-and-pay remains a
separate live acceptance check.
