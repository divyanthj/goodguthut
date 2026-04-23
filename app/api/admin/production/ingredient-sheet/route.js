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
  computeDemandForNextDeliveryDate,
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

    const demandSummary = computeDemandForNextDeliveryDate({
      subscriptions: JSON.parse(JSON.stringify(subscriptions)),
      orderPlans: JSON.parse(JSON.stringify(orderPlans)),
      preorders: JSON.parse(JSON.stringify(preorders)),
      deliveryDaysOfWeek: settings?.deliveryDaysOfWeek || [],
    });
    const recipeMap = new Map(
      approvedRecipes.map((recipeDoc) => {
        const recipe = recipeDoc.toJSON ? recipeDoc.toJSON() : recipeDoc;
        return [recipe.sku, recipe];
      })
    );
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

    return NextResponse.json({
      ...sheet,
      summary: {
        ...demandSummary.summary,
        minimumLeadDays: Number(settings?.minimumLeadDays || 0),
      },
    });
  } catch (sheetError) {
    console.error(sheetError);
    return NextResponse.json({ error: sheetError.message }, { status: 500 });
  }
}
