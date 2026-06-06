const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getStatusBadgeClassName = (status = "") => {
  if (status === "failed") {
    return "badge-error";
  }

  if (status === "skipped" || status === "pending") {
    return "badge-warning";
  }

  return "badge-outline";
};

const getChecklistState = (count = 0) => (Number(count || 0) > 0 ? "Needs review" : "Clear");

const getChecklistBadgeClassName = (count = 0) =>
  Number(count || 0) > 0 ? "badge-warning" : "badge-success";

export default function AdminInvoiceHygienePanel({ summary = {} }) {
  const emailAttentionCount =
    Number(summary.statusCounts?.failed || 0) +
    Number(summary.statusCounts?.skipped || 0) +
    Number(summary.statusCounts?.pending || 0);
  const checklistItems = [
    {
      label: "Resend failed or pending invoice emails",
      count: emailAttentionCount,
      detail: `${summary.statusCounts?.failed || 0} failed, ${
        summary.statusCounts?.skipped || 0
      } skipped, ${summary.statusCounts?.pending || 0} pending`,
    },
    {
      label: "Review delivered orders without invoice snapshots",
      count: summary.deliveredOrderGapCount || 0,
      detail: "Catches any delivered legacy/order records that missed invoice creation.",
    },
    {
      label: "Complete SKU HSN/GST setup",
      count: summary.incompleteSkuCount || 0,
      detail: "Keeps future invoices tax-ready and less manual.",
    },
    {
      label: "Chase operational follow-ups",
      count: summary.operationalFollowUpCount || 0,
      detail: "Older production, delivery, payment, or contact tasks.",
    },
  ];

  return (
    <section className="rounded-lg bg-base-100 p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Weekly admin hygiene
          </p>
          <h2 className="mt-2 text-xl font-semibold">Invoices and follow-ups</h2>
          <p className="mt-1 max-w-3xl text-sm opacity-70">
            A quick operations pass for invoice emails, delivered-order gaps, SKU tax setup,
            and stale customer follow-ups.
          </p>
        </div>
        <div className={`badge px-4 py-3 ${summary.attentionCount > 0 ? "badge-warning" : "badge-success"}`}>
          {summary.attentionCount > 0 ? `${summary.attentionCount} needs attention` : "All clear"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-base-300 p-4">
          <div className="text-sm opacity-70">Email attention</div>
          <div className="mt-1 text-2xl font-semibold">{emailAttentionCount}</div>
        </div>
        <div className="rounded-lg border border-base-300 p-4">
          <div className="text-sm opacity-70">Missing invoices</div>
          <div className="mt-1 text-2xl font-semibold">{summary.deliveredOrderGapCount || 0}</div>
        </div>
        <div className="rounded-lg border border-base-300 p-4">
          <div className="text-sm opacity-70">SKU tax gaps</div>
          <div className="mt-1 text-2xl font-semibold">{summary.incompleteSkuCount || 0}</div>
        </div>
        <div className="rounded-lg border border-base-300 p-4">
          <div className="text-sm opacity-70">Invoices this week</div>
          <div className="mt-1 text-2xl font-semibold">{summary.recentInvoiceCount || 0}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg bg-base-200 p-4">
          <h3 className="font-semibold">Weekly checklist</h3>
          <div className="mt-3 space-y-3">
            {checklistItems.map((item) => (
              <div key={item.label} className="rounded-lg bg-base-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{item.label}</div>
                  <div className={`badge ${getChecklistBadgeClassName(item.count)}`}>
                    {getChecklistState(item.count)}
                  </div>
                </div>
                <p className="mt-1 text-sm opacity-70">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-base-200 p-4">
            <h3 className="font-semibold">Invoice email queue</h3>
            {summary.invoiceAttentionItems?.length > 0 ? (
              <div className="mt-3 divide-y divide-base-300 rounded-lg bg-base-100">
                {summary.invoiceAttentionItems.map((invoice) => (
                  <div key={invoice.id || invoice.invoiceNumber} className="p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">
                        {invoice.invoiceNumber || "Invoice"} - {invoice.customerName}
                      </div>
                      <div className={`badge ${getStatusBadgeClassName(invoice.status)}`}>
                        {invoice.status}
                      </div>
                    </div>
                    <div className="mt-1 opacity-70">
                      {invoice.customerEmail || "No customer email"} ·{" "}
                      {formatDateTime(invoice.lastAttemptAt)}
                    </div>
                    {invoice.error && <div className="mt-1 text-error">{invoice.error}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm opacity-70">No failed, skipped, or pending invoice emails.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-base-200 p-4">
              <h3 className="font-semibold">Missing invoice snapshots</h3>
              {summary.deliveredOrderGaps?.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.deliveredOrderGaps.map((order) => (
                    <div key={`${order.type}-${order.id}`} className="rounded-lg bg-base-100 p-3 text-sm">
                      <div className="font-medium">{order.customerName}</div>
                      <div className="opacity-70">
                        {order.type} {order.orderNumber || order.id} · delivered{" "}
                        {formatDateTime(order.deliveredAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm opacity-70">No delivered one-time orders are missing invoices.</p>
              )}
            </div>

            <div className="rounded-lg bg-base-200 p-4">
              <h3 className="font-semibold">Operational follow-ups</h3>
              {summary.operationalFollowUps?.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.operationalFollowUps.map((order) => (
                    <div key={`${order.type}-${order.id}`} className="rounded-lg bg-base-100 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{order.customerName}</div>
                        <div className="badge badge-outline">{order.ageDays}d</div>
                      </div>
                      <div className="mt-1 opacity-70">
                        {order.type} {order.orderNumber || order.id} · {order.reason}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm opacity-70">No older operational follow-ups found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

