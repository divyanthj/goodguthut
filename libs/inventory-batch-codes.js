export const canonicalizeInventoryBatchCode = (value = "") =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);

export const parseInventoryBatchCode = (value = "") => {
  const canonical = canonicalizeInventoryBatchCode(value);
  const match = canonical.match(/^([A-Z0-9]{4})(\d{2})(\d{2})(\d{2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[3]);
  const sequence = Number(match[4]);
  if (month < 1 || month > 12 || sequence < 1 || sequence > 99) {
    return null;
  }

  return {
    canonical,
    prefix: match[1],
    year: Number(match[2]),
    month,
    sequence,
  };
};

export const formatInventoryBatchCode = (value = "") => {
  const canonical = canonicalizeInventoryBatchCode(value);
  const parts = [
    canonical.slice(0, 4),
    canonical.slice(4, 6),
    canonical.slice(6, 8),
    canonical.slice(8, 10),
  ].filter(Boolean);

  return parts.join("-");
};
