from rest_framework_simplejwt.tokens import RefreshToken

ROLE_CLAIM = "role"


def issue_tokens(user, role: str) -> dict:
    """
    Tokens carry the app the person signed in through (`role` claim). It's
    copied onto every access token minted from this refresh token, including
    after rotation, so a Captain-app session stays a Captain session even if
    the same person also signs in to the Traveler app.
    """
    refresh = RefreshToken.for_user(user)
    refresh[ROLE_CLAIM] = role
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def session_role(request) -> str | None:
    token = getattr(request, "auth", None)
    if token is None:
        return None
    try:
        return token.get(ROLE_CLAIM)
    except AttributeError:
        return None
