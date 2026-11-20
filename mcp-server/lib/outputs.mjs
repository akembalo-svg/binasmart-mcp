// Output schemas (MCP outputSchema) for every BinaSmart tool, built from the fields each tool actually returns
// (checked against live results on 2026-10-18). Every field is optional and nullable and every object allows extra
// fields, so a schema documents the result without ever rejecting one: a tool that adds a field keeps working.
// json() in server.mjs sends the same object as structuredContent, so text and structured results never differ.
import { z } from 'zod';

const S = d => z.string().nullable().optional().describe(d);
const N = d => z.number().nullable().optional().describe(d);
const B = d => z.boolean().nullable().optional().describe(d);
const O = (d, shape = {}) => z.object(shape).passthrough().nullable().optional().describe(d);
const A = (d, shape = {}) => z.array(z.object(shape).passthrough()).nullable().optional().describe(d);
const out = shape => z.object(shape).passthrough();
const NS = d => z.union([z.number(), z.string()]).nullable().optional().describe(d);
const LL = d => O(d, { lat: N('Latitude'), lng: N('Longitude') });

const source_url = S('bina.et page this result comes from; cite it');
const note = S('How to use or present this result');
const count = N('Number of items returned');

const RIDE = {
  ride_id: S('Ride id (needed for get_ride_status and cancel_ride)'), status: S('dispatching, assigned, arriving, arrived, ontrip, completed, cancelled, or test_booking'),
  tier: S('Vehicle tier'), fare_etb: NS('Fixed fare in birr'), payment_method: S('cash: paid to the driver in cash or by telebirr transfer (in-app chapa not live yet)'), payment_status: S('Payment status'),
  pickup: S('Pickup place'), dropoff: S('Drop-off place'), requested_at: S('When the ride was requested (ISO time)'),
  driver: O('Assigned driver, null until one is assigned', { name: S('Driver name'), phone: S('Driver phone'), vehicle: z.any().describe('Vehicle'), plate: S('Plate number'), rating: NS('Driver rating') }),
  tracking_url: S('Live tracking page'), test: B('true for a reviewer test booking (no driver is sent)'), source_url,
};

