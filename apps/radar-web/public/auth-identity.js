const ADMIN_USERNAME = "SUPERADMIN";
const ADMIN_AUTH_EMAIL = "superadmin@radardarede.invalid";

export const resolveLoginIdentifier = (value) => {
  const identifier = String(value ?? "").trim();
  return identifier.toUpperCase() === ADMIN_USERNAME ? ADMIN_AUTH_EMAIL : identifier;
};

export const isEmailIdentifier = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
