# Acquisition tracking QA inventory

## Functional requirements

- **Trucking landing:** name, email, phone, eligible state and positive truck count required; optional SMS checkbox starts unchecked; topic fixed to trucking.
- **Business landing:** name, email, phone, Arizona and business/trade required; topic fixed to business.
- **Successful form:** mocked Web3Forms acceptance, one generate_lead event with opaque inquiry ID, campaign fields in the request, then thank-you confirmation with one eligible GA4 page view.
- **Failures:** mocked service rejection retains the form, shows an actionable error, and emits no lead; invalid truck count prevents submission.
- **Attribution:** first-party session cookie survives internal navigation; source, campaign, keyword and click identifiers travel with the submitted contact request.
- **Secure intake:** no third-party pixels added; allowlisted attribution travels with the verified submission and is encrypted with its private record; unit tests cover rejection of arbitrary fields.
- **Direct confirmation visits:** no lead conversion page view; reload after success does not manufacture another lead.
- **Contact links:** phone/email click events remain secondary engagement signals, not proof of a qualified lead.

## Visual requirements

- **Desktop and mobile:** trucking and business pages at 1280px and 375px; readable labels, no horizontal overflow, intact logo and portrait, a visible route to the form.
- **Themes:** light/dark toggle round trip, readable text and form controls.
- **Privacy:** optional SMS consent, privacy/terms links, no coverage-binding promise, accurate hours, no walk-in claim.
- **Exploratory checks:** submission failure/retry and zero-truck input; no real test emails or ad conversions sent.

## Operational limitations

Website form acceptance means the provider accepted the inquiry, not that an email reached an inbox. Confirm delivery during the live launch check using a separately approved test. A long secure intake is recorded privately and can be attributed internally; it is not automatically uploaded as an Ads conversion. Qualified, quoted and bound outcomes require agency updates and an approved offline-conversion integration.
