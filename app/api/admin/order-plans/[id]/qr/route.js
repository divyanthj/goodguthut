import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import OrderPlan from "@/models/OrderPlan";
import { isAdminQrOrder, syncAdminOrderQrPayment } from "@/libs/admin-order-qr";
import { enforceBrowserOrigin } from "@/libs/request-protection";

export const dynamic = "force-dynamic";

const handleQrPayment = async (req, { params }, cancel) => {
  const originError = enforceBrowserOrigin(req);
  if (originError) return originError;
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!/^[a-f\d]{24}$/i.test(params.id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    await connectMongo();
    const order = await OrderPlan.findById(params.id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (!isAdminQrOrder(order)) return NextResponse.json({ error: "This order does not have an admin QR payment." }, { status: 400 });
    const updated = await syncAdminOrderQrPayment(order, { cancel });
    return NextResponse.json({ orderPlan: JSON.parse(JSON.stringify(updated)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to synchronize admin QR payment", error);
    return NextResponse.json({ error: "Could not check the QR payment with Razorpay. Please try again." }, { status: 502 });
  }
};

export const GET = (req, context) => handleQrPayment(req, context, false);
export const DELETE = (req, context) => handleQrPayment(req, context, true);