export const OUTPUTS = {
  quote_ride: out({
    pickup: S('Resolved pickup place'), dropoff: S('Resolved drop-off place'), distance_km: N('Route distance in km'), eta_min: N('Trip time in minutes'),
    estimate: B('true when the route time is an estimate'),
    quotes: A('Fixed fare for each vehicle tier', { tier: S('Tier id to pass to request_ride'), label: S('Tier name'), label_am: S('Tier name in Amharic'), seats: N('Seats'), fare_etb: N('Fixed fare in birr'), eta_min: N('Driver arrival estimate in minutes'), drivers_near: N('Drivers who could come to this pickup now; 0 means request_ride will be refused'), book_url: S('bina.et/ride link for this tier') }),
    drivers_available: B('false when no driver is free near the pickup right now: say so before booking'),
    book_url: S('bina.et/ride link with this route for the user to confirm'), pickup_coords: S('Pickup "lat,lng"'), dropoff_coords: S('Drop-off "lat,lng"'), note, source_url,
  }),
  request_ride: out({ ...RIDE, duplicate: B('true when the same booking was already made'), booked_for: S('Passenger name when booked for someone else'), next_step: S('What to tell the user now'), whatsapp: S('BinaSmart WhatsApp support'), note }),
  get_ride_status: out({ ...RIDE, note }),
  cancel_ride: out({ ...RIDE, note }),
  list_pool_corridors: out({
    direction: S('Commute direction'), peak: B('true during peak hours'),
    corridors: A('BinaPool corridors with live seat prices', { key: S('Corridor id'), name: S('Corridor name'), nameAm: S('Name in Amharic'), from: O('Start point'), to: O('End point'), carFareEtb: N('Whole-car fare in birr'), seats: N('Seats per car'), waiting: N('Riders waiting'), leavesInS: N('Seconds until the next car leaves') }),
    join_url: S('Where to join a pool'), note,
  }),
  find_pool_groups: out({ groups: A('Cars filling up near the given point'), count, start_one_url: S('Start a new pool group'), note }),
  search_places: out({
    count, results: A('Matching places', { kind: S('Place type'), name: S('Name'), name_am: S('Name in Amharic'), city: S('City'), sub_city: S('Sub-city'), is_hotel: B('Use get_hotel_rooms'), is_hospital: B('Use get_hospital_departments'), slug: S('Place slug'), coords: LL('Coordinates; pass as "lat,lng" to quote_ride'), url: S('bina.et page') }),
    note, source_url,
  }),
  list_events: out({ count, events: A('Upcoming events', { show_id: NS('Event id'), title: S('Title'), venue: S('Venue'), starts_at: S('Start time'), price_from_etb: NS('Lowest ticket price in birr'), seats_left: NS('Seats left'), url: S('Ticket page') }), book_hint: S('How tickets are bought'), source_url }),
  list_films: out({ count, films: A('Amharic films', { slug: S('Film slug'), title: S('Title'), title_am: S('Title in Amharic'), year: NS('Year'), free: B('true if free to watch'), url: S('Watch page') }), watch_hint: S('How to watch'), source_url }),
  get_hotel_rooms: out({
    demo: B('true for a demo listing'), demo_notice: S('Shown when the listing is a demo'),
    hotel: O('Hotel', { name: S('Name'), name_am: S('Name in Amharic'), city: S('City'), sub_city: S('Sub-city') }),
    rooms: A('Room types', { name: S('Room type'), price_per_night_etb: NS('Nightly price in birr'), capacity: NS('Guests'), total_rooms: NS('Rooms of this type') }),
    book_url: S('Booking page'), source_url,
  }),
  get_hospital_departments: out({
    demo: B('true for a demo listing'), demo_notice: S('Shown when the listing is a demo'),
    hospital: O('Hospital', { name: S('Name'), name_am: S('Name in Amharic'), city: S('City'), sub_city: S('Sub-city') }), date: S('Date the slots are for (YYYY-MM-DD)'),
    departments: A('Departments', { name: S('Department'), name_am: S('Name in Amharic'), floor: NS('Floor'), room: NS('Room'), hours: S('Opening hours'), slots_left: N('Appointment slots left that day') }),
    book_url: S('Appointment page'), source_url,
  }),
  search_health: out({ count, results: A('Hospitals, clinics, labs and doctors', { name: S('Name'), nameAm: S('Name in Amharic'), kind: S('Type'), area: S('Area'), phone: S('Phone'), hours: S('Hours'), url: S('bina.et/health page') }), note, source_url }),
  get_ethiopia_guide: out({
    guides: A('Guide list (when called without a slug)', { slug: S('Guide slug'), title: S('Title'), summary: S('Summary'), url: S('Guide page') }),
    slug: S('Guide slug'), title: S('Guide title'), summary: S('Summary'), text: S('Full guide text (Amharic and English)'), note, source_url,
  }),
  search_knowledge: out({ query: S('The query searched'), results: A('Best-matching passages', { title: S('Passage title'), source_url: S('Page it comes from'), text: S('Passage'), score: N('Relevance') }), note }),
  // `note` is declared here like every other tool's: when no agency has finished the partner check
  // the API answers with an empty list AND a note saying bina.et still lists the whole Ministry
  // register. passthrough() meant the note already reached clients, but an undeclared field is one
  // a client has no reason to read - and "count: 0" alone reads as "Ethiopia has no agencies".
  list_overseas_agencies: out({ count, updated: S('When the list was last updated'), agencies: A('Licensed agencies with their GCC partner offices'), note, ministry_register: O('The full Ministry of Labour and Skills register on bina.et, when no partner-checked agency is listed yet'), source_url }),
  list_jobs: out({ count, jobs: A('Open vacancies', { slug: S('Job slug for get_job'), title: S('Job title'), employer: S('Employer'), employer_url: S('Employer page'), city: S('City'), field: S('Field'), deadline: S('Application deadline'), days_left: N('Days until the deadline'), closed: B('true if closed'), url: S('Job page') }), note, source_url }),
  get_job: out({ job: O('The vacancy in full, with detail and employer_profile'), note, source_url }),
  list_job_fields: out({ fields: A('Job fields', { field: S('Field'), open_vacancies: N('Open vacancies'), url: S('Page') }), cities: A('Cities', { city: S('City'), open_vacancies: N('Open vacancies') }), source_url }),
  get_employer: out({ employer: O('Employer', { name: S('Name'), sector: S('Sector'), city: S('City'), address: S('Address'), url: S('Employer page') }), vacancies: A('Its vacancies on BinaSmart'), note, source_url }),
  list_tenders: out({ count, tenders: A('Open tender notices', { slug: S('Tender slug for get_tender'), title: S('Title'), category: S('Category'), region: S('Region'), org: S('Issuing organisation'), deadline: S('Bid deadline'), days_left: N('Days until the deadline'), closed: B('true if closed'), original_notice: S('Link to the original notice'), url: S('Tender page') }), note, source_url }),
  get_tender: out({ tender: O('The tender in full, with detail'), note, source_url }),
  list_tender_categories: out({ open_total: N('Open tenders in total'), categories: A('Categories', { category: S('Category'), open: N('Open tenders') }), source_url }),
  list_news: out({ count, articles: A('Amharic news articles', { slug: S('Article slug for get_news_article'), title: S('Title'), title_am: S('Title in Amharic'), category: S('Category'), excerpt: S('Excerpt'), published_at: S('Published'), url: S('Article page') }), source_url }),
  get_news_article: out({ article: O('The article with its full text'), source_url }),
  search_properties: out({ count, results: A('Listings from the companies\' own websites', { title: S('Title'), listing: S('sale or rent'), type: S('Property type'), price: S('Price as the company wrote it'), area: S('Area'), company: S('Listing company'), phone: S('Company phone'), link: S('bina.et listing') }), note, source_url }),
  search_cars: out({ count, results: A('Cars from the dealers\' own websites', { title: S('Title'), make: S('Make'), model: S('Model'), price: S('Price as the dealer wrote it'), fuel: S('Fuel'), condition: S('New or used'), dealer: S('Dealer'), phone: S('Dealer phone'), link: S('bina.et listing') }), note, source_url }),
  search_hotels: out({ count, results: A('Hotels and guest houses', { name: S('Name'), nameAm: S('Name in Amharic'), kind: S('Type'), area: S('Area'), phone: S('Hotel phone'), website: S('Hotel website'), link: S('bina.et page') }), note, source_url }),
};

