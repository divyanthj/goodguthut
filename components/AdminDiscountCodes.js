"use client";

import { useState } from "react";

const toDateInputValue = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const formatDate = (value) => {
  if (!value) {
    return "No expiry";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
  });
};

const CAMPAIGN_TYPES = [
  { value: "general", label: "General" },
  { value: "weekly_offer", label: "Weekly Offer" },
  { value: "birthday", label: "Birthday" },
  { value: "winback", label: "Win-back" },
];

const getCampaignLabel = (value = "") =>
  CAMPAIGN_TYPES.find((item) => item.value === value)?.label || "General";

const createEmptyDiscountForm = () => ({
  id: "",
  code: "",
  amount: 0,
  campaignType: "general",
  campaignName: "",
  startsAt: "",
  isPerpetual: true,
  expiresAt: "",
  maxRedemptions: 0,
  redemptionCount: 0,
  adminNotes: "",
  status: "active",
});

const hydrateDiscountForm = (discountCode = {}) => ({
  id: discountCode.id,
  code: discountCode.code,
  amount: Number(discountCode.amount || 0),
  campaignType: discountCode.campaignType || "general",
  campaignName: discountCode.campaignName || "",
  startsAt: toDateInputValue(discountCode.startsAt),
  isPerpetual: discountCode.isPerpetual === true,
  expiresAt: toDateInputValue(discountCode.expiresAt),
  maxRedemptions: Number(discountCode.maxRedemptions || 0),
  redemptionCount: Number(discountCode.redemptionCount || 0),
  adminNotes: discountCode.adminNotes || "",
  status: discountCode.status || "active",
});

const getDiscountTimingLabel = (discountCode) => {
  if (discountCode.status !== "active") {
    return "archived";
  }

  if (discountCode.startsAt && new Date(discountCode.startsAt).getTime() > Date.now()) {
    return "scheduled";
  }

  if (
    Number(discountCode.maxRedemptions || 0) > 0 &&
    Number(discountCode.redemptionCount || 0) >= Number(discountCode.maxRedemptions || 0)
  ) {
    return "redeemed";
  }

  if (discountCode.isPerpetual) {
    return "perpetual";
  }

  if (!discountCode.expiresAt) {
    return "active";
  }

  return new Date(discountCode.expiresAt).getTime() >= Date.now() ? "active" : "expired";
};

