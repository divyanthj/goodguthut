"use client";

import { Dialog } from "@headlessui/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export default function AdminOrderQrPayment({ initialOrder, onOrderUpdated, onClose }) {
  const [order, setOrder] = useState(initialOrder);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const callbackRef = useRef(onOrderUpdated);
  const requestRef = useRef(false);
  const aliveRef = useRef(true);
  callbackRef.current = onOrderUpdated;
  const terminal = ["paid", "expired", "cancelled"].includes(order.payment?.status);
  const paid = order.payment?.status === "paid";

  const checkPayment = useCallback(async (cancel = false) => {
    if (requestRef.current) return;
    requestRef.current = true;
    if (cancel) setIsCancelling(true);
    else setIsChecking(true);
    try {
      const response = await fetch(`/api/admin/order-plans/${initialOrder.id}/qr`, {
        method: cancel ? "DELETE" : "GET", cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check payment.");
      if (!data.orderPlan) throw new Error("Payment status is unavailable.");
      if (!aliveRef.current) return;
      setOrder(data.orderPlan);
      setError("");
      callbackRef.current?.(data.orderPlan);
    } catch (checkError) {
      if (aliveRef.current) setError(checkError.message || "Could not check payment. Please try again.");
    } finally {
      requestRef.current = false;
      if (aliveRef.current) { setIsChecking(false); setIsCancelling(false); }
    }
  }, [initialOrder.id]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (terminal) return;
    checkPayment();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") checkPayment();
    }, 5000);
    const onVisibility = () => { if (document.visibilityState === "visible") checkPayment(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [checkPayment, terminal]);

  return (
    <Dialog open onClose={onClose} className="fixed inset-0 z-[60]">
      <div className="fixed inset-0 bg-[#213a2f]/60" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
          <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-[#fffdf8] p-4 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-xl font-bold text-[#213a2f]">
                {paid ? "Payment received" : terminal ? "QR payment closed" : "Customer QR payment"}
              </Dialog.Title>
              <button type="button" className="btn btn-ghost min-h-11" onClick={onClose}>Close</button>
            </div>
            <Dialog.Description className="mt-2 text-sm text-[#53675d]">
              {paid ? "The payment has been verified with Razorpay."
                : terminal ? "This QR code can no longer accept payments."
                : "Ask the customer to scan this QR code with their UPI app. Payment status updates automatically."}
            </Dialog.Description>
            <p className="mt-4 break-words text-sm font-medium">{order.orderNumber} · {order.name}</p>
            <p className="mt-2 text-3xl font-bold text-[#355a45]">{order.currency} {Number(order.total).toFixed(2)}</p>
            {!terminal && (
              <>
                <div className="mt-4 flex justify-center rounded-xl border border-[#ddcfb6] bg-white p-3">
                  <Image src={order.payment.qrImageUrl} alt={`Scan to pay for order ${order.orderNumber}`} width={320} height={320} unoptimized className="h-auto w-full max-w-[320px]" />
                </div>
                <p className="mt-3 text-center text-sm text-[#53675d]">
                  Valid until {new Date(order.payment.qrExpiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Pay the exact amount shown above.
                </p>
              </>
            )}
            <div className={`mt-4 rounded-xl p-3 text-sm ${paid ? "bg-[#eef7ef] text-[#264f35]" : "bg-[#f8f4ea] text-[#53675d]"}`} role="status">
              {paid ? order.status === "cancelled"
                ? "Payment received for a cancelled order. Please review the order before production."
                : order.inventory?.status === "shortfall"
                ? "Payment received. This order needs an inventory review before production."
                : "Payment received. This order is confirmed and ready for the usual production flow."
                : terminal ? "No successful payment has been received for this order."
                : isChecking ? "Checking Razorpay for payment…" : "Waiting for the customer to pay…"}
            </div>
            {error && <p className="mt-3 text-sm text-error" role="alert">{error}</p>}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!terminal ? (
                <>
                  <button type="button" className="btn btn-primary" disabled={isChecking || isCancelling} onClick={() => checkPayment()}>Check payment now</button>
                  <button type="button" className="btn btn-outline text-error" disabled={isChecking || isCancelling} onClick={() => checkPayment(true)}>{isCancelling ? "Cancelling…" : "Cancel unpaid order"}</button>
                </>
              ) : <button type="button" className="btn btn-primary sm:col-span-2" onClick={onClose}>Start another order</button>}
            </div>
            {!terminal && <p className="mt-3 text-xs text-[#6b7d74]">Closing this screen keeps the order pending. You can reopen its QR code from Orders.</p>}
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  );
}
