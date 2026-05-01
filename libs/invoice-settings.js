import InvoiceSettings from "@/models/InvoiceSettings";

export const DEFAULT_INVOICE_SETTINGS = {
  sellerLegalName: "The Living Element LLP",
  sellerAddress: "",
  sellerAddressLine2: "",
  sellerPlaceId: "",
  sellerState: "",
  sellerStateCode: "",
  sellerGstin: "",
  invoiceLabel: "Invoice",
  deliveryHsnSac: "",
  deliveryGstRate: 0,
  computerGeneratedText: "This is a computer-generated invoice.",
};

export const normalizeGstRate = (value = 0) => {
  const rate = Number(value || 0);

  if (!Number.isFinite(rate)) {
    return 0;
  }

  return Math.max(0, Math.min(100, rate));
};

export const normalizeStateCode = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\D/g, "")
    .slice(0, 2);

export const normalizeGstin = (value = "") =>
  String(value || "").trim().toUpperCase().slice(0, 15);

export const normalizeInvoiceSettingsPayload = (body = {}) => ({
  sellerLegalName:
    String(body.sellerLegalName || "").trim() ||
    DEFAULT_INVOICE_SETTINGS.sellerLegalName,
  sellerAddress: String(body.sellerAddress || "").trim(),
  sellerAddressLine2: String(body.sellerAddressLine2 || "").trim(),
  sellerPlaceId: String(body.sellerPlaceId || "").trim(),
  sellerState: String(body.sellerState || "").trim(),
  sellerStateCode: normalizeStateCode(body.sellerStateCode),
  sellerGstin: normalizeGstin(body.sellerGstin),
  invoiceLabel:
    String(body.invoiceLabel || "").trim() ||
    DEFAULT_INVOICE_SETTINGS.invoiceLabel,
  deliveryHsnSac: String(body.deliveryHsnSac || "").trim(),
  deliveryGstRate: normalizeGstRate(body.deliveryGstRate),
  computerGeneratedText:
    String(body.computerGeneratedText || "").trim() ||
    DEFAULT_INVOICE_SETTINGS.computerGeneratedText,
});

export const getInvoiceSettings = async () => {
  let settings = await InvoiceSettings.findOne({}).sort({
    updatedAt: -1,
    createdAt: -1,
  });

  if (!settings) {
    settings = await InvoiceSettings.create(DEFAULT_INVOICE_SETTINGS);
  }

  return settings;
};
