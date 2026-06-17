export type OAuthProviderId = "naver" | "kakao" | "google";

export type OAuthProviderStatus = {
  id: OAuthProviderId;
  label: string;
  configured: boolean;
};

export const oauthProviderLabels: Record<OAuthProviderId, string> = {
  naver: "네이버",
  kakao: "카카오",
  google: "구글",
};

function isUsableCredential(value: string | undefined) {
  const credential = value?.trim();

  if (!credential) {
    return false;
  }

  const lowered = credential.toLowerCase();

  return !(
    lowered.includes("placeholder") ||
    lowered.startsWith("your-") ||
    lowered.includes("replace-with")
  );
}

function providerConfigured(id: OAuthProviderId) {
  switch (id) {
    case "naver":
      return (
        isUsableCredential(process.env.AUTH_NAVER_ID) &&
        isUsableCredential(process.env.AUTH_NAVER_SECRET)
      );
    case "kakao":
      return (
        isUsableCredential(process.env.AUTH_KAKAO_ID) &&
        isUsableCredential(process.env.AUTH_KAKAO_SECRET)
      );
    case "google":
      return (
        isUsableCredential(process.env.AUTH_GOOGLE_ID) &&
        isUsableCredential(process.env.AUTH_GOOGLE_SECRET)
      );
  }
}

export function getOAuthProviderStatuses(): OAuthProviderStatus[] {
  return (["naver", "kakao", "google"] as const).map((id) => ({
    id,
    label: oauthProviderLabels[id],
    configured: providerConfigured(id),
  }));
}

export function isOAuthProviderConfigured(id: OAuthProviderId) {
  return providerConfigured(id);
}
