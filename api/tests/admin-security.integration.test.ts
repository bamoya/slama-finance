import { randomBytes } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { attachTestDatabase, isolatedDatabase, testOwnerId } from './helpers/postgres.js'
import { createSoftAuthenticator } from './helpers/webauthn-authenticator.js'

const origin = 'http://localhost:5173'
const rp = { origin: 'http://admin.localhost:5173', rpId: 'admin.localhost' }
const headers = { origin }
const email = 'ops@example.test'
const password = 'admin-password-2026'
const DAY = 86_400_000
const handleOf = (id: string) => Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url')

describe('administrator passkeys, recovery and reauthentication', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let adminId: string
  let key: Buffer

  beforeEach(async () => {
    fixture = await isolatedDatabase({ owner: 'trial' })
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: origin,
        CORS_ORIGIN: origin,
        ADMIN_TOTP_KEY: randomBytes(32).toString('base64'),
      }),
      logger: false,
    })
    attachTestDatabase(app, fixture)
    await createAdminAccounts(() => fixture.db).create({ email, name: 'Ops', password })
    adminId = (await fixture.client`select id from platform_admins`)[0]!.id
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  const cookieOf = (response: { cookies: { name: string; value: string }[] }) =>
    response.cookies.find((c) => c.name === 'slama_admin_session')?.value
  const post = (url: string, payload: object = {}, cookie?: string) =>
    app.inject({
      method: 'POST',
      url,
      headers,
      cookies: cookie ? { slama_admin_session: cookie } : {},
      payload,
    })
  const get = (url: string, cookie: string) =>
    app.inject({ method: 'GET', url, cookies: { slama_admin_session: cookie } })
  async function freshTotp() {
    await fixture.client`update platform_admins set totp_last_step=null`
    return totp(key, Date.now())
  }
  /** Password + TOTP sign-in (enrolls on first use). */
  async function signIn() {
    const pending = await post('/api/v1/admin/auth/login', { email, password })
    expect(pending.statusCode).toBe(200)
    if (pending.json().enrollment) key = base32Decode(pending.json().enrollment.secret)
    const done = await post(
      '/api/v1/admin/auth/2fa',
      { code: await freshTotp() },
      cookieOf(pending),
    )
    expect(done.statusCode, done.body).toBe(200)
    return cookieOf(done)!
  }
  async function reauth(cookie: string) {
    const response = await post(
      '/api/v1/admin/auth/reauthentication',
      { method: 'password_totp', password, code: await freshTotp() },
      cookie,
    )
    expect(response.statusCode, response.body).toBe(200)
  }
  async function addPasskey(cookie: string, name = 'Laptop') {
    const authenticator = createSoftAuthenticator()
    const options = await post('/api/v1/admin/security/passkeys/options', {}, cookie)
    expect(options.statusCode, options.body).toBe(200)
    expect(options.json().optionsJSON.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    })
    const created = await post(
      '/api/v1/admin/security/passkeys',
      {
        challengeId: options.json().challengeId,
        name,
        credential: authenticator.register({
          challenge: options.json().optionsJSON.challenge,
          ...rp,
        }),
      },
      cookie,
    )
    expect(created.statusCode, created.body).toBe(201)
    return { authenticator, passkey: created.json() }
  }
  async function loginOptions() {
    const options = await post('/api/v1/admin/auth/passkey/options')
    expect(options.statusCode).toBe(200)
    expect(options.json().optionsJSON).toMatchObject({
      userVerification: 'required',
      rpId: rp.rpId,
    })
    return options.json() as { challengeId: string; optionsJSON: { challenge: string } }
  }
  const passkeyLogin = (challengeId: string, credential: object) =>
    post('/api/v1/admin/auth/passkey', { challengeId, credential })

  it('requires a fresh reauthentication of the full session for credential changes', async () => {
    const cookie = await signIn()
    // A pending password session cannot reach security routes.
    const pending = await post('/api/v1/admin/auth/login', { email, password })
    expect((await get('/api/v1/admin/security', cookieOf(pending)!)).statusCode).toBe(401)

    for (const url of [
      '/api/v1/admin/security/passkeys/options',
      '/api/v1/admin/security/recovery-codes',
      '/api/v1/admin/security/totp',
    ]) {
      const refused = await post(url, {}, cookie)
      expect(refused.statusCode).toBe(403)
      expect(refused.json().code).toBe('REAUTHENTICATION_REQUIRED')
    }
    const wrong = await post(
      '/api/v1/admin/auth/reauthentication',
      { method: 'password_totp', password: 'wrong-password', code: await freshTotp() },
      cookie,
    )
    expect(wrong.statusCode).toBe(401)
    expect(wrong.json().code).toBe('REAUTHENTICATION_FAILED')
    // The password alone (missing TOTP) is not a proof.
    expect(
      (
        await post(
          '/api/v1/admin/auth/reauthentication',
          { method: 'password_totp', password },
          cookie,
        )
      ).statusCode,
    ).toBe(401)

    await reauth(cookie)
    const security = await get('/api/v1/admin/security', cookie)
    expect(security.json()).toMatchObject({
      totpEnrolled: true,
      passkeys: [],
      recoveryCodesRemaining: 0,
    })
    expect(Date.parse(security.json().reauthenticatedUntil)).toBeGreaterThan(Date.now())
    expect((await post('/api/v1/admin/security/recovery-codes', {}, cookie)).statusCode).toBe(200)

    // Five minutes later the window has closed.
    await fixture.client`update platform_admin_sessions set reauthenticated_at=now()-interval '5 minutes 1 second'`
    expect((await post('/api/v1/admin/security/recovery-codes', {}, cookie)).statusCode).toBe(403)
    expect((await get('/api/v1/admin/security', cookie)).json().reauthenticatedUntil).toBeNull()

    // Another session of the same administrator is not reauthenticated by this one.
    await reauth(cookie)
    const other = await signIn()
    expect((await post('/api/v1/admin/security/recovery-codes', {}, other)).statusCode).toBe(403)

    // Disabled administrators fail closed even inside the window.
    await fixture.client`update platform_admins set disabled_at=now()`
    expect((await post('/api/v1/admin/security/recovery-codes', {}, cookie)).statusCode).toBe(401)
  })

  it('bounds failed reauthentication and keeps the idle and absolute session limits', async () => {
    const cookie = await signIn()
    for (let i = 0; i < 5; i++)
      expect(
        (
          await post(
            '/api/v1/admin/auth/reauthentication',
            { method: 'password_totp', password: 'nope', code: '000000' },
            cookie,
          )
        ).statusCode,
      ).toBe(401)
    expect((await get('/api/v1/admin/auth/me', cookie)).statusCode).toBe(401)
    expect(
      await fixture.client`select 1 from platform_admin_audit where action='auth.reauthenticate_failed'`,
    ).toHaveLength(5)

    const idle = await signIn()
    await reauth(idle)
    await fixture.client`update platform_admin_sessions set last_seen_at=now()-interval '31 minutes' where revoked_at is null`
    expect((await get('/api/v1/admin/security', idle)).statusCode).toBe(401)

    const absolute = await signIn()
    await fixture.client`update platform_admin_sessions set expires_at=now()+interval '2 minutes' where revoked_at is null`
    await reauth(absolute)
    const until = Date.parse(
      (await get('/api/v1/admin/security', absolute)).json().reauthenticatedUntil,
    )
    // The reauthentication window never outlives the 8-hour absolute session.
    expect(until).toBeLessThanOrEqual(Date.now() + 2 * 60_000 + 1000)
    const me = await get('/api/v1/admin/auth/me', absolute)
    expect(me.json().idleTimeoutSeconds).toBe(1800)
  })

  it('signs in with a verified passkey without TOTP and rejects every invalid assertion', async () => {
    const cookie = await signIn()
    await reauth(cookie)
    const { authenticator, passkey } = await addPasskey(cookie)
    expect(passkey).toMatchObject({ name: 'Laptop', lastUsedAt: null })
    const stored = await fixture.client`select public_key, counter from platform_admin_passkeys`
    expect(stored[0]!.counter).toBe('0')

    const ok = await loginOptions()
    const signedIn = await passkeyLogin(
      ok.challengeId,
      authenticator.assert({
        challenge: ok.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
      }),
    )
    expect(signedIn.statusCode, signedIn.body).toBe(200)
    expect(signedIn.json().admin.email).toBe(email)
    const session = cookieOf(signedIn)!
    expect((await get('/api/v1/admin/overview', session)).statusCode).toBe(200)
    expect(
      await fixture.client`select 1 from platform_admin_audit where action='auth.passkey_login'`,
    ).toHaveLength(1)

    // Replaying the same challenge, even with a fresh signature, fails.
    const replay = await passkeyLogin(
      ok.challengeId,
      authenticator.assert({
        challenge: ok.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
      }),
    )
    expect(replay.statusCode).toBe(401)
    expect(replay.json().code).toBe('INVALID_CREDENTIALS')

    const cases: [string, (c: string) => object][] = [
      [
        'no user verification',
        (c) =>
          authenticator.assert({
            challenge: c,
            ...rp,
            userHandle: handleOf(adminId),
            flags: { uv: false },
          }),
      ],
      [
        'wrong origin',
        (c) =>
          authenticator.assert({
            challenge: c,
            ...rp,
            origin: 'https://evil.example',
            userHandle: handleOf(adminId),
          }),
      ],
      [
        'wrong RP ID',
        (c) =>
          authenticator.assert({
            challenge: c,
            ...rp,
            rpId: 'localhost',
            userHandle: handleOf(adminId),
          }),
      ],
      [
        'wrong user handle',
        (c) => authenticator.assert({ challenge: c, ...rp, userHandle: handleOf(testOwnerId) }),
      ],
      [
        'stale counter',
        (c) =>
          authenticator.assert({
            challenge: c,
            ...rp,
            userHandle: handleOf(adminId),
            counter: 1,
          }),
      ],
      [
        'unknown credential',
        (c) =>
          createSoftAuthenticator().assert({ challenge: c, ...rp, userHandle: handleOf(adminId) }),
      ],
      [
        'wrong challenge',
        () =>
          authenticator.assert({
            challenge: 'bm90LXRoZS1jaGFsbGVuZ2U',
            ...rp,
            userHandle: handleOf(adminId),
          }),
      ],
    ]
    for (const [label, build] of cases) {
      const options = await loginOptions()
      const failed = await passkeyLogin(options.challengeId, build(options.optionsJSON.challenge))
      expect(failed.statusCode, label).toBe(401)
      // The challenge is spent even though verification failed.
      expect(
        (
          await passkeyLogin(
            options.challengeId,
            authenticator.assert({
              challenge: options.optionsJSON.challenge,
              ...rp,
              userHandle: handleOf(adminId),
            }),
          )
        ).statusCode,
        label,
      ).toBe(401)
    }

    // Expired challenge.
    const expired = await loginOptions()
    await fixture.client`update platform_admin_webauthn_challenges set expires_at=now()-interval '1 minute' where id=${expired.challengeId}`
    expect(
      (
        await passkeyLogin(
          expired.challengeId,
          authenticator.assert({
            challenge: expired.optionsJSON.challenge,
            ...rp,
            userHandle: handleOf(adminId),
          }),
        )
      ).statusCode,
    ).toBe(401)

    // Concurrent use of one challenge: at most one session.
    const race = await loginOptions()
    const assertion = authenticator.assert({
      challenge: race.optionsJSON.challenge,
      ...rp,
      userHandle: handleOf(adminId),
    })
    const raced = await Promise.all([1, 2].map(() => passkeyLogin(race.challengeId, assertion)))
    expect(raced.map((r) => r.statusCode).sort()).toEqual([200, 401])

    // Disabled administrators cannot sign in with a valid passkey.
    await fixture.client`update platform_admins set disabled_at=now()`
    const disabled = await loginOptions()
    expect(
      (
        await passkeyLogin(
          disabled.challengeId,
          authenticator.assert({
            challenge: disabled.optionsJSON.challenge,
            ...rp,
            userHandle: handleOf(adminId),
          }),
        )
      ).statusCode,
    ).toBe(401)
  })

  it('keeps retained passkeys usable after an operator TOTP reset', async () => {
    const cookie = await signIn()
    await reauth(cookie)
    const { authenticator } = await addPasskey(cookie)
    await createAdminAccounts(() => fixture.db).reset2fa(email)
    expect(
      (await fixture.client`select totp_enrolled_at from platform_admins`)[0]!.totp_enrolled_at,
    ).toBeNull()

    const noUv = await loginOptions()
    const rejected = await passkeyLogin(
      noUv.challengeId,
      authenticator.assert({
        challenge: noUv.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
        flags: { uv: false },
      }),
    )
    expect(rejected.statusCode).toBe(401)
    expect(rejected.json().code).toBe('INVALID_CREDENTIALS')

    const ok = await loginOptions()
    const signedIn = await passkeyLogin(
      ok.challengeId,
      authenticator.assert({
        challenge: ok.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
      }),
    )
    expect(signedIn.statusCode, signedIn.body).toBe(200)
    expect((await get('/api/v1/admin/overview', cookieOf(signedIn)!)).statusCode).toBe(200)

    await fixture.client`update platform_admins set disabled_at=now()`
    const disabled = await loginOptions()
    const refused = await passkeyLogin(
      disabled.challengeId,
      authenticator.assert({
        challenge: disabled.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
      }),
    )
    expect(refused.statusCode).toBe(401)
  })

  it('prunes expired challenges in bounded batches without touching live ones', async () => {
    const cookie = await signIn()
    await reauth(cookie)
    const { authenticator } = await addPasskey(cookie)
    const live = await loginOptions()
    const [session] = await fixture.client`select id from platform_admin_sessions limit 1`
    await fixture.client`insert into platform_admin_webauthn_challenges(purpose,challenge,expires_at,consumed_at)
      select 'login', 'old-' || g, now()-interval '1 hour'-g*interval '1 second',
             case when g % 2 = 0 then now()-interval '2 hours' end
      from generate_series(1,120) g`
    await fixture.client`insert into platform_admin_webauthn_challenges(purpose,admin_id,session_id,challenge,expires_at)
      values ('reauth',${adminId},${session!.id},'old-reauth',now()-interval '1 hour'),
             ('login',null,null,'recent',now()-interval '10 seconds')`
    const count = async (where: 'old' | 'recent') =>
      Number(
        (
          await fixture.client`select count(*)::int as n from platform_admin_webauthn_challenges where challenge ${where === 'old' ? fixture.client`like 'old-%'` : fixture.client`= 'recent'`}`
        )[0]!.n,
      )

    // One request deletes at most one batch, oldest first.
    await loginOptions()
    expect(await count('old')).toBe(121 - 50)
    // Concurrent requests skip each other's locked rows and never wait or fail.
    const parallel = await Promise.all(
      [1, 2, 3].map(() => post('/api/v1/admin/auth/passkey/options')),
    )
    expect(parallel.map((r) => r.statusCode)).toEqual([200, 200, 200])
    expect(await count('old')).toBe(0)
    // Recently expired (within the margin) and live challenges are kept.
    expect(await count('recent')).toBe(1)
    const signedIn = await passkeyLogin(
      live.challengeId,
      authenticator.assert({
        challenge: live.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
      }),
    )
    expect(signedIn.statusCode, signedIn.body).toBe(200)
    // Still single-use and expiring.
    const replay = await passkeyLogin(
      live.challengeId,
      authenticator.assert({
        challenge: live.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
      }),
    )
    expect(replay.statusCode).toBe(401)
    const expiring = await loginOptions()
    await fixture.client`update platform_admin_webauthn_challenges set expires_at=now()-interval '1 second' where id=${expiring.challengeId}`
    const late = await passkeyLogin(
      expiring.challengeId,
      authenticator.assert({
        challenge: expiring.optionsJSON.challenge,
        ...rp,
        userHandle: handleOf(adminId),
      }),
    )
    expect(late.statusCode).toBe(401)
  })

  it('reauthenticates with a UV passkey bound to the session and manages named passkeys', async () => {
    const cookie = await signIn()
    await reauth(cookie)
    const { authenticator, passkey } = await addPasskey(cookie, 'Phone')
    await addPasskey(cookie, 'Key')
    expect(
      (await get('/api/v1/admin/security', cookie))
        .json()
        .passkeys.map((p: { name: string }) => p.name),
    ).toEqual(['Phone', 'Key'])
    await fixture.client`update platform_admin_sessions set reauthenticated_at=null`

    const options = await post('/api/v1/admin/auth/reauthentication/options', {}, cookie)
    expect(options.json().optionsJSON.allowCredentials).toHaveLength(2)
    const challenge = options.json().optionsJSON.challenge
    // Another session cannot use this session's challenge.
    const other = await signIn()
    expect(
      (
        await post(
          '/api/v1/admin/auth/reauthentication',
          {
            method: 'passkey',
            challengeId: options.json().challengeId,
            credential: authenticator.assert({ challenge, ...rp, userHandle: handleOf(adminId) }),
          },
          other,
        )
      ).statusCode,
    ).toBe(401)
    // ...and the attempt consumed it.
    const fresh = await post('/api/v1/admin/auth/reauthentication/options', {}, cookie)
    const noUv = await post(
      '/api/v1/admin/auth/reauthentication',
      {
        method: 'passkey',
        challengeId: fresh.json().challengeId,
        credential: authenticator.assert({
          challenge: fresh.json().optionsJSON.challenge,
          ...rp,
          userHandle: handleOf(adminId),
          flags: { uv: false },
        }),
      },
      cookie,
    )
    expect(noUv.statusCode).toBe(401)
    const good = await post('/api/v1/admin/auth/reauthentication/options', {}, cookie)
    const verified = await post(
      '/api/v1/admin/auth/reauthentication',
      {
        method: 'passkey',
        challengeId: good.json().challengeId,
        credential: authenticator.assert({
          challenge: good.json().optionsJSON.challenge,
          ...rp,
          userHandle: handleOf(adminId),
        }),
      },
      cookie,
    )
    expect(verified.statusCode, verified.body).toBe(200)

    // Removal is own-passkey only, audited, and signs out other sessions.
    const missing = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/security/passkeys/${testOwnerId}`,
      headers,
      cookies: { slama_admin_session: cookie },
    })
    expect(missing.statusCode).toBe(404)
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/security/passkeys/${passkey.id}`,
      headers,
      cookies: { slama_admin_session: cookie },
    })
    expect(removed.statusCode).toBe(204)
    expect((await get('/api/v1/admin/auth/me', other)).statusCode).toBe(401)
    expect((await get('/api/v1/admin/security', cookie)).json().passkeys).toHaveLength(1)
    // A registration response replayed against a new challenge is rejected.
    const again = await post('/api/v1/admin/security/passkeys/options', {}, cookie)
    const bad = await post(
      '/api/v1/admin/security/passkeys',
      {
        challengeId: again.json().challengeId,
        name: 'Clone',
        credential: createSoftAuthenticator().register({ challenge: 'b3RoZXI', ...rp }),
      },
      cookie,
    )
    expect(bad.statusCode).toBe(400)
    expect(bad.json().code).toBe('PASSKEY_INVALID')
    const actions =
      await fixture.client`select action from platform_admin_audit where action like 'admin.passkey_%' order by created_at`
    expect(actions.map((a) => a.action)).toEqual([
      'admin.passkey_add',
      'admin.passkey_add',
      'admin.passkey_remove',
    ])
  })

  it('signs in with single-use hashed recovery codes and rotates sessions', async () => {
    const cookie = await signIn()
    await reauth(cookie)
    const first = (await post('/api/v1/admin/security/recovery-codes', {}, cookie)).json()
      .codes as string[]
    expect(first).toHaveLength(10)
    expect(new Set(first).size).toBe(10)
    expect(first[0]).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/)
    const stored = JSON.stringify(await fixture.client`select * from platform_admin_recovery_codes`)
    for (const code of first) {
      expect(stored).not.toContain(code)
      expect(stored).not.toContain(code.replace(/-/g, ''))
    }
    const auditText = JSON.stringify(await fixture.client`select * from platform_admin_audit`)
    expect(auditText).not.toContain(first[0]!)

    // Regeneration invalidates every earlier code.
    const codes = (await post('/api/v1/admin/security/recovery-codes', {}, cookie)).json()
      .codes as string[]
    const pendingOld = await post('/api/v1/admin/auth/login', { email, password })
    expect(
      (await post('/api/v1/admin/auth/recovery', { recoveryCode: first[0] }, cookieOf(pendingOld)))
        .statusCode,
    ).toBe(401)

    const other = await signIn()
    const pending = await post('/api/v1/admin/auth/login', { email, password })
    // Lowercase and without dashes is accepted.
    const recovered = await post(
      '/api/v1/admin/auth/recovery',
      { recoveryCode: codes[0]!.toLowerCase().replace(/-/g, '') },
      cookieOf(pending),
    )
    expect(recovered.statusCode, recovered.body).toBe(200)
    const session = cookieOf(recovered)!
    expect(session).not.toBe(cookieOf(pending))
    // Every other session (including the pending one) is revoked.
    expect((await get('/api/v1/admin/auth/me', other)).statusCode).toBe(401)
    expect((await get('/api/v1/admin/auth/me', cookie)).statusCode).toBe(401)
    // The recovered session may replace the lost factor without the lost TOTP.
    const reset = await post('/api/v1/admin/security/totp', {}, session)
    expect(reset.statusCode).toBe(200)
    expect((await get('/api/v1/admin/security', session)).json().recoveryCodesRemaining).toBe(9)

    // Used code fails, and failures count toward the pending session limit.
    const pending2 = await post('/api/v1/admin/auth/login', { email, password })
    expect(
      (await post('/api/v1/admin/auth/recovery', { recoveryCode: codes[0] }, cookieOf(pending2)))
        .statusCode,
    ).toBe(401)
    for (let i = 0; i < 4; i++)
      await post(
        '/api/v1/admin/auth/recovery',
        { recoveryCode: 'AAAA-AAAA-AAAA-AAAA' },
        cookieOf(pending2),
      )
    expect(
      (await post('/api/v1/admin/auth/recovery', { recoveryCode: codes[1] }, cookieOf(pending2)))
        .statusCode,
    ).toBe(401)
  })

  it('consumes a recovery code once under concurrency and fails closed for disabled admins', async () => {
    const session = await signIn()
    await reauth(session)
    const codes = (await post('/api/v1/admin/security/recovery-codes', {}, session)).json()
      .codes as string[]
    // Concurrent use of one code from two pending sessions: exactly one succeeds.
    const [a, b] = await Promise.all(
      [1, 2].map(() => post('/api/v1/admin/auth/login', { email, password })),
    )
    const raced = await Promise.all(
      [a!, b!].map((p) =>
        post('/api/v1/admin/auth/recovery', { recoveryCode: codes[2] }, cookieOf(p)),
      ),
    )
    expect(raced.map((r) => r.statusCode).sort()).toEqual([200, 401])

    // A full session cannot use the recovery endpoint, and disabled admins cannot recover.
    expect(
      (await post('/api/v1/admin/auth/recovery', { recoveryCode: codes[3] }, session)).statusCode,
    ).toBe(401)
    const pending3 = await post('/api/v1/admin/auth/login', { email, password })
    await fixture.client`update platform_admins set disabled_at=now()`
    expect(
      (await post('/api/v1/admin/auth/recovery', { recoveryCode: codes[3] }, cookieOf(pending3)))
        .statusCode,
    ).toBe(401)
  })

  it('keeps the current TOTP until the replacement is confirmed', async () => {
    const cookie = await signIn()
    const other = await signIn()
    await reauth(cookie)
    const enrollment = (await post('/api/v1/admin/security/totp', {}, cookie)).json()
    const next = base32Decode(enrollment.secret)
    // The old authenticator still signs in.
    const pending = await post('/api/v1/admin/auth/login', { email, password })
    expect(
      (await post('/api/v1/admin/auth/2fa', { code: await freshTotp() }, cookieOf(pending)))
        .statusCode,
    ).toBe(200)
    await reauth(cookie)
    expect(
      (await post('/api/v1/admin/security/totp/confirm', { code: '000000' }, cookie)).statusCode,
    ).toBe(401)
    await fixture.client`update platform_admins set totp_last_step=null`
    const confirmed = await post(
      '/api/v1/admin/security/totp/confirm',
      { code: totp(next, Date.now()) },
      cookie,
    )
    expect(confirmed.statusCode, confirmed.body).toBe(204)
    expect((await get('/api/v1/admin/auth/me', other)).statusCode).toBe(401)
    expect(
      (
        await post('/api/v1/admin/security/totp/confirm', { code: totp(next, Date.now()) }, cookie)
      ).json().code,
    ).toBe('TOTP_NOT_PENDING')
    const old = await post('/api/v1/admin/auth/login', { email, password })
    expect(
      (await post('/api/v1/admin/auth/2fa', { code: await freshTotp() }, cookieOf(old))).statusCode,
    ).toBe(401)
    key = next
    expect(
      (
        await post(
          '/api/v1/admin/auth/2fa',
          { code: totp(next, Date.now() + 30_000) },
          cookieOf(old),
        )
      ).statusCode,
    ).toBe(200)
    expect(
      await fixture.client`select 1 from platform_admin_audit where action='admin.totp_reset'`,
    ).toHaveLength(1)
  })

  describe('trial activation', () => {
    const today = () =>
      new Date(Date.now()).toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' })
    const dayOffset = (days: number) =>
      new Date(Date.now() + days * DAY).toLocaleDateString('en-CA', {
        timeZone: 'Africa/Casablanca',
      })
    const url = `/api/v1/admin/owners/${testOwnerId}/subscription/activation`
    const base = { planCode: 'business', cycle: 'monthly', reason: 'converted by phone' }

    it('activates a trial with a confirmed payment snapshot or complimentary access', async () => {
      const cookie = await signIn()
      const invalid: [object, string][] = [
        [
          { startsOn: dayOffset(-1), endsOn: dayOffset(30), settlement: 'complimentary' },
          'COVERAGE_INVALID',
        ],
        [{ startsOn: today(), endsOn: today(), settlement: 'complimentary' }, 'COVERAGE_INVALID'],
        [
          { startsOn: today(), endsOn: dayOffset(4 * 366), settlement: 'complimentary' },
          'COVERAGE_INVALID',
        ],
        [
          {
            startsOn: today(),
            endsOn: dayOffset(30),
            settlement: 'confirmed_payment',
            paymentMethod: 'cash',
          },
          'PAYMENT_DETAILS_REQUIRED',
        ],
        [
          {
            startsOn: today(),
            endsOn: dayOffset(30),
            settlement: 'complimentary',
            paymentMethod: 'cash',
          },
          'PAYMENT_DETAILS_UNEXPECTED',
        ],
        [
          {
            startsOn: today(),
            endsOn: dayOffset(30),
            settlement: 'confirmed_payment',
            paymentMethod: 'crypto',
            receivedReference: 'R',
          },
          'INVALID_PAYMENT_METHOD',
        ],
      ]
      for (const [body, code] of invalid) {
        const response = await post(url, { ...base, ...body }, cookie)
        expect(response.statusCode, code).toBe(400)
        expect(response.json().code).toBe(code)
      }
      expect(
        (
          await post(
            url,
            {
              ...base,
              startsOn: today(),
              endsOn: dayOffset(30),
              settlement: 'complimentary',
              code: '123456',
            },
            cookie,
          )
        ).statusCode,
      ).toBe(400)
      // Change plan stays paid-only.
      expect(
        (
          await post(
            `/api/v1/admin/owners/${testOwnerId}/subscription/plan`,
            { planCode: 'pro', reason: 'x' },
            cookie,
          )
        ).json().code,
      ).toBe('NO_PAID_PERIOD')

      const activated = await post(
        url,
        {
          ...base,
          startsOn: today(),
          endsOn: dayOffset(30),
          settlement: 'confirmed_payment',
          paymentMethod: 'bank_transfer',
          receivedReference: 'VIR-77',
        },
        cookie,
      )
      expect(activated.statusCode, activated.body).toBe(200)
      expect(activated.json().subscription).toMatchObject({
        status: 'active',
        planCode: 'business',
      })
      const [payment] =
        await fixture.client`select * from subscription_payments where owner_id=${testOwnerId}`
      expect(payment).toMatchObject({
        status: 'confirmed',
        kind: 'activation',
        method: 'bank_transfer',
        amount_ht: 29900,
        received_reference: 'VIR-77',
        decided_by: email,
      })
      const [period] =
        await fixture.client`select kind, payment_id, ends_at from subscription_periods where owner_id=${testOwnerId} and kind<>'trial'`
      expect(period).toMatchObject({ kind: 'paid', payment_id: payment!.id })
      const [audit] =
        await fixture.client`select after from platform_admin_audit where action='subscription.activate'`
      expect(audit!.after).toMatchObject({
        settlement: 'confirmed_payment',
        reason: 'converted by phone',
        status: 'active',
      })
      expect(
        (
          await post(
            url,
            { ...base, startsOn: today(), endsOn: dayOffset(30), settlement: 'complimentary' },
            cookie,
          )
        ).json().code,
      ).toBe('SUBSCRIPTION_NOT_TRIAL')

      // Change plan preserves the coverage end.
      const before = (
        await fixture.client`select paid_through_at from owner_subscriptions where owner_id=${testOwnerId}`
      )[0]!.paid_through_at
      const changed = await post(
        `/api/v1/admin/owners/${testOwnerId}/subscription/plan`,
        { planCode: 'pro', reason: 'upgrade' },
        cookie,
      )
      expect(changed.statusCode, changed.body).toBe(200)
      expect(changed.json().subscription.planCode).toBe('pro')
      const after = (
        await fixture.client`select paid_through_at from owner_subscriptions where owner_id=${testOwnerId}`
      )[0]!.paid_through_at
      expect(new Date(after).getTime()).toBe(new Date(before).getTime())
      expect(new Date(changed.json().subscription.paidThroughAt).getTime()).toBe(
        new Date(before).getTime(),
      )
    })

    it('grants complimentary access without bridging a gap after the trial', async () => {
      const cookie = await signIn()
      const [trial] =
        await fixture.client`select trial_ends_at from owner_subscriptions where owner_id=${testOwnerId}`
      const startsOn = dayOffset(20)
      const activated = await post(
        url,
        { ...base, startsOn, endsOn: dayOffset(50), settlement: 'complimentary' },
        cookie,
      )
      expect(activated.statusCode, activated.body).toBe(200)
      const [row] =
        await fixture.client`select trial_ends_at, plan_code from owner_subscriptions where owner_id=${testOwnerId}`
      // The trial is not extended, and the plan applies only from the start day.
      expect(new Date(row!.trial_ends_at).getTime()).toBe(new Date(trial!.trial_ends_at).getTime())
      expect(row!.plan_code).toBe('trial')
      const [period] =
        await fixture.client`select kind, starts_at from subscription_periods where owner_id=${testOwnerId} and kind<>'trial'`
      expect(period!.kind).toBe('complimentary')
      // Starts at midnight of the day in Africa/Casablanca.
      expect(
        new Date(period!.starts_at).toLocaleString('en-GB', {
          timeZone: 'Africa/Casablanca',
          hour12: false,
        }),
      ).toContain('00:00:00')
      const [payment] =
        await fixture.client`select method, amount_ttc from subscription_payments where owner_id=${testOwnerId}`
      expect(payment).toMatchObject({ method: 'admin_adjustment', amount_ttc: 0 })
      // During the trial the owner keeps trial-equivalent access before the activation starts.
      expect(
        (await get(`/api/v1/admin/owners/${testOwnerId}`, cookie)).json().subscription.status,
      ).not.toBe('expired')
      // After the trial ends and before coverage, access is expired (no complimentary grace either).
      await fixture.client`update owner_subscriptions set trial_ends_at=now()-interval '1 day', trial_started_at=now()-interval '8 days' where owner_id=${testOwnerId}`
      await fixture.client`update subscription_periods set starts_at=now()-interval '8 days', ends_at=now()-interval '1 day' where owner_id=${testOwnerId} and kind='trial'`
      expect(
        (await get(`/api/v1/admin/owners/${testOwnerId}`, cookie)).json().subscription.status,
      ).toBe('expired')
      expect(
        (await get('/api/v1/admin/owners?status=expired', cookie))
          .json()
          .items.map((o: { id: string }) => o.id),
      ).toContain(testOwnerId)
    })
  })
})
