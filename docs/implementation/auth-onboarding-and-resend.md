# Authentication onboarding and Resend delivery

## Implemented behavior

- Staff creation accepts profile fields and role IDs, **not a password**. The
  response additionally contains `temporaryPassword` and
  `temporaryPasswordExpiresAt`, shown once and protected by `Cache-Control: no-store`.
  Generate 24 random bytes, hash with the existing scrypt policy, expire after
  24 hours. Never store the plaintext in client persistence, logs or audit payloads.
- Temporary login consumes the credential and inserts a restricted session in
  one transaction. Two simultaneous logins cannot both succeed. Its cookie/session
  lasts 15 minutes. `Session.purpose` is `password_change` or `full`.
- Restricted sessions can inspect their session, change the password or log out;
  shared permission checks and the public session resolver reject business access.
  Public unauthenticated recovery endpoints remain available independently.
- `POST /v1/auth/change-password` takes `newPassword` (12–256 characters), plus
  `currentPassword` for full sessions. During onboarding the restricted session
  is sufficient. Reusing the current/temporary password is rejected. Revalidation,
  password update, clearing temporary flags, revoking sessions/reset tokens and
  issuing a new full-session cookie happen atomically.
- `POST /v1/staff/:userId/temporary-password` lets authorized staff reissue the
  setup credential if the first response/link is lost or onboarding expires.
  Reissue revokes old sessions/reset tokens. The last fully onboarded active
  administrator cannot be demoted, disabled, archived or forced back into setup.
- Login and password change each allow five attempts/minute/IP. Existing reset
  endpoint limits remain. All six auth endpoints are in the same controller/routes.
- Email reset also clears onboarding flags and revokes all sessions. Email ownership
  can therefore recover a lost/consumed setup credential without public registration.

## Resend production configuration

Set server-side secrets in `api/.env` for local API execution, or inject environment
variables into the API container/host. Never commit populated keys.

```dotenv
RESEND_API_KEY=re_your_server_side_key
EMAIL_FROM=security@your-verified-domain.example
PASSWORD_RESET_URL=https://finance.your-domain.example/reset-password
```

Verify the sender domain in Resend and use a sending-capable key for that domain.
All three variables must be supplied together. They are mandatory for production
startup, so missing email setup is not silently deployed. Reset URLs must be HTTPS
in production with no embedded credentials, query or fragment. Local HTTP is
allowed only on localhost. Docker Compose forwards the same three variables.

The adapter calls Resend's HTTPS send endpoint using a plain-text message and an
opaque hashed idempotency key. Calls have a four-second timeout and one retry for
network/server failures. Permanent rejections, including provider rate limits,
are not blindly retried. A final failure records only
`RESET_EMAIL_DELIVERY_FAILED`, invalidates the issued token and preserves the
generic public response. Provider acceptance is not proof of inbox delivery.

The reset link stores its token in the URL fragment. The frontend must read and
remove the fragment, then POST `{ token, password }` to the confirmation endpoint.
No real emails were sent during implementation; all provider tests use mocked HTTP.
The real sender/key/domain must be verified with an authorized end-to-end smoke test.

Provider references: [send email API](https://resend.com/docs/api-reference/emails/send-email)
and [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Database and remaining scope

The local unapplied baseline now includes onboarding state on `users` and
`sessions.purpose`. Only disposable test databases were used. Do not replay the
baseline on an already-applied database; prepare a forward migration instead.

The initial bootstrap administrator must be created with an established password
and `must_change_password=false`; a public registration endpoint is not provided.
The controlled bootstrap CLI is still separate pending work.

UI onboarding/change/reset pages and removal of the POC auth bypass are not part
of this API change. Persistent audit wiring, durable notification delivery queues,
delivery webhooks/alerts, distributed throttling and enumeration-timing hardening
remain separate tasks. Generated UI contracts reflect the new API shapes.
