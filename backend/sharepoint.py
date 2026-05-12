"""SharePoint REST client for the ONCF optimisation backend.

Repurposed from the original download script with:
- Token caching (reuse token across requests until it expires)
- Cleaner error surfaces so the FastAPI layer can return meaningful HTTP errors
- Support for both ROPC (username/password) and device-code (MSAL) auth flows

Environment variables expected (load_dotenv is called by main.py before this module):
    SP_TENANT       — e.g. "oncf" (produces https://oncf.sharepoint.com)
    SP_SITE         — the site name from the URL, e.g. "ComissionTechniqueAlboraq"
    SP_CLIENT_ID    — the Azure AD app registration's client ID
    SP_USERNAME     — service account email (ROPC only)
    SP_PASSWORD     — service account password (ROPC only)
    SP_FILE_PATH    — server-relative path of the Excel, e.g.
                      "/sites/ComissionTechniqueAlboraq/Documents partages/General/Suivi.xlsx"
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional

import requests


class SharePointError(Exception):
    """Raised for any SharePoint-side failure. The FastAPI layer converts these to HTTP errors."""


@dataclass
class _CachedToken:
    value: str
    expires_at: float  # unix timestamp


class SharePointClient:
    """Downloads files from SharePoint, caching the access token between calls.

    Usage:
        sp = SharePointClient()
        bytes_ = sp.download_file(sp.file_path)
    """

    def __init__(self):
        self.tenant: str = _require_env("SP_TENANT")
        self.site: str = _require_env("SP_SITE")
        self.client_id: str = _require_env("SP_CLIENT_ID")
        self.file_path: str = _require_env("SP_FILE_PATH")
        # ROPC creds are optional at construction time — device-code flow can be used instead,
        # but the default download_file() uses ROPC since that's what the original script used.
        self.username: Optional[str] = os.getenv("SP_USERNAME")
        self.password: Optional[str] = os.getenv("SP_PASSWORD")

        self._token: Optional[_CachedToken] = None
        self._resource = f"https://{self.tenant}.sharepoint.com"

    def _get_token(self) -> str:
        """Fetch an access token using ROPC (username + password).

        Token lifetime is typically 1 hour; we cache until 5 minutes before expiry.
        Falls back to re-authenticating when the cached token is gone or about to expire.
        """
        now = time.time()
        if self._token and self._token.expires_at > now + 300:
            return self._token.value

        if not self.username or not self.password:
            raise SharePointError(
                "SP_USERNAME / SP_PASSWORD not set — either configure them in .env "
                "or switch to device-code flow (not yet wired up)."
            )

        try:
            r = requests.post(
                "https://login.microsoftonline.com/common/oauth2/token",
                data={
                    "grant_type": "password",
                    "client_id": self.client_id,
                    "username": self.username,
                    "password": self.password,
                    "resource": self._resource,
                    "scope": "openid",
                },
                timeout=30,
            )
        except requests.RequestException as e:
            raise SharePointError(f"Network error reaching Microsoft login: {e}") from e

        if r.status_code != 200:
            # Microsoft's error responses are JSON with `error_description` — surface a short version
            try:
                body = r.json()
                desc = body.get("error_description") or body.get("error") or r.text
            except ValueError:
                desc = r.text
            # Trim obnoxiously long error descriptions
            desc = (desc or "")[:400]
            raise SharePointError(f"Auth failed ({r.status_code}): {desc}")

        data = r.json()
        access_token = data.get("access_token")
        if not access_token:
            raise SharePointError(f"No access_token in response: {str(data)[:300]}")

        # expires_in is seconds from now; subtract some slack
        expires_in = int(data.get("expires_in", 3600))
        self._token = _CachedToken(value=access_token, expires_at=now + expires_in)
        return access_token

    def download_file(self, server_relative_path: Optional[str] = None) -> bytes:
        """Download a file from SharePoint and return its raw bytes.

        `server_relative_path` defaults to the one in SP_FILE_PATH.
        """
        path = server_relative_path or self.file_path
        token = self._get_token()
        url = (
            f"https://{self.tenant}.sharepoint.com/sites/{self.site}"
            f"/_api/web/GetFileByServerRelativeUrl('{path}')/$value"
        )

        try:
            r = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60,
            )
        except requests.RequestException as e:
            raise SharePointError(f"Network error downloading file: {e}") from e

        if r.status_code == 401:
            # Token might be bad even though we thought it was valid — invalidate cache and hint at retry
            self._token = None
            raise SharePointError("SharePoint returned 401 — token may be invalid or expired.")
        if r.status_code == 404:
            raise SharePointError(
                f"File not found at path: {path}. "
                "Check SP_FILE_PATH — it should start with '/sites/...'."
            )
        if r.status_code != 200:
            raise SharePointError(f"Download failed ({r.status_code}): {r.text[:400]}")

        if not r.content:
            raise SharePointError("SharePoint returned an empty file.")

        return r.content


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SharePointError(
            f"Missing required environment variable: {name}. "
            "Copy .env.example to .env and fill it in."
        )
    return value
