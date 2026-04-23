import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import RecipeFormula from "@/models/RecipeFormula";
import {
  normalizeRecipeFormulaPayload,
  serializeRecipeFormula,
  validateRecipeFormulaPayload,
} from "@/libs/recipe-formulas";

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
  const recipe = await RecipeFormula.findById(params.id);

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  return NextResponse.json({ recipe: serializeRecipeFormula(recipe) });
}

export async function PATCH(req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const recipe = await RecipeFormula.findById(params.id);

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }

    if (recipe.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft recipes can be edited directly. Load approved versions and save as a new draft." },
        { status: 409 }
      );
    }

    const payload = normalizeRecipeFormulaPayload(await req.json(), {
      sourceType: recipe.sourceType || "manual",
    });
    const validationError = validateRecipeFormulaPayload(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    recipe.sku = payload.sku;
    recipe.skuName = payload.skuName;
    recipe.baseYieldLitres = payload.baseYieldLitres;
    recipe.ingredients = payload.ingredients;
    await recipe.save();

    return NextResponse.json({ recipe: serializeRecipeFormula(recipe) });
  } catch (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
}
