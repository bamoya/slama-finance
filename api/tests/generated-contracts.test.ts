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

describe('generated transport validation', () => {
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
