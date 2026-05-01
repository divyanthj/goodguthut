"use client";

import { useMemo, useState } from "react";
import {
  findIndianGstState,
  INDIAN_GST_STATE_OPTIONS,
} from "@/libs/indian-gst-states";

const createSettings = (settings = {}) => ({
  sellerLegalName: settings.sellerLegalName || "The Living Element LLP",
  sellerAddress: settings.sellerAddress || "",
  sellerAddressLine2: settings.sellerAddressLine2 || "",
  sellerPlaceId: settings.sellerPlaceId || "",
  sellerState: settings.sellerState || "",
  sellerStateCode: settings.sellerStateCode || "",
  sellerGstin: settings.sellerGstin || "",
  invoiceLabel: settings.invoiceLabel || "Invoice",
  deliveryHsnSac: settings.deliveryHsnSac || "",
  deliveryGstRate: Number(settings.deliveryGstRate || 0),
  computerGeneratedText:
    settings.computerGeneratedText || "This is a computer-generated invoice.",
});

export default function AdminInvoiceSettings({ initialSettings = {}, incompleteSkuCount = 0 }) {
  const [settings, setSettings] = useState(() => createSettings(initialSettings));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const missingFields = useMemo(
    () =>
      [
        !settings.sellerAddress ? "seller address" : "",
        !settings.sellerState ? "seller state" : "",
        !settings.sellerStateCode ? "seller state code" : "",
        !settings.sellerGstin ? "GSTIN" : "",
        !settings.deliveryHsnSac ? "delivery HSN/SAC" : "",
      ].filter(Boolean),
    [settings]
  );
  const hasSetupWarnings = missingFields.length > 0 || incompleteSkuCount > 0;

  const setField = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const selectedStateCode =
    findIndianGstState({
      state: settings.sellerState,
      code: settings.sellerStateCode,
    })?.code || "";

  const handleStateChange = (code) => {
    const option = findIndianGstState({ code });

    setSettings((current) => ({
      ...current,
      sellerState: option?.state || "",
      sellerStateCode: option?.code || "",
    }));
  };

  const onSave = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/invoices/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save invoice settings.");
      }

      setSettings(createSettings(data.settings || {}));
      setMessage("Invoice settings saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save invoice settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <details
      className="rounded-2xl bg-base-100 p-5 shadow-md"
      open={hasSetupWarnings}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Invoice settings</h2>
          <p className="text-sm opacity-70">
            These details are snapshotted onto new invoices when they are generated.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasSetupWarnings && (
            <div className="badge badge-warning">
              {missingFields.length + incompleteSkuCount} setup warning(s)
            </div>
          )}
          <div className={`badge ${settings.sellerGstin ? "badge-success" : "badge-warning"}`}>
            {settings.sellerGstin ? "GSTIN configured" : "GSTIN not configured"}
          </div>
        </div>
      </summary>

      {missingFields.length > 0 && (
        <div className="alert alert-warning mt-4">
          <span>Incomplete invoice setup: add {missingFields.join(", ")}.</span>
        </div>
      )}

      {incompleteSkuCount > 0 && (
        <div className="alert alert-warning mt-4">
          <span>
            {incompleteSkuCount} product(s) are missing HSN codes or GST rates in the product catalog.
          </span>
        </div>
      )}

      <form className="mt-5 space-y-4" onSubmit={onSave}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="form-control">
            <div className="label">
              <span className="label-text">Seller legal name</span>
            </div>
            <input
              className="input input-bordered"
              value={settings.sellerLegalName}
              onChange={(event) => setField("sellerLegalName", event.target.value)}
            />
          </label>
          <label className="form-control">
            <div className="label">
              <span className="label-text">GSTIN</span>
            </div>
            <input
              className="input input-bordered uppercase"
              maxLength={15}
              value={settings.sellerGstin}
              onChange={(event) => setField("sellerGstin", event.target.value.toUpperCase())}
            />
          </label>
          <label className="form-control md:col-span-2">
            <div className="label">
              <span className="label-text">Flat / Door No.</span>
            </div>
            <input
              className="input input-bordered"
              value={settings.sellerAddressLine2}
              onChange={(event) => setField("sellerAddressLine2", event.target.value)}
            />
          </label>
          <label className="form-control md:col-span-2">
            <div className="label">
              <span className="label-text">Seller address</span>
            </div>
            <textarea
              className="textarea textarea-bordered"
              rows={3}
              value={settings.sellerAddress}
              onChange={(event) => setField("sellerAddress", event.target.value)}
              placeholder="Registered address of the LLP"
            />
            <div className="label">
              <span className="label-text-alt">
                Use the registered address exactly as it should appear on invoices.
              </span>
            </div>
          </label>
          <label className="form-control">
            <div className="label">
              <span className="label-text">Seller state</span>
            </div>
            <select
              className="select select-bordered"
              value={selectedStateCode}
              onChange={(event) => handleStateChange(event.target.value)}
            >
              <option value="">Choose state</option>
              {INDIAN_GST_STATE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.state}
                </option>
              ))}
            </select>
            <div className="label">
              <span className="label-text-alt">
                State code: {settings.sellerStateCode || "-"}
              </span>
            </div>
          </label>
          <label className="form-control">
            <div className="label">
              <span className="label-text">Document label</span>
            </div>
            <input
              className="input input-bordered"
              value={settings.invoiceLabel}
              onChange={(event) => setField("invoiceLabel", event.target.value)}
            />
          </label>
          <label className="form-control">
            <div className="label">
              <span className="label-text">Delivery HSN/SAC</span>
            </div>
            <input
              className="input input-bordered"
              value={settings.deliveryHsnSac}
              onChange={(event) => setField("deliveryHsnSac", event.target.value)}
            />
          </label>
          <label className="form-control">
            <div className="label">
              <span className="label-text">Delivery GST rate (%)</span>
            </div>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="input input-bordered"
              value={settings.deliveryGstRate}
              onChange={(event) => setField("deliveryGstRate", Number(event.target.value || 0))}
            />
          </label>
          <label className="form-control md:col-span-2">
            <div className="label">
              <span className="label-text">Footer text</span>
            </div>
            <input
              className="input input-bordered"
              value={settings.computerGeneratedText}
              onChange={(event) => setField("computerGeneratedText", event.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save invoice settings"}
        </button>

        {message && (
          <div className="alert alert-success">
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
      </form>
    </details>
  );
}
