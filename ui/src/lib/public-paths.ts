/** Public account routes. Legacy /owner/* email links remain supported. */
export const ownerAuthPaths = {
  login: '/auth/login',
  register: '/auth/register',
  forgot: '/auth/forgot-password',
  reset: '/auth/reset-password',
  verify: '/auth/verify-email',
  resend: '/auth/resend-verification',
} as const
