"use client";

import { useState } from "react";
import {
  formatDeliveryDaysOfWeek,
  SUBSCRIPTION_WEEKDAY_OPTIONS,
} from "@/libs/subscription-delivery-days";
import {
  formatMinimumLeadDays,
  MAX_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
  sanitizeMinimumLeadDays,
} from "@/libs/subscription-schedule";
import { sanitizeRecurringMinTotalQuantity } from "@/libs/order-quantity";

const SKU_CATEGORY_OPTIONS = [
  {
    value: "kanji",
    label: "Kanji",
    description: "Traditional fermented kanji and bold daily drinks.",
    defaultLeadTimeDays: 3,
  },
  {
    value: "sparkle",
    label: "Sparkle",
    description: "Light fermented fizz and easy sipping bottles.",
    defaultLeadTimeDays: 2,
  },
  {
    value: "pickles",
    label: "Pickles",
    description: "Slow, spiced vegetable ferments and pickle jars.",
    defaultLeadTimeDays: 7,
  },
  {
    value: "gift_packs",
    label: "Gift Packs",
    description: "Curated packs for gifting, birthdays, and thank-yous.",
    defaultLeadTimeDays: 3,
  },
  {
    value: "subscriptions",
    label: "Subscriptions",
    description: "Products or packs best suited to recurring plans.",
    defaultLeadTimeDays: 3,
  },
  {
    value: "custom_orders",
    label: "Custom Orders",
    description: "Bulk, event, custom pack, and made-to-brief products.",
    defaultLeadTimeDays: 5,
  },
  {
    value: "other",
    label: "Other",
    description: "Products waiting to be categorized.",
    defaultLeadTimeDays: 3,
  },
];

const DEFAULT_CATEGORY_LEAD_TIMES = Object.fromEntries(
  SKU_CATEGORY_OPTIONS.map((category) => [
    category.value,
    category.defaultLeadTimeDays,
  ])
);

const sanitizeCategoryLeadTimes = (value = {}) => {
  const source = value && typeof value === "object" ? value : {};

  return Object.fromEntries(
    SKU_CATEGORY_OPTIONS.map((category) => {
      const rawValue = source[category.value];
      const fallback = category.defaultLeadTimeDays;
      const normalized = Number(rawValue);

      return [
        category.value,
        Number.isFinite(normalized)
          ? Math.max(0, Math.min(60, Math.round(normalized)))
          : fallback,
      ];
    })
  );
};

