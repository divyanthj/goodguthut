const DEFAULT_VISION_MODEL = process.env.OPENAI_RECIPE_VISION_MODEL || "gpt-4.1-mini";

const extractFirstJsonObject = (text = "") => {
  const trimmed = String(text || "").trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
};

const parseVisionRecipe = async ({ buffer, mimeType, sku = "", skuName = "" }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const base64Image = Buffer.from(buffer).toString("base64");
  const imageDataUrl = `data:${mimeType || "image/jpeg"};base64,${base64Image}`;

  const instructions = [
    "Extract recipe information from this SOP image.",
    "Return only JSON with this shape:",
    "{",
    '  "sku": "string",',
    '  "skuName": "string",',
    '  "baseYieldLitres": number,',
    '  "ingredients": [',
    "    {",
    '      "name": "string",',
    '      "quantity": number,',
    '      "unit": "string",',
    '      "toleranceType": "exact" | "plus_minus",',
    '      "toleranceValue": number',
    "    }",
    "  ],",
    '  "confidence": number,',
    '  "unresolvedFields": ["string"]',
    "}",
    "When tolerance isn't explicitly written, use toleranceType=exact and toleranceValue=0.",
    "Do not convert units.",
    "If SKU or name is unclear, still provide best guess and mention uncertainty in unresolvedFields.",
    sku ? `Prefer SKU value: ${sku}.` : "",
    skuName ? `Prefer SKU name value: ${skuName}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_VISION_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instructions },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI parser request failed: ${errorText || response.statusText}`);
  }

  const payload = await response.json();
  const outputText =
    payload.output_text ||
    payload.output?.[0]?.content?.map((part) => part.text).filter(Boolean).join("\n") ||
    "";
  const jsonText = extractFirstJsonObject(outputText);

  if (!jsonText) {
    throw new Error("Parser response did not include valid JSON.");
  }

  const parsed = JSON.parse(jsonText);

  return {
    suggestion: {
      sku: String(parsed?.sku || sku || "").trim().toUpperCase(),
      skuName: String(parsed?.skuName || skuName || "").trim(),
      baseYieldLitres: Math.max(0, Number(parsed?.baseYieldLitres || 0)),
      ingredients: Array.isArray(parsed?.ingredients) ? parsed.ingredients : [],
      confidence: Math.min(1, Math.max(0, Number(parsed?.confidence || 0))),
      unresolvedFields: Array.isArray(parsed?.unresolvedFields)
        ? parsed.unresolvedFields.map((field) => String(field || "").trim()).filter(Boolean)
        : [],
    },
    parserMeta: {
      provider: "openai",
      model: DEFAULT_VISION_MODEL,
      parsedAt: new Date(),
      confidence: Math.min(1, Math.max(0, Number(parsed?.confidence || 0))),
      unresolvedFields: Array.isArray(parsed?.unresolvedFields)
        ? parsed.unresolvedFields.map((field) => String(field || "").trim()).filter(Boolean)
        : [],
      notes: "",
    },
  };
};

export const parseRecipeFromInput = async (input = {}) => {
  if (input.type !== "image") {
    throw new Error(`Unsupported parser input type: ${input.type || "unknown"}`);
  }

  return parseVisionRecipe(input);
};
