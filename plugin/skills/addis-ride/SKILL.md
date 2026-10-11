---
name: addis-ride
description: Use when someone wants a ride, taxi, bajaj or moto inside Addis Ababa, asks what a trip between two places in Addis costs, wants to book a ride for themselves or for a relative in Addis while they are abroad, asks about the status of a BinaSmart ride or wants to cancel one, or asks about BinaPool shared commuting.
---

# Rides in Addis Ababa with BinaSmart

BinaSmart Ride gives one fixed fare per vehicle tier before the trip: no surge. Riders pay the driver in cash or by telebirr/Chapa. It covers Addis Ababa only; for a trip outside the city, say so instead of quoting.

## Quote first

1. Call `quote_ride` with the pickup and drop-off as place names ("Edna Mall", "Bole Airport", "Piassa") or as `lat,lng`.
2. If the tool says a name is ambiguous, show the candidates it returns and ask which one the person means. Never pick one yourself.
3. Show every tier the tool returns (moto, bajaj, economy, comfort, XL) with its fare in ETB, plus the distance and ETA. Use the fares exactly as returned; never estimate one.

## Booking: two ways

**Book through the tool** (`request_ride`) only after the person has confirmed all five details in the conversation:

- pickup and drop-off (use the `pickup_coords` / `dropoff_coords` from the quote)
- the tier and its fare
- the rider's name
- the rider's Ethiopian mobile number: 09XXXXXXXX or +2519XXXXXXXX

Booking for someone in Addis while the booker is abroad: pass `passenger_name` and `passenger_phone` (the passenger's Ethiopian number). The booker's own number may then be foreign.

Never guess or fill in a phone number. If any detail is missing, ask for it.

**Or give the booking link.** Every quote includes `book_url` (and one per tier). It opens bina.et/ride with the route and fixed fare already filled in, and the person confirms there with their own phone. Use it when they would rather book themselves or don't want to share a phone number in chat.

## After booking

- Read back the ride id, the fare and the tracking link. A BinaSmart dispatcher calls the rider's phone to confirm the driver.
- `get_ride_status` and `cancel_ride` need the ride id and the same phone used to book.
- Cancel only when the person asks. A cancellation can't be undone, and a ride that has started can't be cancelled.

## BinaPool (shared commute)

- `list_pool_corridors`: the corridors open now, their stops, the seat price for 1 to 4 riders, and cars filling. Inbound runs until 13:00 Addis time, outbound after.
- `find_pool_groups` with a `lat`/`lng`: cars filling within about 2.5 km, with seats left, the seat price and a `share_url` to join.
- Quote seat prices exactly as returned; they change with the number of riders.
