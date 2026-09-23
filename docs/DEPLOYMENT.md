# Desert Shield Referral Launch Guide

## Current delivery

The new partner-referral interface and production backend source are implemented as an additive extension to the existing static website. The interactive preview uses fictional seed records and in-memory state only. It sends no emails, creates no policies, purchases no gift cards, and does not persist data across reloads.

No live website files have been deployed and no changes have been pushed to GitHub. On September 23, 2026, a separate console-managed Neon account was connected and the `desert-shield-referrals` project was created successfully. All six referral tables are installed in its `referrals` database on the `production` branch. Production intake remains disabled; the database connection and other required server settings have not yet been added to Vercel.

Neon project: [desert-shield-referrals](https://console.neon.tech/app/projects/little-mountain-67410789).

Project ID: `little-mountain-67410789`. Production branch ID: `br-billowing-tree-aueftkn9`. Database: `referrals`. This is separate from the ward scheduler project, which was not modified.

## What the broker sees

- Your name → your company → your email → your phone.
- Insured name → DOT number → insured phone → insured email.
- A clear choice: send the basic referral, or add a complete packet.
- Optional coverage date, authorization, every vehicle VIN, then each driver's name, license number, license state and DOB.
- A basic/partial submission exit during the optional path.
- Final review and permission before submission.
- Confirmation plus a private, read-only tracking link. No partner account required.

The preview demonstrates a proposed $25 gift card for a complete, verified submission needing coverage from today through the next 30 days, regardless of whether a policy binds. Production reward messaging is separately gated with `REFERRAL_REWARDS_APPROVED=false`.

The interface does not promise instant gift-card delivery. Approval is recorded after verification; fulfillment occurs through the agency's chosen gift-card provider outside this version. A “Mark gift card sent” control records completed fulfillment; it does not send or purchase a card.

## What the administrator sees

Bookmark `/admin/referrals`. This route is not added to the site's public navigation or sitemap; every admin API operation still requires authentication.

- Password plus authenticator-code login.
- Latest 200 referrals, with search and status filters.
- One selected pipeline stage: Received, Contacted, Info needed, Quoted, Bound; Closed is a separate action.
- Immediate status saves, a separately saved broker-visible next step, and update conflict detection.
- Carrier and partner contacts.
- Sensitive packet details loaded only on explicit expansion and removed from the page when collapsed.
- Gift-card review, manual fulfillment marking, email confirmation retry, and tracking-link revocation.

Info needed is optional. The current stage is highlighted; earlier stages are not automatically asserted to have happened. The activity history records actual status/note changes.

## Recommended production deployment

### Connect the new Neon database to Vercel

The initial Neon connection exposed only the Vercel-managed ward scheduler organization and rejected direct project creation. The user then connected a new, separate console-managed Neon account. Database provisioning and schema installation are now complete in that account.

The verified existing Vercel project is `desert-shield-website`, ID `prj_g7bkY3cbCRK8j65NbaKUOa5sBDwR`, with owning account ID `team_7mJkhMTXeBGntyQvjMGo86Zr`. Connect the new Neon database through an appropriate Vercel integration or a server-only `DATABASE_URL`. Do not create a replacement website or move the domain.

The certificate-signature failure was resolved by selecting the correct existing proxy CA, without disabling TLS verification. Vercel now lists the website and returns its project metadata, but requests scoped to the owning team return “Project not found,” and environment-variable access reports that the project was deleted, transferred, or is inaccessible. This inconsistency persisted after the user completed forced Vercel reauthorization. Deployment and environment writes have been stopped pending restored project access; the authenticated Vercel dashboard is an alternative only if the user authorizes browser access.

Create a staging branch separate from production before live integration testing. `db/001-referrals.sql` has already been applied to the new production branch; it creates referral records, status events, audit records, expiring sessions, rate limits, and used-authenticator-code records. Do not rerun provisioning or create duplicate projects to resolve the Vercel access issue.

### Configure the server only

Set these as encrypted Vercel environment variables, never client-side variables or repository files:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Restricted runtime database connection, with TLS. |
| `REFERRAL_ENCRYPTION_KEY` | Random 32-byte key encoded in Base64 for private data. Back it up securely, separate from the database. |
| `ADMIN_PASSWORD_HASH` | A unique admin password stored as `salt:scryptHex`; scrypt output is 64 bytes. |
| `ADMIN_TOTP_SECRET` | A securely enrolled Base32 authenticator secret. |
| `RATE_LIMIT_SECRET` | Independent random secret used to hash rate-limit identities. |
| `RESEND_API_KEY` | Transactional email service key, entered securely. |
| `REFERRAL_EMAIL_FROM` | Verified sender on the agency domain. |
| `REFERRAL_NOTIFY_EMAIL` | Optional agency notification recipient, such as Chris's agency email. |
| `REFERRAL_ORIGIN` | Exact canonical origin, e.g. `https://desertshieldinsurance.com`. |
| `REFERRALS_ENABLED` | Leave `false` until staging checks pass. |
| `REFERRAL_REWARDS_APPROVED` | Leave `false` until offer terms and regulatory review are approved. |

For staging, use a separate database branch, origin, admin secrets and encryption key. Do not connect a demo deployment to the production database.

No Resend connection has been configured in this task. Choose and authorize the sender, verify the sending domain, and approve the test recipient before sending test mail. If a different transactional provider is preferred, replace the small `sendConfirmation` adapter without changing the referral flow.

### Deploy the additive website changes

Use the existing Desert Shield project, not a replacement website project. The new files are `partner-referrals.html`, `referral-status.html`, `admin-referrals.html`, `assets/css/referrals.css`, `assets/js/referrals.js`, the API handler, domain helpers, and the new package manifest.

Keep the site's existing flat-root layout. Deploy with a Node.js 22 runtime; retain existing headers and add the provided rewrite and referral-only security headers in `vercel.json`. Verify framework/build/output settings so the static site and `/api/referral` function are both served.

The `.vercelignore` excludes the preview adapter, scripts, tests, SQL source, docs and environment files from deployment. Server files must be bundled as a function, not exposed as static source.

First deploy to a restricted staging preview. After verification and owner approval, deploy the same revision to production with the referral feature enabled. Add the partner-referral navigation link or broker-office QR code only after the live end-to-end checks succeed.

### Staging test results (September 23, 2026)

Protected preview `preview/partner-referrals` on Vercel, staging Neon branch `referral-staging`, Resend domain `desertshieldinsurance.com` verified (DKIM + two CNAMEs added at GoDaddy; no receiving MX). All eleven Preview variables are set; `REFERRALS_ENABLED=true` on Preview only for testing. Production database still has zero rows.

Passed: basic and complete fictional submissions saved; permission checkbox required; invalid, duplicate VIN rejected; tracking page shows counts only (no VIN, license, DOB); altered token returns 404; three confirmation emails delivered to the agency inbox with no sensitive data; logged-out list/packet return 401; admin login with password + authenticator; same authenticator code replay rejected; wrong password rejected; status update reflected on broker API; encrypted packet decrypts correctly for admin; resend confirmation; tracking-link revoke returns 404 afterward; sign out ends session; session cookie not readable by page scripts.

Not yet tested: session expiry (8 h), concurrent admin edits, email-provider failure path, rate limits, mobile/dark-mode/keyboard pass, production CSP, analytics exclusion. Reward path untested because `REFERRAL_REWARDS_APPROVED=false` pending counsel.

### Complete launch checks

- Submit a basic and a complete fictional referral.
- Confirm both records persist in Neon.
- Confirm the correct broker email receives its own link.
- Confirm an invalid or altered token cannot expose any other record.
- Confirm a logged-out user cannot list or update referrals, reveal packets, resend email, or revoke a link.
- Confirm admin login, TOTP replay rejection, logout and session expiry.
- Click each status and verify the broker view updates within the 30-second refresh window.
- Confirm invalid VINs, duplicate VINs, missing authorization and incomplete packets are rejected.
- Test partial submission, outside-30-day dates, duplicate HTTP retries and concurrent admin edits.
- Simulate email failure, confirm the referral still saves and its link is shown, then retry from admin.
- Confirm actual inbox delivery; provider acceptance alone is not proof of delivery.
- Confirm mobile layout, dark mode, keyboard controls and production CSP.
- Confirm all referral routes bypass tracking scripts, analytics form capture and session-replay tools.
- Set retention and deletion policy for driver data, backup retention, key recovery, and access review.
- For paid incentives, verify duplicate/account exclusions, per-account limits, eligible states, program terms and any employer-permission requirements before activating the offer.

## Security and privacy design

Sensitive submission data is encrypted with AES-256-GCM before storage. The public tracking API uses a strict field allowlist and never returns contact details, driver licenses, DOBs, VINs, premiums or internal notes.

Tracking URLs use 256-bit random tokens in the URL fragment. The API receives the token in an authorization header, not a logged path/query parameter. Database lookups use a SHA-256 token hash; an encrypted copy is retained only to support confirmation-email retries. Access expires after 90 days and may be revoked sooner. These are bearer links, not identity verification: anyone receiving a forwarded link can see the limited referral status.

Admin sessions are server-validated, expire after eight hours, and use Secure, HttpOnly, SameSite=Strict cookies. Writes require the configured origin. Passwords are verified with scrypt; TOTP reuse is rejected. Submission, login, public status and email-retry actions have database-backed rate limits. Referral API responses are no-store and noindex.

Encryption and an unlisted URL do not themselves establish regulatory compliance. Review collection authorization, privacy disclosures, record retention, vendor agreements and the proposed incentive program with qualified insurance/compliance counsel before collecting real driver information.

## Confirmation-email payload

Recipient: the submitting partner's email. Optional BCC: the agency notification address.

Subject: Your Desert Shield referral was received

The email confirms receipt, names the referred company, includes the private tracking URL, explains that the link expires after 90 days, excludes driver information, identifies a pending reward only when eligible, and provides the agency contact details. It explicitly says a referral is not a quote or binder.

No automatic status-change emails or SMS are included in this version. The broker page refreshes every 30 seconds; admin can resend the receipt on request.

## Build and test

Eleven automated tests passed on September 23, 2026. These include a real-handler integration test against an isolated in-process PostgreSQL engine, with the email provider stubbed so no messages are sent. Covered behaviors include authentication and TOTP replay rejection, SQL persistence, token isolation, status/history updates, complete-packet validation, gift-card approval states, email-failure recovery, idempotent submission, conflict detection, expiration, revocation, logout and login rate limiting.

Browser checks covered the basic, complete and partial paths; multiple vehicles and drivers; validation and duplicate VIN rejection; Back navigation; permission decline; outside-window dates; admin filtering/search; status and note changes; close/reopen; manual gift-card states; sensitive-data reveal/hide; revocation; and mobile/dark-mode layouts. No horizontal overflow was observed at 375px, and no browser runtime errors were observed in those checks. This does not replace testing on the actual Vercel deployment with Neon and a verified email sender.

```sh
npm install
npm test
npm run preview:build
```

The preview output is in `preview/`. It is intentionally disconnected from the production API. Browser testing should use fictional records only.

## Rollback

Set `REFERRALS_ENABLED=false` to stop new online referrals without changing the existing marketing site. Revert to the previous Vercel deployment if the integration has broader problems; preserve the Neon database rather than deleting referral data. Rotate admin credentials/session records or revoke individual tracking links when appropriate.
