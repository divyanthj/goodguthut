import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import {
  assertValidOrderPlanStatus,
  getOrderPlanDisplayStatus,
  isRecurringOrderPlanPaymentConfirmed,
  normalizeOneTimeOrderPlanStatus,
} from "@/libs/order-plans";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";
import { createAndSendOrderPlanInvoice } from "@/libs/invoices";
import { sendOrderPlanShippedEmail } from "@/libs/shipment-notifications";
import { listPlannedSubscriptionDeliveryDates } from "@/libs/subscription-schedule";
import OrderPlan from "@/models/OrderPlan";
import {
  removeCollatoKnowledgeDocument,
  syncCollatoKnowledgeDocument,
} from "@/libs/collato-knowledge";

const ensureAdmin = async () => {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return null;
};

const refreshRouteSnapshots = async () => {
  try {
    await recalculateSubscriptionRouteSnapshots();
  } catch (routeError) {
    console.error("Failed to refresh delivery route snapshots", routeError);
  }
};

const ensureOneTimeFulfillmentStatus = (orderPlan) => {
  if (orderPlan.mode !== "one_time") {
    return;
  }

  if (orderPlan.status === "active") {
    orderPlan.status = "confirmed";
  }
};

const getNextRecurringDeliveryDateAfterCurrent = (orderPlan) => {
  const currentDeliveryDate = String(
    orderPlan.nextDeliveryDate || orderPlan.firstDeliveryDate || orderPlan.startDate || ""
  ).trim();
  const plannedDates = listPlannedSubscriptionDeliveryDates({
    startDate: orderPlan.firstDeliveryDate || orderPlan.startDate,
    cadence: orderPlan.cadence,
    totalCount: orderPlan.payment?.totalCount || 0,
  });

  return plannedDates.find((dateKey) => dateKey > currentDeliveryDate) || "";
};

const isRecurringDeliveryActionAllowed = (orderPlan, allowedStatuses = []) => {
  const status = String(orderPlan.status || "").trim();
  const blockedStatuses = new Set(["cancelled", "failed", "fulfilled", "paused"]);

  return (
    allowedStatuses.includes(status) &&
    !blockedStatuses.has(status) &&
    isRecurringOrderPlanPaymentConfirmed(orderPlan.payment)
  );
};

