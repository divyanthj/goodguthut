"use client";

import { useMemo, useState } from "react";
import {
  normalizeAdminOrderFromLegacyPreorder,
  normalizeAdminOrderFromOrderPlan,
} from "@/libs/admin-orders";
import SubscriptionForm from "@/components/SubscriptionForm";
import { isRecurringOrderPlanPaymentConfirmed } from "@/libs/order-plans";
import { getRazorpayArtifactRows } from "@/libs/razorpay-dashboard-links";
import { formatSubscriptionCadence, formatSubscriptionDuration } from "@/libs/subscriptions";
import { formatSubscriptionDate } from "@/libs/subscription-schedule";

const formatCurrency = (currency, amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDateOnly = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
  });
};

const escapeCsvValue = (value = "") => {
  const normalized = String(value ?? "").replace(/\r?\n|\r/g, " ").trim();

  if (normalized.includes(",") || normalized.includes('"')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
};

const getOrderSummaryDeliveryDate = (order = {}) => {
  if (order.sourceType === "legacy_preorder") {
    return order.firstDeliveryDate || order.nextDeliveryDate || null;
  }

  if (order.mode === "recurring") {
    return order.nextDeliveryDate || order.firstDeliveryDate || order.startDate || null;
  }

  return order.firstDeliveryDate || order.nextDeliveryDate || order.startDate || null;
};

const toDateTimeLocal = (value) => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const normalizeWhatsAppPhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  return digits;
};

const buildWhatsAppUrl = (phone, message) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone);

  if (!normalizedPhone || !message) {
    return "";
  }

  return `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(message)}`;
};

const isMobileDevice = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
};

const openWhatsAppThread = (phone, message, targetWindow = null) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone);

  if (!normalizedPhone || !message) {
    targetWindow?.close?.();
    return false;
  }

  const whatsappUrl = isMobileDevice()
    ? `whatsapp://send?phone=${normalizedPhone}&text=${encodeURIComponent(message)}`
    : buildWhatsAppUrl(normalizedPhone, message);

  if (targetWindow) {
    targetWindow.location.href = whatsappUrl;
    return true;
  }

  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  return true;
};

const copyToClipboard = async (value) => {
  if (!value) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
};

const normalizeAdminOrder = (order = {}) => {
  if (order.sourceType === "legacy_preorder") {
    return normalizeAdminOrderFromLegacyPreorder(order);
  }

  return normalizeAdminOrderFromOrderPlan(order);
};

const getModeLabel = (order = {}) =>
  order.sourceType === "legacy_preorder"
    ? "One-time"
    : order.mode === "recurring"
      ? "Recurring"
      : "One-time";

const getModeBadgeClassName = (order = {}) => {
  if (order.sourceType === "legacy_preorder" || order.mode !== "recurring") {
    return "badge border-emerald-700 bg-emerald-50 px-3 py-3 text-[0.8rem] font-semibold text-emerald-900";
  }

  return "badge border-sky-700 bg-sky-50 px-3 py-3 text-[0.8rem] font-semibold text-sky-900";
};

const getTrackingInputId = (order = {}) => `tracking-link-${order.sourceType}-${order.id}`;
const getDeliveredAtInputId = (order = {}) => `delivered-at-${order.sourceType}-${order.id}`;
const GOOD_GUT_HUT_BASE_URL = "https://goodguthut.com";

const buildPaymentRedirectUrl = (order = {}) => {
  if (!order.id) {
    return "";
  }

  const kind = order.sourceType === "legacy_preorder" ? "preorder" : "order";

  return `${GOOD_GUT_HUT_BASE_URL}/pay/${kind}/${encodeURIComponent(order.id)}`;
};

const buildOrderDetailsText = (order = {}) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemSummary = items
    .filter((item) => item?.productName || item?.sku)
    .map((item) => {
      const name = item.productName || item.sku;
      const quantity = Number(item.quantity || 0);

      return quantity > 0 ? `${quantity} x ${name}` : name;
    })
    .join(", ");

  if (itemSummary) {
    return itemSummary;
  }

  return order.selectionSummary || order.orderNumber || "your order";
};

