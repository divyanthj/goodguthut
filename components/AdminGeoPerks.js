"use client";

import { useState } from "react";

const listToText = (value = []) => (Array.isArray(value) ? value.join("\n") : "");

const createEmptyGeoPerkForm = () => ({
  id: "",
  name: "",
  areaLabel: "",
  matchTerms: "",
  excludeTerms: "",
  customerMessage: "",
  status: "active",
  benefits: [{ type: "delivery_fee", mode: "waive" }],
});

const hydrateGeoPerkForm = (geoPerk) => ({
  id: geoPerk.id,
  name: geoPerk.name || "",
  areaLabel: geoPerk.areaLabel || "",
  matchTerms: listToText(geoPerk.matchTerms),
  excludeTerms: listToText(geoPerk.excludeTerms),
  customerMessage: geoPerk.customerMessage || "",
  status: geoPerk.status || "active",
  benefits: geoPerk.benefits?.length
    ? geoPerk.benefits
    : [{ type: "delivery_fee", mode: "waive" }],
});

const formatTerms = (terms = []) => {
  if (!terms.length) {
    return "No terms";
  }

  return terms.join(", ");
};

export default function AdminGeoPerks({ initialGeoPerks }) {
  const [geoPerks, setGeoPerks] = useState(initialGeoPerks || []);
  const [geoPerkForm, setGeoPerkForm] = useState(createEmptyGeoPerkForm());
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearFeedback = () => {
    setMessage("");
    setError("");
  };

  const selectGeoPerk = (geoPerk) => {
    clearFeedback();
    setGeoPerkForm(hydrateGeoPerkForm(geoPerk));
  };

  const refreshData = async (preferredId = "") => {
    const response = await fetch("/api/admin/geo-perks");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load geo perks.");
    }

    const nextGeoPerks = data.geoPerks || [];
    setGeoPerks(nextGeoPerks);

    if (!preferredId) {
      setGeoPerkForm(createEmptyGeoPerkForm());
      return;
    }

    const selectedGeoPerk = nextGeoPerks.find((item) => item.id === preferredId);

    if (selectedGeoPerk) {
      selectGeoPerk(selectedGeoPerk);
    }
  };

  const onSave = async (event) => {
    event.preventDefault();
    clearFeedback();
    setIsSaving(true);

    try {
      const isEditing = Boolean(geoPerkForm.id);
      const response = await fetch(
        isEditing ? `/api/admin/geo-perks/${geoPerkForm.id}` : "/api/admin/geo-perks",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geoPerkForm),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save geo perk.");
      }

      await refreshData(data.geoPerk.id);
      setMessage(isEditing ? "Geo perk updated." : "Geo perk created.");
    } catch (saveError) {
      setError(saveError.message || "Could not save geo perk.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-2xl bg-base-100 p-4 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Perk areas</h2>
              <p className="text-sm opacity-70">Address text matching.</p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                clearFeedback();
                setGeoPerkForm(createEmptyGeoPerkForm());
              }}
            >
              New perk
            </button>
          </div>
        </div>

        {geoPerks.length === 0 ? (
          <div className="rounded-2xl bg-base-100 p-4 shadow-md">
            <p className="font-medium">No geo perks yet.</p>
            <p className="mt-1 text-sm opacity-70">Create one to waive delivery fees by area.</p>
          </div>
        ) : (
          geoPerks.map((geoPerk) => {
            const isSelected = geoPerk.id === geoPerkForm.id;

            return (
              <button
                key={geoPerk.id}
                type="button"
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  isSelected ? "border-primary bg-primary/10" : "border-base-300 bg-base-100 hover:border-primary/40"
                }`}
                onClick={() => selectGeoPerk(geoPerk)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{geoPerk.name}</div>
                    <div className="mt-1 text-sm opacity-70">{geoPerk.areaLabel}</div>
                  </div>
                  <div className="badge badge-outline">{geoPerk.status}</div>
                </div>
                <div className="mt-3 text-xs opacity-70">{formatTerms(geoPerk.matchTerms)}</div>
              </button>
            );
          })
        )}
      </aside>

      <div className="space-y-6">
        <form onSubmit={onSave} className="card bg-base-100 shadow-xl">
          <div className="card-body gap-6">
            <div>
              <h2 className="text-2xl font-semibold">
                {geoPerkForm.id ? "Edit geo perk" : "Create geo perk"}
              </h2>
              <p className="mt-1 text-sm opacity-70">
                This v1 perk waives the delivery fee when any match term appears in the verified address.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control w-full">
                <div className="label"><span className="label-text">Name</span></div>
                <input
                  className="input input-bordered"
                  value={geoPerkForm.name}
                  onChange={(event) =>
                    setGeoPerkForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Diamond District free delivery"
                />
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Area label</span></div>
                <input
                  className="input input-bordered"
                  value={geoPerkForm.areaLabel}
                  onChange={(event) =>
                    setGeoPerkForm((current) => ({ ...current, areaLabel: event.target.value }))
                  }
                  placeholder="Diamond District"
                />
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Status</span></div>
                <select
                  className="select select-bordered"
                  value={geoPerkForm.status}
                  onChange={(event) =>
                    setGeoPerkForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <label className="form-control w-full">
                <div className="label"><span className="label-text">Benefit</span></div>
                <select className="select select-bordered" value="delivery_fee:waive" disabled>
                  <option value="delivery_fee:waive">Waive delivery fee</option>
                </select>
              </label>

              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Match terms</span></div>
                <textarea
                  className="textarea textarea-bordered min-h-32"
                  value={geoPerkForm.matchTerms}
                  onChange={(event) =>
                    setGeoPerkForm((current) => ({ ...current, matchTerms: event.target.value }))
                  }
                  placeholder={"Diamond District\nDiamond District Apartments"}
                />
              </label>

              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Exclude terms</span></div>
                <textarea
                  className="textarea textarea-bordered min-h-24"
                  value={geoPerkForm.excludeTerms}
                  onChange={(event) =>
                    setGeoPerkForm((current) => ({ ...current, excludeTerms: event.target.value }))
                  }
                  placeholder="Optional"
                />
              </label>

              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Customer message</span></div>
                <input
                  className="input input-bordered"
                  value={geoPerkForm.customerMessage}
                  onChange={(event) =>
                    setGeoPerkForm((current) => ({ ...current, customerMessage: event.target.value }))
                  }
                  placeholder="Since you are from Diamond District, we are waiving your delivery fee."
                />
              </label>
            </div>

            <div className="card-actions items-center justify-between">
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save geo perk"}
              </button>
              {geoPerkForm.id && <div className="badge badge-outline">Perk ID: {geoPerkForm.id}</div>}
            </div>
          </div>
        </form>

        {message && <div className="alert alert-success"><span>{message}</span></div>}
        {error && <div className="alert alert-error"><span>{error}</span></div>}
      </div>
    </div>
  );
}
