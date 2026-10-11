---
name: ethiopia-tenders
description: Use when someone looks for open tenders, bids or procurement notices in Ethiopia (government bodies, banks, NGOs, World Bank-financed projects), wants the full notice, the bid bond or the submission deadline, or asks how to take part in public procurement.
---

# Open tenders in Ethiopia with BinaSmart

BinaSmart (bina.et/tenders) lists public tender and procurement notices with their deadlines and a link to the original notice.

## Find and read

1. `list_tender_categories` shows which categories are open now and how many tenders each has.
2. `list_tenders`:
   - filter with `query` (English or Amharic) and `category` (such as Supply, Construction, Consultancy, Services or Transport);
   - for "new", "latest" or "this week" questions, set `newest` and check each tender's `published_at`;
   - open tenders only, unless `include_closed` is set.
3. `get_tender` with the slug returns the full notice: requirements, bid bond, where and when to submit, and the link to the original notice.

## Be exact

- State each deadline and the days left exactly as returned.
- The original notice is the authority. Always give its link, and suggest checking it before preparing a bid.
- For how to register on the government e-procurement system and how to prepare a bid, BinaSmart has two guides:
  - https://bina.et/egp-registration-ethiopia
  - https://bina.et/how-to-bid-tenders-ethiopia
