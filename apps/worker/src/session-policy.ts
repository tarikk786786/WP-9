/** WhatsApp Web disconnect codes we must never treat as “scan QR again”. */
export const LOGGED_OUT = 401;

export function shouldWipeAuth(statusCode: number | undefined) {
  return statusCode === LOGGED_OUT;
}

export function credsAreLinked(raw: string): boolean {
  try {
    const creds = JSON.parse(raw) as { registered?: boolean; me?: { id?: string } };
    return creds.registered === true || Boolean(creds.me?.id);
  } catch {
    return false;
  }
}

export function phoneFromCreds(raw: string): string | null {
  try {
    const creds = JSON.parse(raw) as { me?: { id?: string } };
    const id = creds.me?.id;
    if (!id) return null;
    return id.split(":")[0] ?? id;
  } catch {
    return null;
  }
}
