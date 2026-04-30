"use client";

import { useState } from "react";

export default function AdminRoutePlannerRefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refreshRoutes = async () => {
    setIsRefreshing(true);
    setError("");

    try {
      const response = await fetch("/api/admin/route-planner/refresh", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not refresh routes.");
      }

      window.location.reload();
    } catch (refreshError) {
      setError(refreshError.message || "Could not refresh routes.");
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className="btn btn-outline"
        disabled={isRefreshing}
        onClick={refreshRoutes}
      >
        {isRefreshing ? "Refreshing..." : "Refresh routes"}
      </button>
      {error && <p className="text-right text-sm text-error">{error}</p>}
    </div>
  );
}
