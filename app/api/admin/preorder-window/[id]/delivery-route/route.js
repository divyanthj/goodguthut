import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import { recalculatePreorderWindowRouteSnapshot } from "@/libs/preorder-route-planner";
import PreorderWindow from "@/models/PreorderWindow";

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

export async function GET(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const preorderWindow = await PreorderWindow.findById(params.id);

    if (!preorderWindow) {
      return NextResponse.json({ error: "Preorder window not found." }, { status: 404 });
    }

    const routePlan = await recalculatePreorderWindowRouteSnapshot({
      preorderWindow,
    });

    return NextResponse.json({
      batch: {
        id: preorderWindow.id,
        title: preorderWindow.title,
        deliveryDate: preorderWindow.deliveryDate,
        pickupAddress: routePlan?.originAddress || "",
        driverPayoutPerKm: Number(preorderWindow.driverPayoutPerKm || 0),
      },
      routePlan,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not generate delivery route." },
      { status: 500 }
    );
  }
}