// MCP 1.4.0 (18 Oct 2026): restaurants, pharmacies, companies, cinema, TV/radio and series (tools/services.mjs).
Object.assign(OUTPUTS, {
  search_restaurants: out({ count, restaurants: A('Matching restaurants and cafés', { name: S('Name'), name_am: S('Name in Amharic'), kind: S('restaurant, cafe or fast_food'), sub_city: S('Sub-city'), phone: S('Phone'), confirmed: B('Confirmed by the restaurant'), coords: LL('Map point; pass as "lat,lng" to quote_ride'), url: S('bina.et page') }), note, source_url }),
  search_pharmacies: out({ count, pharmacies: A('Matching pharmacies', { name: S('Name'), name_am: S('Name in Amharic'), sub_city: S('Sub-city'), phone: S('Phone'), confirmed: B('Confirmed by the pharmacy'), url: S('bina.et page') }),
    medicine_check: O('Whether pharmacies reported the medicine', { medicine: S('Medicine'), prescription_needed: B('Needs a prescription'), reported_by: N('Pharmacies that reported having it in the last 7 days'), note }), note, source_url }),
  search_companies: out({ count, companies: A('Matching companies', { name: S('Name'), name_am: S('Name in Amharic'), kind: S('Kind'), sub_city: S('Sub-city'), website: S('Website'), hiring: B('Has open jobs on BinaSmart'), confirmed: B('Checked by the company'), url: S('bina.et page') }), note, source_url }),
  list_cinema_showtimes: out({ today: S('Date of the programme'), count, cinemas: A('Cinemas with their films and times', { cinema: S('Cinema'), address: S('Address'), phone: S('Phone'), url: S('bina.et page') }),
    cinemas_listed: A('Cinemas with no programme posted right now', { cinema: S('Cinema'), phone: S('Phone'), url: S('bina.et page') }), note, source_url }),
  list_tv_and_radio: out({ count, channels: A('TV channels and radio stations', { name: S('Name'), name_am: S('Name in Amharic'), kind: S('tv or radio'), live_now: B('Live right now'), live_title: S('Live programme'), live_url: S('Live link'), website: S('Own website') }), note, source_url }),
  list_tv_series: out({ count, series: A('Series with their newest episodes', { title: S('Title'), title_am: S('Title in Amharic'), channel: S('Channel'), playlist_url: S('All episodes') }), note, source_url }),
});