export default function AdminDiscountCodes({ initialDiscountCodes }) {
  const [discountCodes, setDiscountCodes] = useState(initialDiscountCodes || []);
  const [discountForm, setDiscountForm] = useState(createEmptyDiscountForm());
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearFeedback = () => {
    setMessage("");
    setError("");
  };

  const selectDiscountCode = (discountCode) => {
    clearFeedback();
    setDiscountForm(hydrateDiscountForm(discountCode));
  };

  const refreshData = async (preferredId = "") => {
    const response = await fetch("/api/admin/discount-codes");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load discount codes.");
    }

    const nextDiscountCodes = data.discountCodes || [];
    setDiscountCodes(nextDiscountCodes);

    if (!preferredId) {
      setDiscountForm(createEmptyDiscountForm());
      return;
    }

    const selectedDiscountCode = nextDiscountCodes.find((item) => item.id === preferredId);

    if (selectedDiscountCode) {
      selectDiscountCode(selectedDiscountCode);
    }
  };

  const onSave = async (event) => {
    event.preventDefault();
    clearFeedback();
    setIsSaving(true);

    try {
      const isEditing = Boolean(discountForm.id);
      const response = await fetch(
        isEditing ? `/api/admin/discount-codes/${discountForm.id}` : "/api/admin/discount-codes",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discountForm),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save discount code.");
      }

      await refreshData(data.discountCode.id);
      setMessage(isEditing ? "Discount code updated." : "Discount code created.");
    } catch (saveError) {
      setError(saveError.message || "Could not save discount code.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-2xl bg-base-100 p-4 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Discount codes</h2>
              <p className="text-sm opacity-70">Flat % off subtotal only.</p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                clearFeedback();
                setDiscountForm(createEmptyDiscountForm());
              }}
            >
              New code
            </button>
          </div>
        </div>

        {discountCodes.length === 0 ? (
          <div className="rounded-2xl bg-base-100 p-4 shadow-md">
            <p className="font-medium">No discount codes yet.</p>
            <p className="mt-1 text-sm opacity-70">Create one to start offering subtotal discounts.</p>
          </div>
        ) : (
          discountCodes.map((discountCode) => {
            const isSelected = discountCode.id === discountForm.id;
            const timingLabel = getDiscountTimingLabel(discountCode);

            return (
              <button
                key={discountCode.id}
                type="button"
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  isSelected ? "border-primary bg-primary/10" : "border-base-300 bg-base-100 hover:border-primary/40"
                }`}
                onClick={() => selectDiscountCode(discountCode)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold">{discountCode.code}</div>
                    <div className="mt-1 text-sm opacity-70">{Number(discountCode.amount || 0)}% off</div>
                  </div>
                  <div className="badge badge-outline">{timingLabel}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="badge badge-outline">
                    {getCampaignLabel(discountCode.campaignType)}
                  </div>
                  {Number(discountCode.maxRedemptions || 0) > 0 && (
                    <div className="badge badge-outline">
                      {Number(discountCode.redemptionCount || 0)}/{Number(discountCode.maxRedemptions || 0)} used
                    </div>
                  )}
                </div>
                <div className="mt-3 text-xs opacity-70">
                  {discountCode.startsAt ? `Starts ${formatDate(discountCode.startsAt)} · ` : ""}
                  {discountCode.isPerpetual ? "Perpetual" : `Expires ${formatDate(discountCode.expiresAt)}`}
                </div>
              </button>
            );
          })
        )}
      </aside>

      <div className="space-y-6">
        <form onSubmit={onSave} className="card bg-base-100 shadow-xl">
          <div className="card-body gap-6">
            <div>
              <h2 className="text-2xl font-semibold">
                {discountForm.id ? "Edit discount code" : "Create discount code"}
              </h2>
              <p className="mt-1 text-sm opacity-70">
                Customers get this percentage off the item subtotal. Delivery charges stay unchanged.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control w-full">
                <div className="label"><span className="label-text">Code</span></div>
                <input
                  className="input input-bordered"
                  value={discountForm.code}
                  disabled={Boolean(discountForm.id)}
                  onChange={(event) =>
                    setDiscountForm((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase().replace(/\s+/g, ""),
                    }))
                  }
                />
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Discount percent</span></div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input input-bordered"
                  value={discountForm.amount}
                  onChange={(event) =>
                    setDiscountForm((current) => ({
                      ...current,
                      amount: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Campaign type</span></div>
                <select
                  className="select select-bordered"
                  value={discountForm.campaignType}
                  onChange={(event) =>
                    setDiscountForm((current) => ({
                      ...current,
                      campaignType: event.target.value,
                    }))
                  }
                >
                  {CAMPAIGN_TYPES.map((campaignType) => (
                    <option key={campaignType.value} value={campaignType.value}>
                      {campaignType.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Campaign name</span></div>
                <input
                  className="input input-bordered"
                  value={discountForm.campaignName}
                  placeholder="June weekly offer"
                  onChange={(event) =>
                    setDiscountForm((current) => ({
                      ...current,
                      campaignName: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Status</span></div>
                <select
                  className="select select-bordered"
                  value={discountForm.status}
                  onChange={(event) =>
                    setDiscountForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <div className="form-control w-full">
                <div className="label"><span className="label-text">Expiry</span></div>
                <input
                  type="date"
                  className="input input-bordered"
                  value={discountForm.expiresAt}
                  disabled={discountForm.isPerpetual}
                  onChange={(event) =>
                    setDiscountForm((current) => ({ ...current, expiresAt: event.target.value }))
                  }
                />
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={discountForm.isPerpetual}
                    onChange={(event) =>
                      setDiscountForm((current) => ({
                        ...current,
                        isPerpetual: event.target.checked,
                        expiresAt: event.target.checked ? "" : current.expiresAt,
                      }))
                    }
                  />
                  <span className="label-text">Keep this code perpetual</span>
                </label>
              </div>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Start date</span></div>
                <input
                  type="date"
                  className="input input-bordered"
                  value={discountForm.startsAt}
                  onChange={(event) =>
                    setDiscountForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                />
                <div className="label">
                  <span className="label-text-alt">Leave blank to make the code available immediately.</span>
                </div>
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Redemption cap</span></div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input input-bordered"
                  value={discountForm.maxRedemptions}
                  onChange={(event) =>
                    setDiscountForm((current) => ({
                      ...current,
                      maxRedemptions: Number(event.target.value || 0),
                    }))
                  }
                />
                <div className="label">
                  <span className="label-text-alt">0 means unlimited redemptions.</span>
                </div>
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Redemptions used</span></div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input input-bordered"
                  value={discountForm.redemptionCount}
                  onChange={(event) =>
                    setDiscountForm((current) => ({
                      ...current,
                      redemptionCount: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>

              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Admin notes</span></div>
                <textarea
                  className="textarea textarea-bordered"
                  rows={3}
                  value={discountForm.adminNotes}
                  placeholder="Audience, send plan, WhatsApp copy, or lifecycle notes"
                  onChange={(event) =>
                    setDiscountForm((current) => ({
                      ...current,
                      adminNotes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="card-actions items-center justify-between">
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save discount code"}
              </button>
              {discountForm.id && <div className="badge badge-outline">Code ID: {discountForm.id}</div>}
            </div>
          </div>
        </form>

        {message && <div className="alert alert-success"><span>{message}</span></div>}
        {error && <div className="alert alert-error"><span>{error}</span></div>}
      </div>
    </div>
  );
}
