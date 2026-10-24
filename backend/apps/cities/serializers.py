from rest_framework import serializers

from .models import City


class CitySerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ["id", "name", "slug", "state", "latitude", "longitude"]
        read_only_fields = fields
