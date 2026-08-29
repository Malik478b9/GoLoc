import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "goloc.settings")

django_asgi_app = get_asgi_application()

# Imported after django_asgi_app so app registry is ready before routing modules
# import models.
from apps.chat.routing import websocket_urlpatterns as chat_ws  # noqa: E402
from apps.safety.routing import websocket_urlpatterns as safety_ws  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            URLRouter(chat_ws + safety_ws)
        ),
    }
)
