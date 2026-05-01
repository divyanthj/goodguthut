"use client";

import { useMemo, useState } from "react";

const formatCurrency = (currency, amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getStatusClassName = (status = "") => {
  if (status === "sent") {
    return "badge-success";
  }

  if (status === "failed") {
    return "badge-error";
  }

  if (status === "skipped") {
    return "badge-warning";
  }

  return "badge-outline";
};

const getSourceLabel = (source = {}) => {
  if (source.type === "preorder") {
    return "Preorder";
  }

  if (source.type === "subscription") {
    return "Subscription";
  }

  if (source.type === "order_plan") {
    return source.label || "Order";
  }

  return source.type || "Order";
};

export default function AdminInvoicesList({ initialInvoices = [] }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [searchQuery, setSearchQuery] = useState("");
  const [resendingId, setResendingId] = useState("");
  const [error, setError] = useState("");

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return invoices;
    }

    return invoices.filter((invoice) => {
      const searchText = [
        invoice.invoiceNumber,
        invoice.invoiceLabel,
        invoice.customer?.name,
        invoice.customer?.email,
        invoice.customer?.phone,
        invoice.source?.type,
        invoice.source?.label,
        invoice.source?.deliveryKey,
        invoice.emailStatus,
        invoice.taxSummary?.gstTreatment,
        invoice.seller?.gstin,
        invoice.seller?.legalName || invoice.sellerName,
        formatCurrency(invoice.currency, invoice.grandTotal || invoice.total),
        String(invoice.grandTotal || invoice.total || ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchText.includes(query);
    });
  }, [invoices, searchQuery]);

  const summary = useMemo(
    () => ({
      total: filteredInvoices.length,
      sent: filteredInvoices.filter((invoice) => invoice.emailStatus === "sent").length,
      failed: filteredInvoices.filter((invoice) => invoice.emailStatus === "failed").length,
      skipped: filteredInvoices.filter((invoice) => invoice.emailStatus === "skipped").length,
      tax: filteredInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.taxSummary?.totalTaxAmount || 0),
        0
      ),
    }),
    [filteredInvoices]
  );

  const resendInvoice = async (invoiceId) => {
    setResendingId(invoiceId);
    setError("");

    try {
      const response = await fetch(`/api/admin/invoices/${invoiceId}/resend`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not resend invoice.");
      }

      setInvoices((current) =>
        current.map((invoice) => (invoice.id === invoiceId ? data.invoice : invoice))
      );
    } catch (resendError) {
      setError(resendError.message || "Could not resend invoice.");
    } finally {
      setResendingId("");
    }
  };

  if (invoices.length === 0) {
    return (
      <section className="rounded-2xl bg-base-100 p-8 shadow-md">
        <p className="text-lg font-medium">No invoices yet.</p>
        <p className="mt-2 opacity-70">Delivered orders will create invoices automatically.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">Total</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">Sent</div>
          <div className="mt-1 text-2xl font-semibold">{summary.sent}</div>
        </div>
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">Failed</div>
          <div className="mt-1 text-2xl font-semibold">{summary.failed}</div>
        </div>
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">Skipped</div>
          <div className="mt-1 text-2xl font-semibold">{summary.skipped}</div>
        </div>
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">Tax</div>
          <div className="mt-1 text-2xl font-semibold">{formatCurrency("INR", summary.tax)}</div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
        <label className="form-control">
          <div className="label">
            <span className="label-text">Search invoices</span>
            <span className="label-text-alt">
              {filteredInvoices.length} of {invoices.length}
            </span>
          </div>
          <input
            type="search"
            className="input input-bordered"
            placeholder="Invoice number, customer, email, phone, source, status, amount"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>

      {filteredInvoices.length === 0 && (
        <section className="rounded-2xl bg-base-100 p-8 text-center shadow-md">
          <p className="text-lg font-medium">No matching invoices.</p>
          <p className="mt-2 opacity-70">Clear the search to see the full ledger.</p>
        </section>
      )}

      {filteredInvoices.length > 0 && (
      <div className="overflow-x-auto rounded-2xl bg-base-100 shadow-md">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Source</th>
              <th>Delivered</th>
              <th>Total</th>
              <th>GST</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <div className="font-semibold">{invoice.invoiceNumber}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <div className="badge badge-outline badge-sm">
                      {invoice.invoiceLabel || "Invoice"}
                    </div>
                    <div className="badge badge-outline badge-sm">
                      {Number(invoice.snapshotVersion || 1) >= 2 ? "GST-ready" : "Legacy"}
                    </div>
                  </div>
                  <div className="text-xs opacity-60">{formatDateTime(invoice.invoiceDate)}</div>
                  <div className="text-xs opacity-60">
                    {invoice.seller?.legalName || invoice.sellerName}
                  </div>
                </td>
                <td>
                  <div className="font-medium">{invoice.customer?.name || "-"}</div>
                  <div className="text-xs opacity-70">{invoice.customer?.email || "-"}</div>
                  <div className="text-xs opacity-70">{invoice.customer?.phone || "-"}</div>
                </td>
                <td>
                  <div>{getSourceLabel(invoice.source)}</div>
                  <div className="text-xs opacity-60">{invoice.source?.deliveryKey || "-"}</div>
                </td>
                <td>{formatDateTime(invoice.deliveredAt)}</td>
                <td>
                  <div className="font-medium">
                    {formatCurrency(invoice.currency, invoice.grandTotal || invoice.total)}
                  </div>
                  {Number(invoice.taxSummary?.totalTaxAmount || 0) > 0 && (
                    <div className="text-xs opacity-60">
                      Tax {formatCurrency(invoice.currency, invoice.taxSummary.totalTaxAmount)}
                    </div>
                  )}
                </td>
                <td>
                  <div className={`badge ${invoice.seller?.gstin ? "badge-success" : "badge-warning"}`}>
                    {invoice.seller?.gstin ? "GSTIN" : "No GSTIN"}
                  </div>
                  <div className="mt-1 text-xs opacity-60">
                    {invoice.taxSummary?.gstTreatment || "legacy"}
                  </div>
                </td>
                <td>
                  <div className={`badge ${getStatusClassName(invoice.emailStatus)}`}>
                    {invoice.emailStatus}
                  </div>
                  <div className="mt-1 text-xs opacity-60">
                    Sent: {formatDateTime(invoice.emailSentAt)}
                  </div>
                  {invoice.emailError && (
                    <div className="mt-1 max-w-xs text-xs text-error">{invoice.emailError}</div>
                  )}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={resendingId === invoice.id || !invoice.customer?.email}
                    onClick={() => resendInvoice(invoice.id)}
                  >
                    {resendingId === invoice.id ? "Sending..." : "Resend"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
