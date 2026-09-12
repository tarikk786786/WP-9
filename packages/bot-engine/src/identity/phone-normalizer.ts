export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";

  // Strip all non-digit characters
  let digits = raw.replace(/\D/g, "");

  // Handle leading zeros (e.g. 09114411026 or 07903956968)
  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  // Handle Indian 10-digit mobile numbers (e.g. 7903956968 -> 917903956968)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    digits = "91" + digits;
  }

  return digits;
}

export function formatE164(normalizedDigits: string): string {
  if (!normalizedDigits) return "";
  return "+" + normalizedDigits;
}
