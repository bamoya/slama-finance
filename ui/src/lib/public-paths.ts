import { ownerOrigin } from './platform-sites'

/** Owner account paths on the owner site (app.<platform domain>). */
export const ownerAuthPaths = {
  login: '/login',
  register: '/register',
  forgot: '/auth/forgot-password',
  reset: '/auth/reset-password',
  verify: '/auth/verify-email',
  resend: '/auth/resend-verification',
  acceptInvitation: '/auth/accept-invitation',
} as const

/** Absolute owner-site links for use from other sites (public site call-to-action). */
export const ownerSiteUrl = (path: string) => `${ownerOrigin()}${path}`