export default function AdminSubscriptionScheduleManager({
  initialDeliveryDaysOfWeek = [],
  initialMinimumLeadDays = 3,
  initialRecurringMinTotalQuantity = 6,
  initialCategoryLeadTimes = DEFAULT_CATEGORY_LEAD_TIMES,
  embedded = false,
}) {
  const [deliveryDaysOfWeek, setDeliveryDaysOfWeek] = useState(initialDeliveryDaysOfWeek);
  const [minimumLeadDays, setMinimumLeadDays] = useState(
    sanitizeMinimumLeadDays(initialMinimumLeadDays)
  );
  const [recurringMinTotalQuantity, setRecurringMinTotalQuantity] = useState(
    sanitizeRecurringMinTotalQuantity(initialRecurringMinTotalQuantity)
  );
  const [categoryLeadTimes, setCategoryLeadTimes] = useState(
    sanitizeCategoryLeadTimes(initialCategoryLeadTimes)
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const toggleDay = (day) => {
    setDeliveryDaysOfWeek((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    );
  };

  const onSave = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/subscription-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deliveryDaysOfWeek,
          minimumLeadDays,
          recurringMinTotalQuantity,
          categoryLeadTimes,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save subscription delivery days.");
      }

      setDeliveryDaysOfWeek(data.settings?.deliveryDaysOfWeek || []);
      setMinimumLeadDays(sanitizeMinimumLeadDays(data.settings?.minimumLeadDays));
      setRecurringMinTotalQuantity(
        sanitizeRecurringMinTotalQuantity(data.settings?.recurringMinTotalQuantity)
      );
      setCategoryLeadTimes(sanitizeCategoryLeadTimes(data.settings?.categoryLeadTimes));
      setMessage("Subscription schedule settings updated.");
    } catch (saveError) {
      setError(saveError.message || "Could not save subscription schedule settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateCategoryLeadTime = (category, value) => {
    setCategoryLeadTimes((current) =>
      sanitizeCategoryLeadTimes({
        ...current,
        [category]: value,
      })
    );
  };

  const content = (
    <>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Subscription delivery days</h2>
          <p className="text-sm opacity-70">
            Choose which weekdays subscription deliveries go out and how much notice the team needs before the first one.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="badge badge-outline">{formatDeliveryDaysOfWeek(deliveryDaysOfWeek)}</div>
          <div className="badge badge-outline">{formatMinimumLeadDays(minimumLeadDays)} notice</div>
        </div>
      </div>
      )}

      <form onSubmit={onSave} className={`${embedded ? "" : "mt-5"} space-y-5`}>
        <div className="flex flex-wrap gap-3">
          {SUBSCRIPTION_WEEKDAY_OPTIONS.map((day) => {
            const isActive = deliveryDaysOfWeek.includes(day.value);

            return (
              <button
                key={day.value}
                type="button"
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-primary bg-primary text-primary-content"
                    : "border-base-300 bg-base-100 hover:border-primary/40"
                }`}
                onClick={() => toggleDay(day.value)}
              >
                {day.label}
              </button>
            );
          })}
        </div>

        <label className="form-control max-w-xs">
          <div className="label">
            <span className="label-text">Minimum lead time before first delivery</span>
          </div>
          <input
            type="number"
            min="0"
            max={String(MAX_SUBSCRIPTION_MINIMUM_LEAD_DAYS)}
            className="input input-bordered"
            value={minimumLeadDays}
            onChange={(event) => setMinimumLeadDays(sanitizeMinimumLeadDays(event.target.value))}
          />
          <div className="label">
            <span className="label-text-alt">
              Customers can start on the next eligible delivery date after this notice period.
            </span>
          </div>
        </label>

        <div className="rounded-2xl border border-base-300 bg-base-200 p-4">
          <div>
            <h3 className="text-base font-semibold">Category lead times</h3>
            <p className="mt-1 text-sm opacity-70">
              Used as the public/default lead time when a product does not have its own override.
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SKU_CATEGORY_OPTIONS.map((category) => (
              <label key={category.value} className="form-control">
                <div className="label">
                  <span className="label-text">{category.label}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  className="input input-bordered"
                  value={categoryLeadTimes[category.value] ?? 0}
                  onChange={(event) =>
                    updateCategoryLeadTime(category.value, event.target.value)
                  }
                />
                <div className="label">
                  <span className="label-text-alt">{category.description}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <label className="form-control max-w-xs">
          <div className="label">
            <span className="label-text">Recurring minimum bottles</span>
          </div>
          <input
            type="number"
            min="4"
            max="24"
            className="input input-bordered"
            value={recurringMinTotalQuantity}
            onChange={(event) =>
              setRecurringMinTotalQuantity(
                sanitizeRecurringMinTotalQuantity(event.target.value)
              )
            }
          />
          <div className="label">
            <span className="label-text-alt">
              This minimum applies only to recurring subscriptions.
            </span>
          </div>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save schedule settings"}
          </button>
          <div className="text-sm opacity-70">
            Customers will see: {formatDeliveryDaysOfWeek(deliveryDaysOfWeek)} with {formatMinimumLeadDays(minimumLeadDays)} notice, and recurring minimum {recurringMinTotalQuantity} bottles
          </div>
        </div>

        {message && (
          <div className="alert alert-success">
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
      </form>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
      {content}
    </section>
  );
}
