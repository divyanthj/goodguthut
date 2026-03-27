const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

const getWhatsAppApiUrl = () => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is missing from environment variables");
  }

  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
};

const normalizeWhatsAppPhone = (value = "") => String(value).replace(/\D/g, "");

export const isWhatsAppConfigured = () =>
  Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export const sendWhatsAppMessage = async ({ to, text, template }) => {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing from environment variables");
  }

  const normalizedTo = normalizeWhatsAppPhone(to);

  if (!normalizedTo) {
    throw new Error("A valid WhatsApp destination phone number is required");
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedTo,
  };

  if (template?.name) {
    payload.type = "template";
    payload.template = {
      name: template.name,
      language: {
        code: template.languageCode || process.env.WHATSAPP_TEMPLATE_LANGUAGE_CODE || "en",
      },
      ...(Array.isArray(template.components) && template.components.length > 0
        ? { components: template.components }
        : {}),
    };
  } else if (text) {
    payload.type = "text";
    payload.text = {
      preview_url: true,
      body: text,
    };
  } else {
    throw new Error("WhatsApp messages require either text or a template definition");
  }

  const response = await fetch(getWhatsAppApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp request failed (${response.status}): ${body}`);
  }

  return response.json();
};
