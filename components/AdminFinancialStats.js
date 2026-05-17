"use client";

import Link from "next/link";

const formatCurrency = (currency, amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDelta = (value) => {
  if (value > 0) {
    return `+${value.toFixed(2)}%`;
  }

  if (value < 0) {
    return `${value.toFixed(2)}%`;
  }

  return "0.00%";
};

const getDeltaTone = (value) => {
  if (value > 0) {
    return "text-success";
  }

  if (value < 0) {
    return "text-error";
  }

  return "opacity-70";
};

const buildChartPath = (points = []) => {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
};

export default function AdminFinancialStats({
  summary,
  revenueSeries = [],
  range,
  controls,
  excludedCurrencies = [],
  totals,
}) {
  const chartWidth = 720;
  const chartHeight = 260;
  const chartPadding = { top: 20, right: 20, bottom: 44, left: 20 };
  const chartInnerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const chartInnerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const maxRevenue = Math.max(...revenueSeries.map((entry) => Number(entry.revenue || 0)), 0);
  const safeMaxRevenue = maxRevenue > 0 ? maxRevenue : 1;
  const points = revenueSeries.map((entry, index) => {
    const x =
      chartPadding.left +
      (revenueSeries.length === 1 ? chartInnerWidth / 2 : (chartInnerWidth * index) / (revenueSeries.length - 1));
    const y =
      chartPadding.top + chartInnerHeight - (Number(entry.revenue || 0) / safeMaxRevenue) * chartInnerHeight;

    return {
      ...entry,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  });
  const chartPath = buildChartPath(points);
  const areaPath = points.length
    ? `${chartPath} L ${points[points.length - 1].x} ${chartHeight - chartPadding.bottom} L ${points[0].x} ${
        chartHeight - chartPadding.bottom
      } Z`
    : "";
  const buildHref = (nextResolution, nextPeriod) => {
    const params = new URLSearchParams();
    params.set("resolution", nextResolution);
    params.set("period", nextPeriod);
    return `/admin/stats?${params.toString()}`;
  };

  return (
    <section className="space-y-6">
      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">View controls</h2>
            <p className="mt-1 text-sm opacity-70">
              Adjust the time window and reporting resolution for the revenue chart.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.16em] opacity-60">Resolution</div>
            <div className="flex flex-wrap gap-2">
              {(controls?.resolutionOptions || []).map((option) => {
                const isActive = option.value === controls?.resolution;
                const fallbackPeriod =
                  option.value === "month" ? "6m" : "8w";

                return (
                  <Link
                    key={option.value}
                    href={buildHref(option.value, fallbackPeriod)}
                    className={isActive ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.16em] opacity-60">Time period</div>
            <div className="flex flex-wrap gap-2">
              {(controls?.periodOptions || []).map((option) => (
                <Link
                  key={option.value}
                  href={buildHref(controls?.resolution || "week", option.value)}
                  className={
                    option.value === controls?.period
                      ? "btn btn-primary btn-sm"
                      : "btn btn-ghost btn-sm"
                  }
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-base-100 p-5 shadow-sm">
          <div className="text-sm opacity-70">{summary.currentPeriodLabel}</div>
          <div className="mt-2 text-2xl font-semibold">
            {formatCurrency(summary.currency, summary.currentPeriodRevenue)}
          </div>
        </div>
        <div className="rounded-2xl bg-base-100 p-5 shadow-sm">
          <div className="text-sm opacity-70">{summary.previousPeriodLabel}</div>
          <div className="mt-2 text-2xl font-semibold">
            {formatCurrency(summary.currency, summary.previousPeriodRevenue)}
          </div>
        </div>
        <div className="rounded-2xl bg-base-100 p-5 shadow-sm">
          <div className="text-sm opacity-70">{summary.deltaLabel}</div>
          <div className={`mt-2 text-2xl font-semibold ${getDeltaTone(summary.periodDelta)}`}>
            {formatCurrency(summary.currency, summary.periodDelta)}
          </div>
          <div className={`mt-1 text-sm ${getDeltaTone(summary.periodDeltaPercent)}`}>
            {formatDelta(summary.periodDeltaPercent)}
          </div>
        </div>
        <div className="rounded-2xl bg-base-100 p-5 shadow-sm">
          <div className="text-sm opacity-70">
            Last {range?.bucketCount || revenueSeries.length} {range?.resolution === "month" ? "months" : "weeks"}
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {formatCurrency(summary.currency, summary.rangeRevenue)}
          </div>
        </div>
      </div>

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {range?.resolution === "month" ? "Month-on-month revenue" : "Week-on-week revenue"}
            </h2>
            <p className="mt-1 text-sm opacity-70">
              Cash collected by India-local {range?.resolution || "week"} across paid orders and subscription billing.
            </p>
          </div>
          <div className="text-sm opacity-70">
            {range?.startDate && range?.endDate
              ? `${range.startDate} to ${range.endDate}`
              : `${range?.bucketCount || revenueSeries.length} ${range?.resolution || "week"}s`}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          {revenueSeries.length > 0 ? (
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="min-w-[720px]"
              role="img"
              aria-label={`${range?.resolution === "month" ? "Month" : "Week"} on ${range?.resolution === "month" ? "month" : "week"} revenue chart`}
            >
              <defs>
                <linearGradient id="admin-financials-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
                </linearGradient>
              </defs>

              {[0, 0.5, 1].map((ratio) => {
                const y = chartPadding.top + chartInnerHeight * ratio;
                const value = safeMaxRevenue * (1 - ratio);

                return (
                  <g key={`grid-${ratio}`}>
                    <line
                      x1={chartPadding.left}
                      y1={y}
                      x2={chartWidth - chartPadding.right}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity="0.12"
                    />
                    <text
                      x={chartWidth - chartPadding.right}
                      y={Math.max(14, y - 6)}
                      textAnchor="end"
                      fontSize="11"
                      fill="currentColor"
                      opacity="0.55"
                    >
                      {formatCurrency(summary.currency, value)}
                    </text>
                  </g>
                );
              })}

              {areaPath ? <path d={areaPath} fill="url(#admin-financials-area)" className="text-primary" /> : null}
              {chartPath ? (
                <path
                  d={chartPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="text-primary"
                />
              ) : null}

              {points.map((point) => (
                <g key={point.weekStart}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="10"
                    fill="transparent"
                    className="cursor-pointer"
                  >
                    <title>{`${point.weekLabel}: ${formatCurrency(summary.currency, point.revenue)}`}</title>
                  </circle>
                  <circle cx={point.x} cy={point.y} r="4" fill="currentColor" className="text-primary pointer-events-none" />
                  <text
                    x={point.x}
                    y={chartHeight - 16}
                    textAnchor="middle"
                    fontSize="11"
                    fill="currentColor"
                    opacity="0.65"
                  >
                    {point.weekLabel}
                  </text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="rounded-2xl bg-base-200 px-4 py-10 text-center text-sm opacity-70">
              No revenue data is available for this range yet.
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Orders revenue</div>
            <div className="mt-2 text-xl font-semibold">
              {formatCurrency(summary.currency, summary.ordersRevenue)}
            </div>
          </div>
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Subscription revenue</div>
            <div className="mt-2 text-xl font-semibold">
              {formatCurrency(summary.currency, summary.subscriptionsRevenue)}
            </div>
          </div>
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Included payments</div>
            <div className="mt-2 text-xl font-semibold">{Number(totals?.includedEventCount || 0)}</div>
          </div>
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Excluded non-INR</div>
            <div className="mt-2 text-xl font-semibold">{Number(totals?.excludedEventCount || 0)}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm opacity-80">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-primary" />
            <span>
              Total {range?.resolution === "month" ? "monthly" : "weekly"} revenue
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-base-content/50" />
            <span>Orders + subscriptions combined</span>
          </div>
        </div>

        {excludedCurrencies.length > 0 && (
          <div className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            Excluded non-INR payments from this view: {excludedCurrencies.join(", ")}.
          </div>
        )}
      </section>
    </section>
  );
}
