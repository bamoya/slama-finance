/** Onboarding company key, label and the reference key deciding whether the legal type shows it. */
export const companyFields = [
  ['legalName', 'Legal company name', 'legalName'],
  ['email', 'Contact email', 'email'],
  ['phone', 'Phone numbers', 'phone'],
  ['address', 'Address', 'addressLine1'],
  ['city', 'City', 'city'],
  ['ice', 'ICE', 'ice'],
  ['registrationNumber', 'Commercial register (RC)', 'registrationNumber'],
  ['registrationCity', 'Registry city (RC)', 'registrationNumber'],
  ['taxIdentifier', 'Tax identifier (IF)', 'taxIdentifier'],
  ['professionalTaxNumber', 'Professional tax / Patente', 'professionalTaxNumber'],
  ['shareCapital', 'Share capital (MAD)', 'shareCapital'],
] as const
