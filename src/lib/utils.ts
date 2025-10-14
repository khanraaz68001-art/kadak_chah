import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type SessionUser = {
  id: string;
  role: string;
  email?: string | null;
};

export const getStoredUser = (): SessionUser | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch (err) {
    console.warn("Failed to parse stored user", err);
    return null;
  }
};

export const setStoredUser = (user: SessionUser) => {
  if (typeof window === "undefined") return;
  const normalized: SessionUser = {
    ...user,
    role: typeof user.role === "string" ? user.role.toLowerCase() : user.role,
  };
  window.localStorage.setItem("user", JSON.stringify(normalized));
};

export const clearStoredUser = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("user");
};

const PARTNER_CONTACT_KEY = "partner-contact-number";
const DEFAULT_COUNTRY_CODE = "91";

export const getPartnerContactNumber = (): string | null => {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(PARTNER_CONTACT_KEY);
  return value && value.trim().length > 0 ? value : null;
};

export const setPartnerContactNumber = (value: string) => {
  if (typeof window === "undefined") return;
  if (!value || value.trim().length === 0) {
    window.localStorage.removeItem(PARTNER_CONTACT_KEY);
    return;
  }
  window.localStorage.setItem(PARTNER_CONTACT_KEY, value.trim());
};

export const normalizePhoneNumber = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  let digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 0) return null;

  // Remove leading zeros (common when users copy numbers with 0 prefix)
  digits = digits.replace(/^0+/, "");

  if (digits.length === 10) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return digits;
};

export const formatPhoneWithCountryCode = (value?: string | null): string | null => {
  const normalized = normalizePhoneNumber(value ?? undefined);
  if (!normalized) return null;
  return `+${normalized}`;
};

export const formatPhoneForDisplay = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return null;
  if (normalized.startsWith(DEFAULT_COUNTRY_CODE) && normalized.length === DEFAULT_COUNTRY_CODE.length + 10) {
    return normalized.slice(DEFAULT_COUNTRY_CODE.length);
  }
  return normalized;
};

export const formatReadableDate = (value?: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