export async function PATCH(req, { params }) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  try {
    const body = await req.json();
    let shouldGenerateInvoice = false;
    let invoiceDeliveryDate = "";

    await connectMongo();
    const orderPlan = await OrderPlan.findById(params.id);

    if (!orderPlan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    ensureOneTimeFulfillmentStatus(orderPlan);

    if (orderPlan.mode === "one_time") {
      if (body?.markShipped) {
        const currentStatus = normalizeOneTimeOrderPlanStatus(orderPlan.status);

        if (currentStatus !== "confirmed") {
          return NextResponse.json(
            { error: "Only confirmed orders can be marked as shipped." },
            { status: 400 }
          );
        }

        const trackingLink = String(body?.trackingLink || "").trim();
        const now = new Date();

        orderPlan.shipment = {
          ...(orderPlan.shipment?.toObject?.() || orderPlan.shipment || {}),
          trackingLink,
          shippedAt: now,
          estimatedArrivalAt: trackingLink ? null : new Date(now.getTime() + 60 * 60 * 1000),
        };
        orderPlan.status = "shipped";
      } else if (body?.markDelivered) {
        const currentStatus = normalizeOneTimeOrderPlanStatus(orderPlan.status);

        if (!["confirmed", "shipped"].includes(currentStatus)) {
          return NextResponse.json(
            { error: "Only confirmed or shipped orders can be marked as delivered." },
            { status: 400 }
          );
        }

        const deliveredAtValue = String(body?.deliveredAt || "").trim();
        const deliveredAt = deliveredAtValue ? new Date(deliveredAtValue) : new Date();

        if (Number.isNaN(deliveredAt.getTime())) {
          return NextResponse.json({ error: "Enter a valid delivered timestamp." }, { status: 400 });
        }

        orderPlan.deliveredAt = deliveredAt;
        orderPlan.status = "fulfilled";
        shouldGenerateInvoice = true;
      } else {
        const nextStatus = String(body?.status || "").trim();
        const normalizedStatus = getOrderPlanDisplayStatus({
          mode: "one_time",
          status: nextStatus,
        });
        assertValidOrderPlanStatus(normalizedStatus, "one_time");
        orderPlan.status = normalizedStatus;
      }
    } else if (body?.markShipped) {
      if (!isRecurringDeliveryActionAllowed(orderPlan, ["new", "active"])) {
        return NextResponse.json(
          { error: "Only active recurring orders can be marked as shipped." },
          { status: 400 }
        );
      }

      const trackingLink = String(body?.trackingLink || "").trim();
      const now = new Date();

      orderPlan.shipment = {
        ...(orderPlan.shipment?.toObject?.() || orderPlan.shipment || {}),
        trackingLink,
        shippedAt: now,
        estimatedArrivalAt: trackingLink ? null : new Date(now.getTime() + 60 * 60 * 1000),
      };
      orderPlan.status = "shipped";
    } else if (body?.markDelivered) {
      if (!isRecurringDeliveryActionAllowed(orderPlan, ["new", "active", "shipped"])) {
        return NextResponse.json(
          { error: "Only active or shipped recurring orders can be marked as delivered." },
          { status: 400 }
        );
      }

      const deliveredAtValue = String(body?.deliveredAt || "").trim();
      const deliveredAt = deliveredAtValue ? new Date(deliveredAtValue) : new Date();

      if (Number.isNaN(deliveredAt.getTime())) {
        return NextResponse.json({ error: "Enter a valid delivered timestamp." }, { status: 400 });
      }

      invoiceDeliveryDate = String(
        orderPlan.nextDeliveryDate || orderPlan.firstDeliveryDate || orderPlan.startDate || ""
      ).trim();
      orderPlan.deliveredAt = deliveredAt;

      const nextDeliveryDate = getNextRecurringDeliveryDateAfterCurrent(orderPlan);
      orderPlan.nextDeliveryDate = nextDeliveryDate;
      orderPlan.status = nextDeliveryDate ? "active" : "fulfilled";
      shouldGenerateInvoice = true;
    } else {
      const nextStatus = String(body?.status || "").trim();
      assertValidOrderPlanStatus(nextStatus, "recurring");
      orderPlan.status = nextStatus;
    }

    await orderPlan.save();
    await refreshRouteSnapshots();

    let emailDelivery = null;

    if (body?.markShipped && body?.sendEmail === false) {
      emailDelivery = { status: "skipped", reason: "admin_disabled" };
    } else if (body?.markShipped) {
      try {
        emailDelivery = await sendOrderPlanShippedEmail({ orderPlan });
      } catch (emailError) {
        console.error("Failed to send order shipped email", emailError);
        emailDelivery = {
          status: "failed",
          error: emailError.message || "Could not send shipped email.",
        };
      }
    }

    if (shouldGenerateInvoice) {
      const invoiceDelivery = await createAndSendOrderPlanInvoice({
        orderPlan,
        deliveryDate: invoiceDeliveryDate,
        sendEmail: body?.sendEmail !== false,
      });
      await syncCollatoKnowledgeDocument({
        sourceType: "order_plan",
        id: orderPlan.id,
        title: `Order plan ${orderPlan.orderNumber || orderPlan.name || orderPlan.id}`,
        data: orderPlan,
      });
      if (invoiceDelivery.invoice) {
        await syncCollatoKnowledgeDocument({
          sourceType: "invoice",
          id: invoiceDelivery.invoice.id,
          title: `Invoice ${invoiceDelivery.invoice.invoiceNumber || invoiceDelivery.invoice.id}`,
          data: invoiceDelivery.invoice,
        });
      }

      return NextResponse.json({
        orderPlan: JSON.parse(JSON.stringify(orderPlan)),
        invoiceDelivery: {
          invoice: invoiceDelivery.invoice,
          created: invoiceDelivery.created,
          emailDelivery: invoiceDelivery.emailDelivery,
        },
      });
    }

    await syncCollatoKnowledgeDocument({
      sourceType: "order_plan",
      id: orderPlan.id,
      title: `Order plan ${orderPlan.orderNumber || orderPlan.name || orderPlan.id}`,
      data: orderPlan,
    });
    return NextResponse.json({
      orderPlan: JSON.parse(JSON.stringify(orderPlan)),
      ...(emailDelivery ? { emailDelivery } : {}),
    });
  } catch (error) {
    console.error(error);

    if (error.message === "Invalid order status.") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Could not update order." }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  try {
    await connectMongo();
    const orderPlan = await OrderPlan.findByIdAndDelete(params.id);

    if (!orderPlan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    await refreshRouteSnapshots();
    await removeCollatoKnowledgeDocument({ sourceType: "order_plan", id: orderPlan.id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not delete order." }, { status: 500 });
  }
}
