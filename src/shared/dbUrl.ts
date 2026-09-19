/**
 * Showing a connection string back without showing the password.
 *
 * A saved database row that says only "Set" is a row you cannot check. Host,
 * port, database name and — the one people actually get wrong — whether you
 * used the read-only user are all right there in the string, and none of them
 * is a secret. The password is, so it is the only part that is masked.
 *
 * Pure, so what reaches the screen is testable without a keychain or a socket.
 */

/** `postgresql://vms_ro:hunter2@localhost:5432/visits`
 *  → `postgresql://vms_ro:•••@localhost:5432/visits` */
export function maskDbUrl(url: string): string {
  if (typeof url !== 'string' || !url) return '';
  // Match the credentials segment of an authority: scheme://user:pass@host
  // Everything after the first `@` is host and path and stays as it is, and a
  // URL with no password is returned untouched rather than gaining a mask that
  // implies one exists.
  return url.replace(/^([a-zA-Z][\w+.-]*:\/\/[^:/?#@]*):([^@/?#]*)@/, (_m, head: string, pass: string) =>
    pass ? `${head}:•••@` : `${head}@`);
}
