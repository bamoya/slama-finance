/** Internal authorization call, not an HTTP payload. The caller selects the identity flow explicitly. */
export interface OrganizationAccessRequest {
  organizationId: string
  identityType: 'owner' | 'staff'
  token?: string
  permission: string
}
