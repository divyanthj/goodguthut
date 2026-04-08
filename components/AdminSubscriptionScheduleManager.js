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

export default function AdminSubscriptionScheduleManager({
  initialDeliveryDaysOfWeek = [],
  initialMinimumLeadDays = 3,
}) {
  const [deliveryDaysOfWeek, setDeliveryDaysOfWeek] = useState(initialDeliveryDaysOfWeek);
  const [minimumLeadDays, setMinimumLeadDays] = useState(
    sanitizeMinimumLeadDays(initialMinimumLeadDays)
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
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save subscription delivery days.");
      }

      setDeliveryDaysOfWeek(data.settings?.deliveryDaysOfWeek || []);
      setMinimumLeadDays(sanitizeMinimumLeadDays(data.settings?.minimumLeadDays));
      setMessage("Subscription schedule settings updated.");
    } catch (saveError) {
      setError(saveError.message || "Could not save subscription schedule settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
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

      <form onSubmit={onSave} className="mt-5 space-y-5">
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save schedule settings"}
          </button>
          <div className="text-sm opacity-70">
            Customers will see: {formatDeliveryDaysOfWeek(deliveryDaysOfWeek)} with {formatMinimumLeadDays(minimumLeadDays)} notice
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
    </section>
  );
}