const buildProductionWhatsAppMessage = (order = {}) => {
  const customerName = String(order.customerName || "").trim() || "there";
  const orderDetails = buildOrderDetailsText(order);
  const deliveryDate = formatDateOnly(getOrderSummaryDeliveryDate(order));
  const sproutEmoji = "🌱";
  const sparkleEmoji = "✨";
  const scooterEmoji = "🛵";

  return `Hi ${customerName}! ${sproutEmoji}

Tiny update from the Good Gut Hut kitchen: production has officially started for your gut-happy lineup:

${orderDetails}

${sparkleEmoji} We are brewing, bottling, and getting everything ready for delivery on ${deliveryDate}. ${scooterEmoji}`;
};

const isPaymentOrMandateSetupPending = (order = {}) => {
  const paymentStatus = String(order.payment?.status || "").trim();
  const paymentProvider = String(order.payment?.provider || "").trim();

  if (order.sourceType === "order_plan" && order.mode === "recurring") {
    return paymentStatus === "created";
  }

  if (paymentProvider === "manual") {
    return false;
  }

  return ["pending", "order_created", "created"].includes(paymentStatus);
};

const buildPaymentNudgeWhatsAppMessage = (order = {}) => {
  const customerName = String(order.customerName || "").trim() || "there";
  const orderDetails = buildOrderDetailsText(order);
  const paymentRedirectUrl = buildPaymentRedirectUrl(order);
  const isRecurring = order.mode === "recurring";
  const actionText = isRecurring
    ? "Your plan is almost in production. Complete your payment setup here to confirm it:"
    : "Your order is almost in production. Complete your payment here to confirm it:";
  const linkText = paymentRedirectUrl ? `\n${paymentRedirectUrl}` : "";

  return `Hi ${customerName}! 🌿

Quick reminder about your Good Gut Hut order ✨

${actionText}
${linkText}

Your gut-happy lineup: ${orderDetails}
Total: ${formatCurrency(order.currency, order.total)}

Ping us here if you need help - we have got you. 🫶`;
};

const buildFallbackShippedWhatsAppMessage = (order = {}) => {
  const isPickup = order.fulfillmentMethod === "pickup";
  const orderDetails = buildOrderDetailsText(order);

  if (isPickup) {
    return `Your Good Gut Hut order is ready for pickup. Items: ${orderDetails}`;
  }

  const trackingText = order.trackingLink
    ? ` Track your order here: ${order.trackingLink}`
    : order.estimatedArrivalAt
      ? ` Estimated arrival: around ${formatDateTime(order.estimatedArrivalAt)}.`
      : "";

  return `Your Good Gut Hut order has been shipped. Items: ${orderDetails}.${trackingText}`;
};

