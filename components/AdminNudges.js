"use client";

import { useMemo, useState } from "react";

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
  });
};

const formatMoney = (currency = "INR", amount = 0) =>
  `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`;

export default function AdminNudges({
  initialCustomers = [],
  discountCodes = [],
  initialThresholdDays = 60,
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [thresholdDays, setThresholdDays] = useState(initialThresholdDays);
  const [selectedDiscountCodeId, setSelectedDiscountCodeId] = useState(
    discountCodes.find((code) => code.isNumberRestricted)?.id || discountCodes[0]?.id || ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [sendingKey, setSendingKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedDiscountCode = useMemo(
    () => discountCodes.find((code) => code.id === selectedDiscountCodeId),
    [discountCodes, selectedDiscountCodeId]
  );

  const refreshCustomers = async (nextThresholdDays = thresholdDays) => {
    setIsLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/admin/nudges?thresholdDays=${encodeURIComponent(nextThresholdDays)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load lapsed customers.");
      }

      setCustomers(data.customers || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load lapsed customers.");
    } finally {
      setIsLoading(false);
    }
  };

  const sendNudge = async (customer) => {
    if (!selectedDiscountCodeId) {
      setError("Choose a discount code before sending a nudge.");
      return;
    }

    const shouldSend = window.confirm(
      `Send a retention nudge to ${customer.customerName || customer.phone} with code ${
        selectedDiscountCode?.code || "the selected code"
      }?`
    );

    if (!shouldSend) {
      return;
    }

    setSendingKey(customer.phoneKey);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneKey: customer.phoneKey,
          discountCodeId: selectedDiscountCodeId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send retention nudge.");
      }

      setCustomers((current) =>
        current.map((item) => (item.phoneKey === customer.phoneKey ? data.customer : item))
      );

      setMessage(
        data.emailDelivery?.status === "sent"
          ? "Retention nudge sent."
          : data.emailDelivery?.reason === "missing_email"
            ? "Nudge recorded, but no email was sent because the customer has no email."
            : "Nudge recorded, but email delivery did not complete."
      );
    } catch (sendError) {
      setError(sendError.message || "Could not send retention nudge.");
    } finally {
      setSendingKey("");
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-2xl bg-base-100 p-4 shadow-xl md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Inactive for at least</span>
          </div>
          <div className="join">
            <input
              type="number"
              min="1"
              max="365"
              className="input input-bordered join-item w-full"
              value={thresholdDays}
              onChange={(event) => setThresholdDays(Number(event.target.value || 1))}
            />
            <span className="btn join-item no-animation">days</span>
          </div>
        </label>

        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Discount code</span>
          </div>
          <select
            className="select select-bordered"
            value={selectedDiscountCodeId}
            onChange={(event) => setSelectedDiscountCodeId(event.target.value)}
          >
            {discountCodes.length === 0 ? (
              <option value="">No active discount codes</option>
            ) : (
              discountCodes.map((discountCode) => (
                <option key={discountCode.id} value={discountCode.id}>
                  {discountCode.code} - {Number(discountCode.amount || 0)}% off
                  {discountCode.isNumberRestricted ? " - number restricted" : " - public"}
                </option>
              ))
            )}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-primary"
          disabled={isLoading}
          onClick={() => refreshCustomers(thresholdDays)}
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {message && <div className="alert alert-success"><span>{message}</span></div>}
      {error && <div className="alert alert-error"><span>{error}</span></div>}

      <section className="rounded-2xl bg-base-100 p-4 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Lapsed customers</h2>
            <p className="text-sm opacity-70">
              Showing customers whose latest order is older than {thresholdDays} days.
            </p>
          </div>
          <div className="badge badge-outline">{customers.length} customers</div>
        </div>

        {customers.length === 0 ? (
          <div className="rounded-xl border border-base-300 p-4 text-sm opacity-75">
            No lapsed customers found for this threshold.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Last order</th>
                  <th>Last nudge</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.phoneKey}>
                    <td>
                      <div className="font-medium">{customer.customerName || "-"}</div>
                      <div className="text-xs opacity-70">{customer.email || "No email"}</div>
                    </td>
                    <td>{customer.phone}</td>
                    <td>
                      <div>{formatDate(customer.lastOrderAt)}</div>
                      <div className="text-xs opacity-70">
                        {formatMoney(customer.currency, customer.lastOrderTotal)}
                      </div>
                    </td>
                    <td>
                      <div>{formatDate(customer.lastNudgedAt)}</div>
                      {customer.lastNudgeCode && (
                        <div className="text-xs opacity-70">
                          {customer.lastNudgeCode} ({customer.lastNudgeStatus || "recorded"})
                        </div>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={
                          sendingKey === customer.phoneKey ||
                          !selectedDiscountCodeId ||
                          !customer.email
                        }
                        onClick={() => sendNudge(customer)}
                      >
                        {sendingKey === customer.phoneKey ? "Sending..." : "Send nudge"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
