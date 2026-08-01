export function normalizeNepalMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^9779[678][0-9]{8}$/.test(digits)) return digits.slice(3);
  if (/^9[678][0-9]{8}$/.test(digits)) return digits;
  return null;
}

export function canonicalNepalMobile(value: string) {
  const local = normalizeNepalMobile(value);
  return local ? `+977${local}` : null;
}

export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `***${digits.slice(-4)}`;
}
