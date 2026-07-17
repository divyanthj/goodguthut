import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import { recalculatePreorderWindowRouteSnapshot } from "@/libs/preorder-route-planner";
import Preorder from "@/models/Preorder";
import {
  preparePreorderShippedNotifications,
  sendPreorderShippedEmail,
} from "@/libs/shipment-notifications";
import { createAndSendPreorderInvoice } from "@/libs/invoices";
import {
  removeCollatoKnowledgeDocument,
  syncCollatoKnowledgeDocument,
} from "@/libs/collato-knowledge";

export async function PATCH(req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectMongo();

  try {
    const body = await req.json();
    const nextStatus = body.status;

    if (body.markShipped) {
      const preorder = await Preorder.findById(params.id);

      if (!preorder) {
        return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
      }

      const trackingLink = (body.trackingLink || "").trim();
      const shippedAt = new Date();
      const estimatedArrivalAt =
        preorder.fulfillmentMethod === "pickup" || trackingLink
          ? null
          : new Date(shippedAt.getTime() + 60 * 60 * 1000);

      preorder.set("shipment", {
        ...(preorder.shipment?.toObject?.() || preorder.shipment || {}),
        shippedAt,
        trackingLink,
        estimatedArrivalAt,
      });

      if (preorder.status !== "fulfilled") {
        preorder.status = "shipped";
      }

      await preorder.save();

      if (preorder.preorderWindow) {
        try {
          await recalculatePreorderWindowRouteSnapshot({
            preorderWindowId: preorder.preorderWindow,
          });
        } catch (routeError) {
          console.error("Failed to refresh preorder delivery route snapshot", routeError);
        }
      }

      const notificationScaffold = await preparePreorderShippedNotifications({ preorder });
      let emailDelivery = { status: "manual" };

      if (body.sendEmail === false) {
        emailDelivery = { status: "skipped", reason: "admin_disabled" };
      } else {
        try {
          emailDelivery = await sendPreorderShippedEmail({ preorder });
        } catch (emailError) {
          console.error("Failed to send preorder shipped email", emailError);
          emailDelivery = {
            status: "failed",
            error: emailError.message || "Could not send shipped email.",
          };
        }
      }
      await syncCollatoKnowledgeDocument({
        sourceType: "preorder",
        id: preorder.id,
        title: `Preorder ${preorder.orderNumber || preorder.customerName || preorder.id}`,
        data: preorder,
      });

      return NextResponse.json({
        preorder,
        notificationScaffold,
        emailDelivery,
        whatsappDelivery: { status: "manual" },
      });
    }

    if (nextStatus) {
      if (!["confirmed", "shipped", "fulfilled", "cancelled", "pending"].includes(nextStatus)) {
        return NextResponse.json({ error: "Invalid preorder status." }, { status: 400 });
      }

      const preorder = await Preorder.findById(params.id);

      if (!preorder) {
        return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
      }

      preorder.status = nextStatus;

      if (nextStatus !== "fulfilled") {
        preorder.deliveredAt = body.keepDeliveredAt ? preorder.deliveredAt : null;
      } else if (!preorder.deliveredAt) {
        preorder.deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : new Date();
      }

      await preorder.save();

      if (preorder.preorderWindow) {
        try {
          await recalculatePreorderWindowRouteSnapshot({
            preorderWindowId: preorder.preorderWindow,
          });
        } catch (routeError) {
          console.error("Failed to refresh preorder delivery route snapshot", routeError);
        }
      }

      if (nextStatus === "fulfilled") {
        const invoiceDelivery = await createAndSendPreorderInvoice({
          preorder,
          sendEmail: body.sendEmail !== false,
        });
        await syncCollatoKnowledgeDocument({
          sourceType: "preorder",
          id: preorder.id,
          title: `Preorder ${preorder.orderNumber || preorder.customerName || preorder.id}`,
          data: preorder,
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
          preorder,
          invoiceDelivery: {
            invoice: invoiceDelivery.invoice,
            created: invoiceDelivery.created,
            emailDelivery: invoiceDelivery.emailDelivery,
          },
        });
      }

      await syncCollatoKnowledgeDocument({
        sourceType: "preorder",
        id: preorder.id,
        title: `Preorder ${preorder.orderNumber || preorder.customerName || preorder.id}`,
        data: preorder,
      });
      return NextResponse.json({ preorder });
    }

    const deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null;

    if (!deliveredAt || Number.isNaN(deliveredAt.getTime())) {
      return NextResponse.json({ error: "A valid delivery time is required." }, { status: 400 });
    }

    const preorder = await Preorder.findById(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
    }

    preorder.deliveredAt = deliveredAt;
    preorder.status = "fulfilled";
    await preorder.save();

    if (preorder.preorderWindow) {
      try {
        await recalculatePreorderWindowRouteSnapshot({
          preorderWindowId: preorder.preorderWindow,
        });
      } catch (routeError) {
        console.error("Failed to refresh preorder delivery route snapshot", routeError);
      }
    }

    const invoiceDelivery = await createAndSendPreorderInvoice({
      preorder,
      sendEmail: body.sendEmail !== false,
    });
    await syncCollatoKnowledgeDocument({
      sourceType: "preorder",
      id: preorder.id,
      title: `Preorder ${preorder.orderNumber || preorder.customerName || preorder.id}`,
      data: preorder,
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
      preorder,
      invoiceDelivery: {
        invoice: invoiceDelivery.invoice,
        created: invoiceDelivery.created,
        emailDelivery: invoiceDelivery.emailDelivery,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectMongo();

  try {
    const preorder = await Preorder.findByIdAndDelete(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
    }

    if (preorder.preorderWindow) {
      try {
        await recalculatePreorderWindowRouteSnapshot({
          preorderWindowId: preorder.preorderWindow,
        });
      } catch (routeError) {
        console.error("Failed to refresh preorder delivery route snapshot", routeError);
      }
    }
    await removeCollatoKnowledgeDocument({ sourceType: "preorder", id: preorder.id });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
