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

export default function AdminSubscriptionScheduleManager({
  initialDeliveryDaysOfWeek = [],
  initialMinimumLeadDays = 3,
  initialRecurringMinTotalQuantity = 6,
}) {
  const [deliveryDaysOfWeek, setDeliveryDaysOfWeek] = useState(initialDeliveryDaysOfWeek);
  const [minimumLeadDays, setMinimumLeadDays] = useState(
    sanitizeMinimumLeadDays(initialMinimumLeadDays)
  );
  const [recurringMinTotalQuantity, setRecurringMinTotalQuantity] = useState(
    sanitizeRecurringMinTotalQuantity(initialRecurringMinTotalQuantity)
  );
  const [rolloutExpiryHours, setRolloutExpiryHours] = useState(24 * 7);
  const [rolloutLink, setRolloutLink] = useState("");
  const [rolloutExpiresAt, setRolloutExpiresAt] = useState("");
  const [isGeneratingRolloutLink, setIsGeneratingRolloutLink] = useState(false);
  const [rolloutError, setRolloutError] = useState("");
  const [rolloutMessage, setRolloutMessage] = useState("");
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
      setMessage("Subscription schedule settings updated.");
    } catch (saveError) {
      setError(saveError.message || "Could not save subscription schedule settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const generateRolloutLink = async () => {
    setRolloutError("");
    setRolloutMessage("");
    setIsGeneratingRolloutLink(true);

    try {
      const response = await fetch("/api/admin/subscription-rollout-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expiresInHours: rolloutExpiryHours,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not generate rollout link.");
      }

      setRolloutLink(data.url || "");
      setRolloutExpiresAt(data.expiresAt || "");
      setRolloutMessage("Recurring access link generated.");
    } catch (linkError) {
      setRolloutError(linkError.message || "Could not generate rollout link.");
    } finally {
      setIsGeneratingRolloutLink(false);
    }
  };

  const copyRolloutLink = async () => {
    if (!rolloutLink || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(rolloutLink);
      setRolloutMessage("Recurring access link copied.");
    } catch (_error) {
      setRolloutError("Could not copy the rollout link.");
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

      <div className="mt-8 rounded-2xl border border-base-300 bg-base-200 p-4">
        <h3 className="text-base font-semibold">Recurring rollout magic links</h3>
        <p className="mt-2 text-sm opacity-75">
          Generate expiring links to reveal recurring checkout only for selected customers.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="form-control max-w-xs">
            <div className="label">
              <span className="label-text">Expiry (hours)</span>
            </div>
            <input
              type="number"
              min="1"
              max="2160"
              className="input input-bordered"
              value={rolloutExpiryHours}
              onChange={(event) =>
                setRolloutExpiryHours(Math.max(1, Math.min(2160, Number(event.target.value || 1))))
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isGeneratingRolloutLink}
            onClick={generateRolloutLink}
          >
            {isGeneratingRolloutLink ? "Generating..." : "Generate link"}
          </button>
          {rolloutLink && (
            <button type="button" className="btn btn-outline" onClick={copyRolloutLink}>
              Copy link
            </button>
          )}
        </div>

        {rolloutLink && (
          <div className="mt-4 rounded-xl border border-base-300 bg-base-100 p-3">
            <div className="text-xs opacity-70">Link</div>
            <div className="mt-1 break-all text-sm">{rolloutLink}</div>
            {rolloutExpiresAt && (
              <div className="mt-2 text-xs opacity-70">
                Expires: {new Date(rolloutExpiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            )}
          </div>
        )}

        {rolloutMessage && (
          <div className="alert alert-success mt-4">
            <span>{rolloutMessage}</span>
          </div>
        )}

        {rolloutError && (
          <div className="alert alert-error mt-4">
            <span>{rolloutError}</span>
          </div>
        )}
      </div>
    </section>
  );
}
