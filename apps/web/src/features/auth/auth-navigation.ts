export type AuthNavigationRouter = {
  replace(href: string): void;
  refresh?(): void;
};

export const POST_AUTH_REDIRECT_PATH = "/profile/food";

export function navigateAfterAuth(router: AuthNavigationRouter): void {
  router.replace(POST_AUTH_REDIRECT_PATH);
  router.refresh?.();
}
