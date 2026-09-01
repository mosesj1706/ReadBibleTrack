/**
 * The pages that are readable without an account.
 *
 * The gate replaces the whole app with a sign-in screen, which is right for
 * everything that is about a person and wrong for the things that exist to be
 * read by someone who has not signed in and may never do so. A privacy policy
 * behind a sign-in is not a privacy policy: the reviewer cannot check it, a
 * search engine cannot index it, and someone deciding whether to trust the app
 * has to trust it first in order to find out.
 *
 * Pure and apart from the gate so it can be tested without mounting a
 * navigator or an auth provider, and so adding a page to it is a one-line
 * change with a test beside it rather than an edit inside a conditional.
 */

const PUBLIC = ['/privacy', '/support'];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
