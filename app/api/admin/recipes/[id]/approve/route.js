import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import RecipeFormula from "@/models/RecipeFormula";
import { serializeRecipeFormula } from "@/libs/recipe-formulas";

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

export async function PATCH(_req, { params }) {
  const { error, session } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const recipe = await RecipeFormula.findById(params.id);

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }

    if (recipe.status === "approved") {
      return NextResponse.json({ recipe: serializeRecipeFormula(recipe) });
    }

    await RecipeFormula.updateMany(
      { sku: recipe.sku, status: "approved", _id: { $ne: recipe._id } },
      { $set: { status: "archived" } }
    );

    recipe.status = "approved";
    recipe.approvedBy = String(session.user.email || "").trim().toLowerCase();
    recipe.approvedAt = new Date();
    await recipe.save();

    return NextResponse.json({ recipe: serializeRecipeFormula(recipe) });
  } catch (approvalError) {
    console.error(approvalError);
    return NextResponse.json({ error: approvalError.message }, { status: 500 });
  }
}
