export function isAllowedAdminEmail(
  email: string | null | undefined,
  expectedEmail: string | undefined,
): boolean {
  return Boolean(
    email &&
    expectedEmail &&
    email.trim().toLowerCase() === expectedEmail.trim().toLowerCase(),
  );
}
