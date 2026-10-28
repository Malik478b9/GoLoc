"""
Places worth a trip, for the traveler home screen. Each spot belongs to a live
GoLoc city (so every poster leads to bookable Captains) and carries what the
ranking needs: the months it's at its best, its vibes, and one-off events.

`wiki` is the English Wikipedia title used to fetch a real photo of the place.
`title`/`tagline` are the fallback copy when AI copy isn't ready.
"""

SPOTS = [
    # Hyderabad
    dict(key="charminar", city="hyderabad", name="Charminar", wiki="Charminar",
         vibes=["food", "heritage", "nightlife"], best=[10, 11, 12, 1, 2, 3],
         title="Biryani nights at Charminar", tagline="Old City lanes, pearls and Irani chai after dark"),
    dict(key="golconda", city="hyderabad", name="Golconda Fort", wiki="Golconda Fort",
         vibes=["heritage", "photography"], best=[10, 11, 12, 1, 2],
         title="Echoes of Golconda", tagline="Climb the fort at sunset, stay for the sound and light show"),
    # Jaipur
    dict(key="hawa_mahal", city="jaipur", name="Hawa Mahal", wiki="Hawa Mahal",
         vibes=["royal", "heritage", "shopping"], best=[10, 11, 12, 1, 2, 3],
         title="The Pink City wakes up", tagline="Hawa Mahal at sunrise, block-print bazaars by noon"),
    dict(key="amer_fort", city="jaipur", name="Amer Fort", wiki="Amer Fort",
         vibes=["royal", "heritage", "photography"], best=[10, 11, 12, 1, 2, 3],
         title="Kings of Amer", tagline="Mirror palaces and ramparts above the Aravallis"),
    # Udaipur
    dict(key="city_palace_udaipur", city="udaipur", name="City Palace", wiki="City Palace, Udaipur",
         vibes=["royal", "romance", "heritage"], best=[9, 10, 11, 12, 1, 2, 3],
         title="Lakes, palaces, sunsets", tagline="Udaipur's City Palace glowing over Lake Pichola"),
    dict(key="lake_pichola", city="udaipur", name="Lake Pichola", wiki="Lake Pichola",
         vibes=["romance", "nature"], best=[7, 8, 9, 10, 11, 12, 1, 2],
         events={8: "Monsoon fills the lakes", 9: "Lakes brimming after the rains"},
         title="Boat rides on Lake Pichola", tagline="Golden-hour boats past island palaces"),
    # Jodhpur
    dict(key="mehrangarh", city="jodhpur", name="Mehrangarh", wiki="Mehrangarh",
         vibes=["royal", "heritage", "adventure"], best=[10, 11, 12, 1, 2, 3],
         title="The Blue City from Mehrangarh", tagline="A fort carved from the rock, a city painted blue below"),
    dict(key="jaswant_thada", city="jodhpur", name="Jaswant Thada", wiki="Jaswant Thada",
         vibes=["heritage", "photography"], best=[10, 11, 12, 1, 2],
         title="Marble at dawn", tagline="Jaswant Thada's quiet lake views before the crowds"),
    # Goa
    dict(key="palolem", city="goa", name="Palolem Beach", wiki="Palolem Beach",
         vibes=["beach", "nightlife", "romance"], best=[11, 12, 1, 2, 3],
         events={12: "Christmas and New Year on the coast"},
         title="Slow days on Palolem", tagline="Kayaks at dawn, silent discos at night"),
    dict(key="dudhsagar", city="goa", name="Dudhsagar Falls", wiki="Dudhsagar Falls",
         vibes=["nature", "adventure", "monsoon"], best=[6, 7, 8, 9, 10],
         title="Dudhsagar in full roar", tagline="A monsoon jeep safari to Goa's milk-white falls"),
    # Varanasi
    dict(key="dashashwamedh", city="varanasi", name="Dashashwamedh Ghat", wiki="Dashashwamedh Ghat",
         vibes=["spiritual", "culture", "food"], best=[10, 11, 12, 1, 2, 3],
         events={11: "Dev Deepawali lights up every ghat"},
         title="Ganga Aarti at Dashashwamedh", tagline="Lamps, chants and a boat at dusk on the Ganga"),
    dict(key="sarnath", city="varanasi", name="Sarnath", wiki="Sarnath",
         vibes=["spiritual", "heritage"], best=[10, 11, 12, 1, 2, 3],
         title="Stillness at Sarnath", tagline="Where the Buddha first taught, a short ride from the ghats"),
    # Rishikesh
    dict(key="lakshman_jhula", city="rishikesh", name="Lakshman Jhula", wiki="Lakshman Jhula",
         vibes=["spiritual", "adventure", "nature"], best=[2, 3, 4, 5, 9, 10, 11],
         events={3: "International Yoga Festival"},
         title="Rafting and aarti in Rishikesh", tagline="White water by day, the Ganga Aarti by night"),
    dict(key="triveni_ghat", city="rishikesh", name="Triveni Ghat", wiki="Triveni Ghat",
         vibes=["spiritual", "culture"], best=[2, 3, 4, 9, 10, 11],
         title="Evening at Triveni Ghat", tagline="Floating diyas where the Himalaya meets the plains"),
    # Manali
    dict(key="solang", city="manali", name="Solang Valley", wiki="Solang Valley",
         vibes=["mountains", "adventure", "snow"], best=[12, 1, 2, 3, 5, 6],
         events={1: "Fresh snow for skiing and sledding"},
         title="Snow days in Solang", tagline="Skiing, sledding and paragliding over pine valleys"),
    dict(key="rohtang", city="manali", name="Rohtang Pass", wiki="Rohtang Pass",
         vibes=["mountains", "adventure", "nature"], best=[5, 6, 7, 8, 9, 10],
         title="Over the Rohtang", tagline="Glaciers and high passes, open only in the warm months"),
]

# Vibes → the interests the trip planner understands.
VIBE_INTERESTS = {
    "food": "food", "heritage": "heritage", "royal": "heritage", "culture": "culture", "adventure": "adventure",
    "snow": "adventure", "photography": "photography", "nature": "nature", "beach": "nature", "mountains": "trekking",
    "monsoon": "nature", "spiritual": "spiritual", "nightlife": "nightlife", "shopping": "shopping",
}

# Indian seasons by month.
SEASONS = {12: "winter", 1: "winter", 2: "winter", 3: "summer", 4: "summer", 5: "summer",
           6: "monsoon", 7: "monsoon", 8: "monsoon", 9: "monsoon", 10: "autumn", 11: "autumn"}
SEASON_LABEL = {"winter": "Winter", "summer": "Summer", "monsoon": "Monsoon", "autumn": "Autumn"}
MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"]
