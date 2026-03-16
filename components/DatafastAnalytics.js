"use client";

import { useEffect } from "react";
import { initDataFast } from "datafast";

let datafastPromise = null;

const getDatafast = () => {
  if (!datafastPromise) {
    datafastPromise = initDataFast({
      websiteId: "dfid_KIGFNgTpzPD83HPXzOI7Q",
      autoCapturePageviews: true,
    });
  }

  return datafastPromise;
};

export default function DatafastAnalytics() {
  useEffect(() => {
    getDatafast().catch((error) => {
      console.error("Failed to initialize DataFast", error);
    });
  }, []);

  return null;
}
