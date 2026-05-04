import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import Subscription from "@/models/Subscription";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import RecipeFormula from "@/models/RecipeFormula";
import { getSubscriptionSettings } from "@/libs/subscription-settings";
import {
  buildIngredientSheet,
  computeDemandForDeliveryDate,
  listUpcomingCommittedDeliveryDateKeys,
} from "@/libs/production-planner";

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

  try {
    const [subscriptions, orderPlans, preorders, approvedRecipes, settings] = await Promise.all([
      Subscription.find({}).sort({ createdAt: -1 }),
      OrderPlan.find({}).sort({ createdAt: -1 }),
      Preorder.find({}).sort({ createdAt: -1 }),
      RecipeFormula.find({ status: "approved" }).sort({ sku: 1, version: -1 }),
      getSubscriptionSettings(),
    ]);

    const serializedSubscriptions = JSON.parse(JSON.stringify(subscriptions));
    const serializedOrderPlans = JSON.parse(JSON.stringify(orderPlans));
    const serializedPreorders = JSON.parse(JSON.stringify(preorders));
    const deliveryDaysOfWeek = settings?.deliveryDaysOfWeek || [];
    const deliveryDates = listUpcomingCommittedDeliveryDateKeys({
      subscriptions: serializedSubscriptions,
      orderPlans: serializedOrderPlans,
      preorders: serializedPreorders,
      limit: 2,
    });
    const recipeMap = new Map(
      approvedRecipes.map((recipeDoc) => {
        const recipe = recipeDoc.toJSON ? recipeDoc.toJSON() : recipeDoc;
        return [recipe.sku, recipe];
      })
    );
    const snapshots = deliveryDates.map((deliveryDate) => {
      const demandSummary = computeDemandForDeliveryDate({
        subscriptions: serializedSubscriptions,
        orderPlans: serializedOrderPlans,
        preorders: serializedPreorders,
        deliveryDate,
        deliveryDaysOfWeek,
      });
      const selectedDate = demandSummary.deliveryDate
        ? new Date(`${demandSummary.deliveryDate}T00:00:00`)
        : new Date();
      const sheet = buildIngredientSheet({
        weekStart: selectedDate,
        deliveryDate: demandSummary.deliveryDate,
        demandBySku: demandSummary.demandBySku,
        approvedRecipesBySku: recipeMap,
        bottleSizeMl: 200,
      });

      return {
        ...sheet,
        summary: {
          ...demandSummary.summary,
          minimumLeadDays: Number(settings?.minimumLeadDays || 0),
        },
      };
    });

    return NextResponse.json({
      snapshots,
    });
  } catch (sheetError) {
    console.error(sheetError);
    return NextResponse.json({ error: sheetError.message }, { status: 500 });
  }
}
