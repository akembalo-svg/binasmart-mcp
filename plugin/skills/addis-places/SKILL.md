---
name: addis-places
description: Use when someone in or travelling to Addis Ababa looks for a hotel or guest house, a hospital, clinic, dentist, lab or doctor, a shop, restaurant, pharmacy or bank, a home or apartment to rent or buy, a car for sale, events or concerts, Amharic films to watch online, or BinaSmart news.
---

# Places and listings in Addis Ababa with BinaSmart

Pick the tool by what the person wants. Every result links to its page on bina.et; give that link.

| They want | Tool | Keep in mind |
|---|---|---|
| Hotel, guest house, pension, furnished apartment | `search_hotels` | No prices or room availability: those come from the hotel, whose phone is included |
| Hospital, clinic, dentist, lab, doctor | `search_health` | Filter by kind, sub-city, a place to be near, or a specialty. This is directory information, not medical advice. In an emergency, call 907 |
| Shop, restaurant, café, pharmacy, bank, gym, office building | `search_places` | For food with no listed shop it returns places from the city map, with no phone, hours, prices or menu |
| Home, apartment, land or shop to rent or buy | `search_properties` | Prices are as the listing company wrote them (some per m² or in USD), with the company's own phone |
| Car for sale | `search_cars` | Dealer listings checked weekly, with the dealer's phone and WhatsApp |
| Events, concerts, cinema | `list_events` | Seats are chosen and paid at the returned link |
| Amharic films to watch online | `list_films` | Free titles or 48-hour rentals |
| News | `list_news`, then `get_news_article` | Mostly in Amharic |

## Be exact

- Only state a price, phone number or address that the tool returned.
- If a result is marked `demo: true`, tell the person it is BinaSmart sample data, not a real place. `get_hotel_rooms` and `get_hospital_departments` currently hold sample data only.
- A place's coordinates can be passed straight to `quote_ride` for a fixed-fare ride there (see the addis-ride skill).
