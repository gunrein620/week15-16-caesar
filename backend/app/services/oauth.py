from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings

OAUTH_PROVIDERS = {"google", "kakao"}


def oauth_redirect_uri(provider: str) -> str:
    settings = get_settings()
    base_url = (settings.oauth_redirect_base_url or settings.frontend_origin).rstrip("/")
    return f"{base_url}/auth/oauth/{provider}/callback"


def oauth_authorize_url(provider: str, state: str) -> str:
    settings = get_settings()
    redirect_uri = oauth_redirect_uri(provider)
    if provider == "google":
        if not settings.google_client_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google OAuth is not configured")
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
            {
                "client_id": settings.google_client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "prompt": "select_account",
            }
        )
    if provider == "kakao":
        if not settings.kakao_client_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Kakao OAuth is not configured")
        return "https://kauth.kakao.com/oauth/authorize?" + urlencode(
            {
                "client_id": settings.kakao_client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "state": state,
            }
        )
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unsupported OAuth provider")


def exchange_oauth_code(provider: str, code: str, redirect_uri: str) -> dict:
    settings = get_settings()
    if provider == "google":
        token = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        ).json()
        access_token = token.get("access_token")
        profile = httpx.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        ).json()
        return {
            "provider_subject": profile["sub"],
            "email": profile["email"],
            "email_verified": bool(profile.get("email_verified")),
            "display_name": profile.get("name") or profile["email"].split("@")[0],
        }
    if provider == "kakao":
        token = httpx.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "client_id": settings.kakao_client_id,
                "client_secret": settings.kakao_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        ).json()
        access_token = token.get("access_token")
        profile = httpx.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        ).json()
        account = profile.get("kakao_account", {})
        email = account.get("email")
        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kakao email is required")
        return {
            "provider_subject": str(profile["id"]),
            "email": email,
            "email_verified": bool(account.get("is_email_verified")),
            "display_name": profile.get("properties", {}).get("nickname") or email.split("@")[0],
        }
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unsupported OAuth provider")
