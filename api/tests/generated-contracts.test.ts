import SwaggerParser from '@apidevtools/swagger-parser'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'

import {
  ChangePasswordSchema,
  LoginSchema,
  SessionSchema,
} from '../src/contracts/generated/identity/auth.schemas.js'
import { PermissionAssignmentSchema } from '../src/contracts/generated/identity/rbac.schemas.js'
import {
  CreateStaffSchema,
  getStaffParamsSchema,
  listStaffQuerySchema,
  UpdateStaffSchema,
} from '../src/contracts/generated/identity/staff.schemas.js'
import {
  AcceptStaffInvitationInputSchema,
  CreateStaffInvitationSchema,
  listStaffInvitationsQuerySchema,
  StaffInvitationSchema,
} from '../src/contracts/generated/identity/staff-invitations.schemas.js'
import { validateResponse } from '../src/contracts/generated/responses.js'

describe('generated transport validation', () => {
  it('validates invitation payloads and excludes credentials from management responses', () => {
    expect(CreateStaffInvitationSchema.parse({ email: 'staff@example.test' })).toEqual({
      email: 'staff@example.test',
      roleIds: [],
      language: 'fr',
    })
    expect(listStaffInvitationsQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 25,
      status: 'pending',
    })
    const accepted = {
      token: 'a'.repeat(43),
      firstName: 'Sara',
      lastName: 'Amrani',
      password: 'valid-password-2026',
    }
    expect(AcceptStaffInvitationInputSchema.safeParse(accepted).success).toBe(true)
    for (const invalid of [
      { ...accepted, token: 'short' },
      { ...accepted, token: '!'.repeat(43) },
      { ...accepted, password: 'short' },
      { ...accepted, password: 'a'.repeat(257) },
      { ...accepted, extra: true },
    ])
      expect(AcceptStaffInvitationInputSchema.safeParse(invalid).success).toBe(false)
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'staff@example.test',
      status: 'pending',
      delivery: { state: 'queued', attempts: 0, updatedAt: '2026-10-31T10:00:00Z' },
      roles: [],
      createdAt: '2026-10-31T10:00:00Z',
      expiresAt: null,
      acceptedAt: null,
      revokedAt: null,
    }
    expect(StaffInvitationSchema.safeParse(row).success).toBe(true)
    expect(
      validateResponse('GET', '/v1/staff/invitations?page=1', 200, {
        items: [row],
        total: 1,
        page: 1,
        pageSize: 25,
      }),
    ).toEqual({ items: [row], total: 1, page: 1, pageSize: 25 })
    for (const field of ['token', 'tokenHash', 'leaseId'])
      expect(StaffInvitationSchema.safeParse({ ...row, [field]: 'private' }).success).toBe(false)
  })

  it('rejects unknown fields and preserves defaults, UUIDs and nullable responses', () => {
    const staff = { email: 'staff@example.test', firstName: 'Sara', lastName: 'Amrani' }
    expect(CreateStaffSchema.parse(staff).roleIds).toEqual([])
    expect(CreateStaffSchema.safeParse({ ...staff, password: 'not-allowed' }).success).toBe(false)
    expect(CreateStaffSchema.safeParse({ ...staff, roleIds: ['not-uuid'] }).success).toBe(false)
    expect(getStaffParamsSchema.safeParse({ userId: 'not-uuid' }).success).toBe(false)
    expect(
      LoginSchema.safeParse({
        email: 'staff@example.test',
        password: 'valid-password',
        admin: true,
      }).success,
    ).toBe(false)
    expect(
      SessionSchema.safeParse({
        purpose: 'full',
        permissionKeys: [],
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'staff@example.test',
          firstName: null,
          lastName: null,
          avatarUrl: null,
        },
      }).success,
    ).toBe(true)
    expect(PermissionAssignmentSchema.safeParse({ permissionIds: [] }).success).toBe(false)
    expect(PermissionAssignmentSchema.parse({ permissionKeys: [] })).toEqual({ permissionKeys: [] })
  })
  it('coerces only decimal integer query strings and preserves strict bounds/defaults', () => {
    expect(listStaffQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sort: 'email',
      direction: 'asc',
      status: 'current',
    })
    expect(listStaffQuerySchema.parse({ page: '2', pageSize: '10' })).toMatchObject({
      page: 2,
      pageSize: 10,
    })
    for (const bad of [
      { page: '' },
      { page: '0x10' },
      { page: '1e2' },
      { page: '1junk' },
      { pageSize: '101' },
      { page: null },
      { status: 'deleted' },
      { roleId: 'not-a-uuid' },
      { anything: true },
    ])
      expect(listStaffQuerySchema.safeParse(bad).success).toBe(false)
  })
  it('matches OpenAPI for non-empty PATCH bodies and password constraints', async () => {
    const document = JSON.parse(
      JSON.stringify(
        await SwaggerParser.dereference(
          new URL('../openapi/openapi.yaml', import.meta.url).pathname,
        ),
      ),
    )
    const ajv = new Ajv2020({ strict: false, validateFormats: false })
    for (const [name, generated, cases] of [
      [
        'UpdateStaff',
        UpdateStaffSchema,
        [
          {},
          { firstName: 'Sara' },
          { firstName: '' },
          { firstName: 'a'.repeat(101) },
          { newField: 'x' },
        ],
      ],
      [
        'ChangePassword',
        ChangePasswordSchema,
        [
          {},
          { newPassword: 'short' },
          { newPassword: 'long-password' },
          { newPassword: 'a'.repeat(257) },
        ],
      ],
    ] as const) {
      const validate = ajv.compile(document.components.schemas[name])
      for (const value of cases) expect(generated.safeParse(value).success).toBe(validate(value))
    }
  })
})