const renderRazorpayArtifacts = (payment = {}) => {
  const rows = getRazorpayArtifactRows(payment);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-base-200 p-4 text-sm">
      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Razorpay</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="min-w-0">
            <div className="text-xs opacity-60">{row.label}</div>
            {row.url ? (
              <a
                className="link link-primary mt-1 block break-all font-mono text-xs"
                href={row.url}
                target="_blank"
                rel="noreferrer"
              >
                {row.value}
              </a>
            ) : (
              <div className="mt-1 break-all font-mono text-xs">{row.value}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function AdminOrdersList({ initialOrders = [], orderEntryConfig = null }) {
  const [orders, setOrders] = useState(() => initialOrders || []);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showFulfilledOrders, setShowFulfilledOrders] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState({});

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "fulfilled"),
    [orders]
  );
  const fulfilledOrders = useMemo(
    () => orders.filter((order) => order.status === "fulfilled"),
    [orders]
  );
  const summary = useMemo(
    () => ({
      total: activeOrders.length,
      oneTime: activeOrders.filter(
        (order) =>
          order.sourceType === "legacy_preorder" || order.mode !== "recurring"
      ).length,
      recurring: activeOrders.filter(
        (order) =>
          order.sourceType === "order_plan" && order.mode === "recurring"
      ).length,
    }),
    [activeOrders]
  );

  const updateOrderInState = (sourceType, nextRecord) => {
    const normalized = normalizeAdminOrder({
      ...nextRecord,
      sourceType,
    });

    setOrders((current) =>
      current.map((entry) =>
        entry.id === normalized.id && entry.sourceType === sourceType
          ? normalized
          : entry
      )
    );
  };

  const addOrderToState = (nextRecord) => {
    if (!nextRecord?.id) {
      return;
    }

    const normalized = normalizeAdminOrderFromOrderPlan({
      ...nextRecord,
      sourceType: "order_plan",
    });

    setOrders((current) =>
      [normalized, ...current.filter((entry) => entry.id !== normalized.id)].sort(
        (left, right) =>
          new Date(right.createdAt || 0).getTime() -
          new Date(left.createdAt || 0).getTime()
      )
    );
  };

  const patchOrder = async (order, payload, fallbackError, options = {}) => {
    setSavingId(`${order.sourceType}:${order.id}`);
    setMessage("");
    setError("");

    const endpoint =
      order.sourceType === "legacy_preorder"
        ? `/api/admin/preorders/${order.id}`
        : `/api/admin/order-plans/${order.id}`;

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || fallbackError);
      }

      const nextRecord =
        order.sourceType === "legacy_preorder" ? data.preorder : data.orderPlan;

      if (nextRecord) {
        updateOrderInState(order.sourceType, nextRecord);
      }

      if (payload.markShipped) {
        const updatedOrder =
          order.sourceType === "legacy_preorder"
            ? normalizeAdminOrderFromLegacyPreorder({
                ...(data.preorder || {}),
                sourceType: order.sourceType,
              })
            : normalizeAdminOrderFromOrderPlan({
                ...(data.orderPlan || {}),
                sourceType: order.sourceType,
              });
        let clipboardCopied = Boolean(options.clipboardCopied);
        let whatsappOpened = Boolean(options.whatsappOpened);

        if (!options.skipWhatsAppOpen) {
          const whatsappMessage =
            data.notificationScaffold?.notifications?.whatsapp?.text ||
            buildFallbackShippedWhatsAppMessage(updatedOrder);
          const whatsappPhone = updatedOrder.phone || "";

          if (whatsappMessage) {
            try {
              clipboardCopied = await copyToClipboard(whatsappMessage);
            } catch (clipboardError) {
              console.error("Could not copy shipped WhatsApp message", clipboardError);
            }
          }

          whatsappOpened = openWhatsAppThread(whatsappPhone, whatsappMessage);
        }

        const isPickup = updatedOrder.fulfillmentMethod === "pickup";
        const shipmentSummary = isPickup
          ? "Order marked ready for pickup."
          : payload.trackingLink?.trim()
            ? "Order marked as shipped and tracking link saved."
            : "Order marked as shipped and ETA set for 1 hour from shipment.";
        const whatsappSummary = whatsappOpened
          ? clipboardCopied
            ? " WhatsApp message copied to clipboard and opened."
            : " WhatsApp opened with the message prefilled."
          : " No WhatsApp action was opened because this order has no phone number.";
        const emailStatus = data.emailDelivery?.status;
        const emailSummary =
          emailStatus === "sent"
            ? " Shipped email sent."
            : emailStatus === "already_sent"
              ? " Shipped email was already sent earlier."
              : emailStatus === "skipped"
                ? " No shipped email was sent because this order has no email address."
                : emailStatus === "failed"
                  ? " Shipped email failed to send."
                  : "";

        setMessage(`${shipmentSummary}${whatsappSummary}${emailSummary}`);

        if (emailStatus === "failed") {
          setError(data.emailDelivery?.error || "Shipped email failed to send.");
        }
      }
    } catch (updateError) {
      setError(updateError.message || fallbackError);
    } finally {
      setSavingId("");
    }
  };

  const deleteOrder = async (order) => {
    const shouldDelete = window.confirm("Delete this order permanently?");

    if (!shouldDelete) {
      return;
    }

    setDeletingId(`${order.sourceType}:${order.id}`);
    setMessage("");
    setError("");

    const endpoint =
      order.sourceType === "legacy_preorder"
        ? `/api/admin/preorders/${order.id}`
        : `/api/admin/order-plans/${order.id}`;

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete order.");
      }

      setOrders((current) =>
        current.filter(
          (entry) =>
            !(entry.id === order.id && entry.sourceType === order.sourceType)
        )
      );
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete order.");
    } finally {
      setDeletingId("");
    }
  };

  const markShipped = async (order, trackingLink) => {
    const shouldMarkShipped = window.confirm(
      "Are you sure you want to mark this order as shipped? This will send the customer an email and open WhatsApp with the shipping message."
    );

    if (!shouldMarkShipped) {
      return;
    }

    const trackingLinkValue = String(trackingLink || "").trim();
    const whatsappOrder = {
      ...order,
      trackingLink: trackingLinkValue,
      estimatedArrivalAt: trackingLinkValue
        ? null
        : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    const whatsappMessage = buildFallbackShippedWhatsAppMessage(whatsappOrder);
    let clipboardCopied = false;

    if (whatsappMessage) {
      try {
        clipboardCopied = await copyToClipboard(whatsappMessage);
      } catch (clipboardError) {
        console.error("Could not copy shipped WhatsApp message", clipboardError);
      }
    }

    const whatsappOpened = openWhatsAppThread(order.phone, whatsappMessage);

    await patchOrder(
      order,
      {
        markShipped: true,
        trackingLink: trackingLinkValue,
      },
      "Could not mark order as shipped.",
      {
        clipboardCopied,
        skipWhatsAppOpen: true,
        whatsappOpened,
      }
    );
  };

  const confirmProduction = async (order) => {
    const shouldConfirmProduction = window.confirm(
      "Are you sure production has started for this order? This will send the customer an email and open WhatsApp with the production message."
    );

    if (!shouldConfirmProduction) {
      return;
    }

    const orderKey = `${order.sourceType}:${order.id}`;

    setSavingId(orderKey);
    setMessage("");
    setError("");

    const whatsappMessage = buildProductionWhatsAppMessage(order);
    let clipboardCopied = false;

    try {
      clipboardCopied = await copyToClipboard(whatsappMessage);
    } catch (clipboardError) {
      console.error("Could not copy production WhatsApp message", clipboardError);
    }

    const whatsappOpened = openWhatsAppThread(order.phone, whatsappMessage);
    const whatsappSummary = whatsappOpened
      ? clipboardCopied
        ? "WhatsApp message copied to clipboard and opened."
        : "WhatsApp opened with the production message prefilled."
      : "No WhatsApp action was opened because this order has no phone number.";

    try {
      const response = await fetch("/api/admin/orders/production-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: order.sourceType,
          id: order.id,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send production confirmation email.");
      }

      const emailStatus = data.emailDelivery?.status;
      const emailSummary =
        emailStatus === "sent"
          ? " Production email sent."
          : " No production email was sent because this order has no email address.";

      setMessage(`${whatsappSummary}${emailSummary}`);
    } catch (emailError) {
      setMessage(whatsappSummary);
      setError(emailError.message || "Could not send production confirmation email.");
    } finally {
      setSavingId("");
    }
  };

  const sendPaymentNudge = async (order) => {
    const isRecurring = order.mode === "recurring";
    const shouldSendNudge = window.confirm(
      isRecurring
        ? "Send a mandate setup nudge? This will send the customer an email and open WhatsApp with the nudge message."
        : "Send a payment nudge? This will send the customer an email and open WhatsApp with the nudge message."
    );

    if (!shouldSendNudge) {
      return;
    }

    const orderKey = `${order.sourceType}:${order.id}`;

    setSavingId(orderKey);
    setMessage("");
    setError("");

    const whatsappWindow = order.phone ? window.open("", "_blank") : null;

    try {
      const response = await fetch("/api/admin/orders/payment-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: order.sourceType,
          id: order.id,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send payment nudge email.");
      }

      const nextRecord =
        order.sourceType === "legacy_preorder" ? data.preorder : data.orderPlan;
      const updatedOrder = nextRecord
        ? normalizeAdminOrder({
            ...nextRecord,
            sourceType: order.sourceType,
          })
        : order;

      if (nextRecord) {
        updateOrderInState(order.sourceType, nextRecord);
      }

      const whatsappMessage = buildPaymentNudgeWhatsAppMessage(updatedOrder);
      let clipboardCopied = false;

      try {
        clipboardCopied = await copyToClipboard(whatsappMessage);
      } catch (clipboardError) {
        console.error("Could not copy payment nudge WhatsApp message", clipboardError);
      }

      const whatsappOpened = openWhatsAppThread(
        updatedOrder.phone,
        whatsappMessage,
        whatsappWindow
      );
      const whatsappSummary = whatsappOpened
        ? clipboardCopied
          ? "WhatsApp nudge copied to clipboard and opened."
          : "WhatsApp opened with the nudge message prefilled."
        : "No WhatsApp action was opened because this order has no phone number.";
      const emailStatus = data.emailDelivery?.status;
      const emailSummary =
        emailStatus === "sent"
          ? " Nudge email sent."
          : emailStatus === "skipped" && data.emailDelivery?.reason === "not_pending"
            ? " Nudge email skipped because this order is no longer pending."
            : " No nudge email was sent because this order has no email address.";

      setMessage(`${whatsappSummary}${emailSummary}`);
    } catch (nudgeError) {
      whatsappWindow?.close?.();
      setError(nudgeError.message || "Could not send payment nudge email.");
    } finally {
      setSavingId("");
    }
  };

  const markDelivered = async (order, deliveredAt) => {
    const shouldMarkDelivered = window.confirm(
      "Are you sure you want to mark this order as delivered?"
    );

    if (!shouldMarkDelivered) {
      return;
    }

    const payload =
      order.sourceType === "legacy_preorder"
        ? { deliveredAt }
        : { markDelivered: true, deliveredAt };

    await patchOrder(order, payload, "Could not mark order as delivered.");
  };

  const confirmLegacyPreorder = async (order) => {
    await patchOrder(
      order,
      { status: "confirmed" },
      "Could not confirm preorder."
    );
  };

  const exportOrdersAsCsv = () => {
    const headers = [
      "Order Number",
      "Customer Name",
      "Order Type",
      "Status",
      "Payment Status",
      "Delivery Date",
      "Order Value",
      "Currency",
      "Quantity",
      "Phone",
      "Email",
      "Address",
      "Created At",
      "Items",
    ];

    const rows = orders.map((order) => [
      order.orderNumber || "",
      order.customerName || "",
      getModeLabel(order),
      order.status || "",
      order.paymentBadgeLabel || "",
      formatDateOnly(getOrderSummaryDeliveryDate(order)),
      Number(order.total || 0).toFixed(2),
      order.currency || "INR",
      String(order.totalQuantity || 0),
      order.phone || "",
      order.email || "",
      order.normalizedDeliveryAddress || order.address || order.pickupAddressSnapshot || "",
      formatDateTime(order.createdAt),
      (Array.isArray(order.items) ? order.items : [])
        .map((item) => `${item.productName || item.sku || "Item"} x ${Number(item.quantity || 0)}`)
        .join("; "),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `orders-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleOrderExpanded = (order) => {
    const key = `${order.sourceType}:${order.id}`;

    setExpandedOrders((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  if (orders.length === 0) {
    return (
      <section className="rounded-2xl bg-base-100 p-8 shadow-md">
        <p className="text-lg font-medium">No orders yet.</p>
        <p className="mt-2 opacity-70">New customer orders will appear here automatically.</p>
      </section>
    );
  }

  const renderOneTimeOrder = (order) => {
    const trackingInputId = getTrackingInputId(order);
    const deliveredAtInputId = getDeliveredAtInputId(order);
    const isLegacy = order.sourceType === "legacy_preorder";
    const isRecurringOrderPlan =
      order.sourceType === "order_plan" && order.mode === "recurring";
    const isPickup = order.fulfillmentMethod === "pickup";
    const canManageRecurringDelivery =
      isRecurringOrderPlan &&
      isRecurringOrderPlanPaymentConfirmed(order.payment);
    const canSendPaymentNudge = isPaymentOrMandateSetupPending(order);
    const canConfirmLegacy =
      isLegacy &&
      order.status === "pending" &&
      order.payment?.provider !== "razorpay";
    const canMarkShipped = isRecurringOrderPlan
      ? canManageRecurringDelivery && ["new", "active"].includes(order.status)
      : order.status === "confirmed";
    const canMarkDelivered = isRecurringOrderPlan
      ? canManageRecurringDelivery && ["new", "active", "shipped"].includes(order.status)
      : order.status === "confirmed" || order.status === "shipped";

    return (
      <>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-medium">Items</div>
              <div className="text-xs opacity-60">
                {isLegacy ? order.preorderWindowLabel || "Legacy preorder" : order.selectionSummary}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th className="text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((item) => (
                      <tr key={`${order.sourceType}-${order.id}-${item.sku}`}>
                        <td>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs opacity-60">{item.sku}</div>
                        </td>
                        <td>{item.quantity}</td>
                        <td className="text-right">
                          {formatCurrency(order.currency, item.lineTotal)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center opacity-70">
                        No SKU breakdown was saved for this order.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                {isLegacy ? (
                  <>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Batch</div>
                      <div className="mt-1">{order.preorderWindowLabel || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery date</div>
                      <div className="mt-1">{formatDateOnly(order.firstDeliveryDate)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Next delivery</div>
                      <div className="mt-1">
                        {formatSubscriptionDate(order.nextDeliveryDate) || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">First delivery</div>
                      <div className="mt-1">
                        {formatSubscriptionDate(order.firstDeliveryDate || order.startDate) || "-"}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivered at</div>
                  <div className="mt-1">{formatDateTime(order.deliveredAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Shipped at</div>
                  <div className="mt-1">{formatDateTime(order.shippedAt)}</div>
                </div>
                {isLegacy && (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Confirmation</div>
                    <div className="mt-1">{order.confirmationLabel}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">
                    {isPickup ? "Pickup" : "Distance"}
                  </div>
                  <div className="mt-1">
                    {isPickup
                      ? "Free pickup"
                      : `${Number(order.deliveryDistanceKm || 0).toFixed(1)} km`}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Subtotal</div>
                  <div className="mt-1">{formatCurrency(order.currency, order.subtotal)}</div>
                </div>
                {Number(order.smallCartFee || 0) > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Small cart fee</div>
                    <div className="mt-1">{formatCurrency(order.currency, order.smallCartFee)}</div>
                  </div>
                )}
                {isLegacy && (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Discount</div>
                    <div className="mt-1">
                      {order.discount?.discountAmount > 0
                        ? `${order.discount.code} (-${formatCurrency(
                            order.currency,
                            order.discount.discountAmount
                          )})`
                        : "-"}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery fee</div>
                  <div className="mt-1">
                    {formatCurrency(order.currency, order.deliveryFee)}
                    {order.appliedPerks?.length > 0 && (
                      <span className="ml-2 text-xs text-success">
                        {order.appliedPerks[0].areaLabel || order.appliedPerks[0].name}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Total</div>
                  <div className="mt-1 font-medium">{formatCurrency(order.currency, order.total)}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Tracking</div>
                  <div className="mt-1 break-all">
                    {order.trackingLink ? (
                      <a
                        className="link link-primary"
                        href={order.trackingLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {order.trackingLink}
                      </a>
                    ) : order.estimatedArrivalAt ? (
                      `Estimated arrival around ${formatDateTime(order.estimatedArrivalAt)}`
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="text-xs uppercase tracking-[0.16em] opacity-60">
                {isPickup ? "Pickup address" : "Delivery address"}
              </div>
              <div className="mt-1">
                {isPickup
                  ? order.pickupAddressSnapshot || "-"
                  : order.normalizedDeliveryAddress || order.address || "-"}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Phone</div>
                  <div className="mt-1">{order.phone}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Email</div>
                  <div className="mt-1">{order.email || "-"}</div>
                </div>
              </div>
            </div>
            {renderRazorpayArtifacts(order.payment)}
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-base-200 p-4">
          <div className="flex flex-wrap items-end gap-3">
            {!isPickup ? (
              <label className="form-control min-w-[280px] flex-1">
                <div className="label py-0">
                  <span className="label-text">Tracking link (optional)</span>
                </div>
                <input
                  type="url"
                  className="input input-bordered"
                  defaultValue={order.trackingLink || ""}
                  id={trackingInputId}
                  placeholder="https://..."
                />
              </label>
            ) : (
              <div className="min-w-[280px] flex-1 rounded-xl border border-base-300 bg-base-100 px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Pickup address</div>
                <div className="mt-1">{order.pickupAddressSnapshot || "-"}</div>
              </div>
            )}
            {canConfirmLegacy && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={
                  savingId === `${order.sourceType}:${order.id}` ||
                  deletingId === `${order.sourceType}:${order.id}`
                }
                onClick={() => confirmLegacyPreorder(order)}
              >
                {savingId === `${order.sourceType}:${order.id}` ? "Saving..." : "Confirm order"}
              </button>
            )}
            {canSendPaymentNudge && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={
                  savingId === `${order.sourceType}:${order.id}` ||
                  deletingId === `${order.sourceType}:${order.id}` ||
                  (!order.phone && !order.email)
                }
                onClick={() => sendPaymentNudge(order)}
              >
                {savingId === `${order.sourceType}:${order.id}`
                  ? "Sending..."
                  : isRecurringOrderPlan
                    ? "Nudge mandate setup"
                    : "Nudge payment"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={
                savingId === `${order.sourceType}:${order.id}` ||
                deletingId === `${order.sourceType}:${order.id}` ||
                !order.phone
              }
              onClick={() => confirmProduction(order)}
            >
              {savingId === `${order.sourceType}:${order.id}` ? "Sending..." : "Confirm production"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={
                savingId === `${order.sourceType}:${order.id}` ||
                deletingId === `${order.sourceType}:${order.id}` ||
                !canMarkShipped
              }
              onClick={() => {
                const element = document.getElementById(trackingInputId);
                markShipped(order, element?.value || "");
              }}
            >
              {savingId === `${order.sourceType}:${order.id}`
                ? "Saving..."
                : isPickup
                  ? "Mark ready for pickup"
                  : "Mark as shipped"}
            </button>
            <label className="form-control">
              <div className="label py-0">
                <span className="label-text">Delivered at</span>
              </div>
              <input
                type="datetime-local"
                className="input input-bordered"
                defaultValue={toDateTimeLocal(order.deliveredAt || new Date())}
                id={deliveredAtInputId}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                savingId === `${order.sourceType}:${order.id}` ||
                deletingId === `${order.sourceType}:${order.id}` ||
                !canMarkDelivered
              }
              onClick={() => {
                const element = document.getElementById(deliveredAtInputId);
                markDelivered(order, element?.value || "");
              }}
            >
              {savingId === `${order.sourceType}:${order.id}` ? "Saving..." : "Mark as delivered"}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderOrderCard = (order) => (
    <article
      key={`${order.sourceType}:${order.id}`}
      className="rounded-2xl bg-base-100 p-5 shadow-md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <button
            type="button"
            className="min-w-0 flex-1 rounded-xl text-left transition hover:bg-base-200/60"
            onClick={() => toggleOrderExpanded(order)}
            aria-expanded={Boolean(expandedOrders[`${order.sourceType}:${order.id}`])}
          >
            <div className="grid gap-4 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_90px]">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Name</div>
                <h2 className="mt-1 break-words text-lg font-semibold leading-snug">
                  {order.customerName}
                </h2>
                <p className="mt-1 text-sm font-medium opacity-80">
                  {order.orderNumber || "Order number pending"}
                </p>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery date</div>
                <div className="mt-1 text-sm font-medium">
                  {formatDateOnly(getOrderSummaryDeliveryDate(order))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Order value</div>
                <div className="mt-1 text-sm font-medium">
                  {formatCurrency(order.currency, order.total)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">
                  {expandedOrders[`${order.sourceType}:${order.id}`] ? "Collapse" : "Expand"}
                </div>
                <div className="mt-1 text-2xl leading-none">
                  {expandedOrders[`${order.sourceType}:${order.id}`] ? "−" : "+"}
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm text-error"
            disabled={deletingId === `${order.sourceType}:${order.id}`}
            onClick={() => deleteOrder(order)}
          >
            {deletingId === `${order.sourceType}:${order.id}` ? "Deleting..." : "Delete"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className={getModeBadgeClassName(order)}>{getModeLabel(order)}</div>
          <div className="badge badge-outline">{order.status}</div>
          <div className="badge badge-outline">{order.paymentBadgeLabel}</div>
          {order.sourceType === "legacy_preorder" ? (
            <div className="badge badge-outline">
              {order.fulfillmentMethod === "pickup" ? "pickup" : "delivery"}
            </div>
          ) : order.mode === "recurring" ? (
            <>
              <div className="badge badge-outline">{formatSubscriptionCadence(order.cadence)}</div>
              <div className="badge badge-outline">{formatSubscriptionDuration(order.durationWeeks)}</div>
            </>
          ) : null}
          <div className="badge badge-outline">qty {order.totalQuantity || 0}</div>
        </div>
      </div>

      {expandedOrders[`${order.sourceType}:${order.id}`] ? renderOneTimeOrder(order) : null}
    </article>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
            <div className="text-sm opacity-70">Total</div>
            <div className="mt-1 text-2xl font-semibold">{summary.total}</div>
          </div>
          <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
            <div className="text-sm opacity-70">One-time</div>
            <div className="mt-1 text-2xl font-semibold">{summary.oneTime}</div>
          </div>
          <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
            <div className="text-sm opacity-70">Recurring</div>
            <div className="mt-1 text-2xl font-semibold">{summary.recurring}</div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-outline"
          onClick={exportOrdersAsCsv}
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="alert alert-success">
          <span>{message}</span>
        </div>
      )}

      {orderEntryConfig && (
        <details className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold">
            Add phone or face-to-face order
          </summary>
          <div className="mt-4">
            <SubscriptionForm
              {...orderEntryConfig}
              initialSelectionMode="custom"
              enableAdminManualOrders
              onOrderSaved={addOrderToState}
            />
          </div>
        </details>
      )}

      {activeOrders.map((order) => renderOrderCard(order))}

      {fulfilledOrders.length > 0 && (
        <section className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm opacity-70">
              {fulfilledOrders.length} fulfilled order(s) are hidden to keep this list focused.
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowFulfilledOrders((current) => !current)}
            >
              {showFulfilledOrders
                ? `Hide fulfilled (${fulfilledOrders.length})`
                : `Show fulfilled (${fulfilledOrders.length})`}
            </button>
          </div>
        </section>
      )}

      {showFulfilledOrders && fulfilledOrders.map((order) => renderOrderCard(order))}
    </section>
  );
}
