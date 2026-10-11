---
name: ethiopia-jobs
description: Use when someone is looking for a job or vacancy in Ethiopia (by field, city, company or job title, in English or Amharic), asks about a specific company's vacancies, wants the full advert or how to apply, or asks about working abroad in the Gulf through a licensed Ethiopian agency.
---

# Job vacancies in Ethiopia with BinaSmart

BinaSmart (bina.et/jobs) lists vacancies from Ethiopian employers and job boards. It does not recruit and never charges a job seeker.

## Find vacancies

1. If the person is unsure what to search for, call `list_job_fields`. It returns the fields hiring now and the cities with the most vacancies.
2. Call `list_jobs` with:
   - `query`: a keyword, job title or company name, in English or Amharic;
   - `field`: one of banking, accounting, engineering, it, health, education, sales, ngo, logistics, admin, hospitality, construction, agriculture, legal, security or media;
   - `city`.
3. In Claude the results appear as job cards with an Apply button. Summarise the best matches in words as well: title, employer, city and days left.
4. A company name plus "vacancy" (for example "Coca-Cola vacancy") is a `query`. Add `get_employer` to show that company's profile and all its vacancies.

## Read and apply

- `get_job` with the vacancy's slug returns the full advert: duties, requirements and `how_to_apply`. Quote the application route exactly as given.
- **Deadlines.** Open vacancies come first. A date-only deadline closes at the end of that day, Addis time. An advert with no deadline counts as closed 90 days after it was published. Pass `include_closed` only when the person asks for closed adverts.
- For CV help, point to BinaSmart's free CV guide: https://bina.et/cv-ethiopia

## Keep job seekers safe

- A genuine Ethiopian employer does not charge an applicant a fee. Say this whenever an advert or a message asks for money.
- Tell the person to confirm the terms with the employer before travelling or paying anything.

## Working abroad (Gulf countries)

- `list_overseas_agencies` lists licensed Ethiopian overseas employment agencies, with their GCC partner offices and whether each is in the Ministry of Labor and Skills register. You can filter by country: UAE, KSA, Qatar, Kuwait, Bahrain or Oman.
- Recruitment abroad goes through the government LMIS system (Proclamation 1389/2025). For the steps, use `get_ethiopia_guide` for the Labor ID / LMIS registration and COC guides.
