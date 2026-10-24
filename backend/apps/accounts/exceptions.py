"""
One error shape for every API error, so every frontend can show it the same way:

    {"detail": "Human readable message", "code": "machine_code",
     "fields": {"phone_number": ["..."]},      # validation errors only
     "retry_after": 27}                        # rate limits only
"""
import logging

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("goloc.api")


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        # Unhandled -> Django returns a 500; log it with the view name.
        logger.exception("Unhandled error in %s", context.get("view").__class__.__name__ if context.get("view") else "?")
        return None

    body = {"detail": "", "code": getattr(exc, "default_code", "error")}

    if isinstance(exc, exceptions.ValidationError):
        data = response.data
        body["code"] = "validation_error"
        if isinstance(data, dict):
            fields = {k: v for k, v in data.items() if k != "non_field_errors"}
            if fields:
                body["fields"] = fields
            first = next(iter(data.values()), None)
            body["detail"] = str(first[0]) if isinstance(first, list) and first else str(first or "Invalid input.")
        elif isinstance(data, list) and data:
            body["detail"] = str(data[0])
    else:
        detail = getattr(exc, "detail", None)
        if isinstance(detail, dict):
            body["detail"] = str(detail.get("detail", "")) or str(exc)
            if "code" in detail:
                body["code"] = str(detail["code"])
        else:
            body["detail"] = str(detail) if detail is not None else str(exc)
            codes = exc.get_codes() if hasattr(exc, "get_codes") else None
            if isinstance(codes, str):
                body["code"] = codes

    if isinstance(exc, exceptions.Throttled):
        body["code"] = "throttled"
        body["retry_after"] = int(exc.wait or 0)

    response.data = body
    return response


class APIError(exceptions.APIException):
    """Raise from views for a specific status + code + message."""

    def __init__(self, detail: str, code: str, status_code: int = status.HTTP_400_BAD_REQUEST,
                 retry_after: int | None = None):
        self.status_code = status_code
        self.retry_after = retry_after
        super().__init__(detail=detail, code=code)


def error_response(detail: str, code: str, status_code: int, retry_after: int | None = None) -> Response:
    data = {"detail": detail, "code": code}
    headers = {}
    if retry_after is not None:
        data["retry_after"] = retry_after
        headers["Retry-After"] = str(retry_after)
    return Response(data, status=status_code, headers=headers)
