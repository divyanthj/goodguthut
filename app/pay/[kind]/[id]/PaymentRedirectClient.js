"use client";

import { useEffect } from "react";

export default function PaymentRedirectClient({ paymentUrl = "" }) {
  useEffect(() => {
    if (!paymentUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      window.location.href = paymentUrl;
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [paymentUrl]);

  if (!paymentUrl) {
    return null;
  }

  return (
    <a className="btn btn-primary mt-6" href={paymentUrl}>
      Continue to secure payment
    </a>
  );
}
