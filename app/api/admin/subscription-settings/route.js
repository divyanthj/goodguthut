import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import {
  getSubscriptionSettings,
  sanitizeDeliveryDaysOfWeek,
  sanitizeMinimumLeadDays,
  sanitizeRecurringMinTotalQuantity,
} from "@/libs/subscription-settings";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";

const getAdminSession = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
};

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const settings = await getSubscriptionSettings();

  return NextResponse.json({ settings });
}

export async function PUT(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const body = await req.json();
    const settings = await getSubscriptionSettings();
    settings.deliveryDaysOfWeek = sanitizeDeliveryDaysOfWeek(body.deliveryDaysOfWeek);
    settings.minimumLeadDays = sanitizeMinimumLeadDays(body.minimumLeadDays);
    settings.recurringMinTotalQuantity = sanitizeRecurringMinTotalQuantity(
      body.recurringMinTotalQuantity
    );
    await settings.save();
    await recalculateSubscriptionRouteSnapshots();
    const refreshedSettings = await getSubscriptionSettings();

    return NextResponse.json({ settings: refreshedSettings });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  return PUT(req);
}
