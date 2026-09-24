# Desert Shield client intake

The intake is an additive extension of the existing website. The user approved the three-table production migration and launch on September 24, 2026.

## Routes

- `/client-intake.html` or `/intake`: Client intake, with `#trucking`, `#personal`, or `#business` preselection.
- `/intake-copy.html#<private-token>`: Prospect PDF download; token is removed from the visible URL on load and sent only in the authorization header.
- `/admin-intake.html` or `/admin/intakes`: Agency intake manager, using the existing password-plus-authenticator sign-in and server-validated session.
- `/api/intake`: Configuration, verification, submission, private download and authenticated administration.

## Server configuration

Reuses the existing server-only `DATABASE_URL`, `REFERRAL_ENCRYPTION_KEY`, `RATE_LIMIT_SECRET`, `RESEND_API_KEY`, `REFERRAL_EMAIL_FROM` and `REFERRAL_ORIGIN`. Agency intake notifications go specifically to `chris@desertshieldinsurance.com`. The existing referral authentication retains its existing administrator settings.

`INTAKE_ENABLED=false` is an optional emergency stop. Intake is enabled only when the required configuration is present and the intake table exists. Do not expose environment values in the repository, static build or logs.

## Database and privacy

Migration: `db/002-intake.sql`. Project `little-mountain-67410789`, database `referrals`, production branch `br-billowing-tree-aueftkn9`. It adds separate verification, submission and audit tables; it does not rewrite or delete referral records. `referral_app` has select/insert/update rights but no delete rights on intake tables.

Submitted field values, completed PDF and receipt-email token details are encrypted before storage using the existing agency AES-256-GCM implementation. Verification codes and access tokens are stored as hashes, apart from an encrypted copy of the download token needed for receipt retry. Email verification expires after 10 minutes; an accepted verification ticket is valid for 30 minutes and is bound to one submission request. Prospect download links expire after 7 days and can be revoked by an authenticated administrator.

Private download links are bearer links: anyone possessing a link can download that one completed form until expiry/revocation. Prospect email ownership is verified before the form is accepted; it is not an identity check or proof of ownership of every field supplied.

There are no advertising tags, analytics scripts, external submission endpoints or session replay on intake and private-copy pages. The privacy policy explains intake data use, private links, draft storage, retention questions and the separate SMS-consent boundary.

Link expiry does not delete agency records. There is no automatic record-purge policy in this release. Establish a counsel-reviewed retention schedule and restricted administrative cleanup procedure before large-scale collection. Verification/rate-limit/audit records also require periodic retention maintenance.

## Email behavior

No full underwriting answers or PDF attachments are emailed. The prospect gets a private download link; the agency gets an authenticated-manager link. Each audience has its own provider-acceptance status. Transient provider errors are retried once in the request, with a stable idempotency key; failed/pending receipts can be retried from the intake manager. Already accepted messages are not resent by the retry action.

Provider acceptance is not confirmed inbox delivery. No scheduled retry worker is installed. Review pending/failed statuses in the manager and keep the database/encryption key backed up separately.

## PDF behavior

The browser can save a local editable draft PDF. A submitted form creates a separate server-generated, flattened snapshot with a unique intake reference and full-response appendix. The appendix retains long answers that may not all fit in the fixed-size form fields.

The blank templates and the public schema contain no M&J customer data. Never copy the private populated example, attached quote, verification codes or real submission data into this public repository.

## Testing

`npm test` checks server validation, generated PDFs, verification/replay protection, encrypted storage, duplicate requests, permissions, private-link access, revocation, administrator session expiry, rate limiting and email failure/retry behavior with mock email delivery.

`node tests/intake-browser.cjs` tests the integration against intercepted fictional endpoints: type selection, section navigation, mobile fit, verification, permission gating, receipt state, private copy, admin sign-in/download/revoke/logout and the exclusion of analytics.

Production smoke tests must separately confirm live rendering, API configuration, access denial when signed out, and actual email delivery. Do not send test mail to a customer; obtain approval for an agency-address test.
