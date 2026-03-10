const normalizeEmail = (email = "") => email.trim().toLowerCase();

export const getAdminEmails = () => {
  const rawAdmins = process.env.ADMINS || "[]";

  try {
    const parsed = JSON.parse(rawAdmins);

    if (Array.isArray(parsed)) {
      return parsed.map(normalizeEmail).filter(Boolean);
    }
  } catch (_error) {
    return rawAdmins
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean);
  }

  return [];
};

export const isAdminEmail = (email = "") => {
  return getAdminEmails().includes(normalizeEmail(email));
};
