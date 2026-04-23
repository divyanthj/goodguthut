import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import RecipeFormula from "@/models/RecipeFormula";
import {
  getNextRecipeVersion,
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

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const recipes = await RecipeFormula.find({}).sort({ sku: 1, version: -1, updatedAt: -1 });

  return NextResponse.json({
    recipes: recipes.map((recipe) => serializeRecipeFormula(recipe)),
  });
}

export async function POST(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const payload = normalizeRecipeFormulaPayload(await req.json(), { sourceType: "manual" });
    const validationError = validateRecipeFormulaPayload(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const version = await getNextRecipeVersion(RecipeFormula, payload.sku);
    const recipe = await RecipeFormula.create({
      ...payload,
      version,
      status: "draft",
      sourceType: "manual",
    });

    return NextResponse.json({ recipe: serializeRecipeFormula(recipe) }, { status: 201 });
  } catch (createError) {
    console.error(createError);
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }
}
