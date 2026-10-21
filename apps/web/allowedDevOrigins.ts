// Next.js dev serves HMR and its other dev resources only to localhost, and a page that cannot reach
// them never hydrates. Allowing the app's own public host keeps a dev server usable behind a tunnel
// or a preview proxy.
export function getAllowedDevOrigins(webappUrl: string | undefined): string[] {
  if (!webappUrl || !URL.canParse(webappUrl)) return [];
  return [new URL(webappUrl).hostname];
}
