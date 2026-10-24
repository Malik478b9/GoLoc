"""
Keep the traveler's Captain list fresh. Discovery responses are cached per
query; any change that could alter a card (go live/offline, approval, hold,
services, vehicles, reviews) bumps a version number that is part of every
cache key, so the next request after a change is always computed fresh.
"""
from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.reviews.models import Review

from .models import CaptainProfile, ServiceOffer, Vehicle

VERSION_KEY = "disc:ver"


def discovery_version() -> int:
    return cache.get_or_set(VERSION_KEY, 1, None)


def bump_discovery(*args, **kwargs):
    try:
        cache.incr(VERSION_KEY)
    except ValueError:  # key missing (cache cleared/restarted)
        cache.set(VERSION_KEY, 2, None)


for model in (CaptainProfile, ServiceOffer, Vehicle, Review):
    receiver(post_save, sender=model, dispatch_uid=f"disc-save-{model.__name__}")(bump_discovery)
    receiver(post_delete, sender=model, dispatch_uid=f"disc-del-{model.__name__}")(bump_discovery)
