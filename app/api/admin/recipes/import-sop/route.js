import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import RecipeFormula from "@/models/RecipeFormula";
import { parseRecipeFromInput } from "@/libs/recipe-parser";
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

export async function POST(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const form = await req.formData();
    const file = form.get("file");
    const preferredSku = String(form.get("sku") || "")
      .trim()
      .toUpperCase();
    const preferredSkuName = String(form.get("skuName") || "").trim();

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "A SOP image file is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { suggestion, parserMeta } = await parseRecipeFromInput({
      type: "image",
      buffer,
      mimeType: file.type || "image/jpeg",
      sku: preferredSku,
      skuName: preferredSkuName,
    });

    const payload = normalizeRecipeFormulaPayload(
      {
        sku: suggestion.sku || preferredSku,
        skuName: suggestion.skuName || preferredSkuName,
        baseYieldLitres: suggestion.baseYieldLitres,
        ingredients: suggestion.ingredients,
      },
      { sourceType: "sop_snapshot" }
    );
    const validationError = validateRecipeFormulaPayload(payload);

    if (validationError) {
      return NextResponse.json(
        {
          error: validationError,
          suggestion,
        },
        { status: 400 }
      );
    }

    const version = await getNextRecipeVersion(RecipeFormula, payload.sku);
    const recipe = await RecipeFormula.create({
      ...payload,
      version,
      status: "draft",
      sourceType: "sop_snapshot",
      parser: parserMeta,
    });

    return NextResponse.json(
      {
        suggestion,
        recipe: serializeRecipeFormula(recipe),
      },
      { status: 201 }
    );
  } catch (parseError) {
    console.error(parseError);
    return NextResponse.json({ error: parseError.message }, { status: 500 });
  }
}
