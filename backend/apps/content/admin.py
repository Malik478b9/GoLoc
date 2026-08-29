from django.contrib import admin

from .models import Post, Reel


@admin.register(Reel)
class ReelAdmin(admin.ModelAdmin):
    # Admin > Marketplace > Content moderation (Section 2.3)
    list_display = ["captain", "status", "views_count", "likes_count", "created_at"]
    list_filter = ["status"]


admin.site.register(Post)
