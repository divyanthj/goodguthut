"use client";

import { useEffect, useState } from "react";
import SubscriptionForm from "@/components/SubscriptionForm";

const getApiErrorMessage = async (response, fallbackMessage) => {
  try {
    const data = await response.json();
    return data?.error || fallbackMessage;
  } catch (_error) {
    return fallbackMessage;
  }
};

function ResendEditLinkForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/subscription/resend-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Could not resend the edit link."));
      }

      const data = await response.json();
      setMessage(data.message || "If we found a matching subscription, we have sent a new link.");
    } catch (submitError) {
      setError(submitError.message || "Could not resend the edit link.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-3xl border border-[#ddcfb6] bg-[#fffdf8] p-6 shadow-lg">
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5f7068]">
        Request a fresh link
      </div>
      <p className="mt-3 text-sm leading-7 text-[#53675d]">
        Enter the email you used for your subscription, and we’ll send a fresh secure edit link if we find a match.
      </p>
      <div className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          type="email"
          className="input input-bordered flex-1 bg-[#fffaf1]"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send new link"}
        </button>
      </div>
      {message && (
        <div className="alert mt-4 border-[#cfe2d0] bg-[#eef7ef] text-[#264f35]">
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error mt-4">
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}

export default function SubscriptionEditPage({
  token = "",
  catalogItems = [],
  comboOptions = [],
  deliveryWindowId = "",
  pickupAddress = "",
  deliveryBands = [],
  deliveryDaysOfWeek = [],
  minimumLeadDays = 3,
  recurringMinTotalQuantity = 6,
  freeDeliveryThreshold = null,
  availableStartDates = [],
  defaultStartDate = "",
  currency = "INR",
}) {
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadSubscription = async () => {
      if (!token) {
        if (isMounted) {
          setError("This edit link is invalid. Request a fresh link below.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/subscription/edit?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Could not load subscription."));
        }

        const data = await response.json();

        if (isMounted) {
          setSubscription(data.subscription || null);
          setError("");
        }
      } catch (loadError) {
        if (isMounted) {
          setSubscription(null);
          setError(loadError.message || "Could not load subscription.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSubscription();

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (isLoading) {
    return (
      <div className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-8 shadow-xl">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-[#e1d6c7]" />
          <div className="h-10 w-full rounded bg-[#eee5d8]" />
          <div className="h-10 w-full rounded bg-[#eee5d8]" />
          <div className="h-28 w-full rounded bg-[#eee5d8]" />
        </div>
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div>
        <section className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-8 shadow-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6b7d74]">
            Edit link unavailable
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#2f4a3e]">This link can’t be used</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#53675d] md:text-base">
            {error || "This edit link is invalid or has expired. Request a fresh link below and we’ll email it to you if we find a matching subscription."}
          </p>
        </section>
        <ResendEditLinkForm />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SubscriptionForm
        mode="edit"
        token={token}
        catalogItems={catalogItems}
        comboOptions={comboOptions}
        deliveryWindowId={deliveryWindowId}
        pickupAddress={pickupAddress}
        deliveryBands={deliveryBands}
        deliveryDaysOfWeek={deliveryDaysOfWeek}
        minimumLeadDays={minimumLeadDays}
        recurringMinTotalQuantity={recurringMinTotalQuantity}
        freeDeliveryThreshold={freeDeliveryThreshold}
        availableStartDates={availableStartDates}
        defaultStartDate={defaultStartDate}
        currency={currency}
        initialValues={subscription}
      />
      <ResendEditLinkForm />
    </div>
  );
}
