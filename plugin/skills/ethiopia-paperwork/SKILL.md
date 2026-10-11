---
name: ethiopia-paperwork
description: Use when someone asks how to get, renew or check an Ethiopian document or account, for example a Fayda national ID, e-Passport, eVisa, TIN, business or trade licence, VAT/TOT registration, driving licence, car import and customs, Yellow Card, bank account, telebirr or CBE Birr, birth or marriage certificate, utility bills, Labor ID / LMIS registration, the COC certificate, a rental agreement or tenant screening.
---

# Ethiopian paperwork, step by step, with BinaSmart

BinaSmart publishes 25 bilingual (Amharic and English) guides to Ethiopian government and banking services. Each guide names the official office or portal and links to it.

## How to answer

1. Call `get_ethiopia_guide` with no `slug` to list the guides. Then call it with the matching slug for the full text.
2. For a narrower question, such as a specific step, a fee or an office, also call `search_knowledge`. It returns passages from the guides and BinaSmart's knowledge base, each with its `source_url`.
3. Answer from the guide: the steps in order, the documents to bring, and the official portal or office.
4. Use official names and links exactly as the guide gives them. If the guide doesn't state a fee or a processing time, say it doesn't, rather than estimating.
5. Link the guide (`source_url`) so the person can read it in full, in Amharic or English.

## Good to say

- Government fees and procedures change. Where money or a deadline is involved, suggest confirming at the official office or portal before paying.
- Several guides have their own page on bina.et. The link in the tool result is the one to give.
