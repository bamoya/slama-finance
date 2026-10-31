import type { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'

type ClientRow = Awaited<ReturnType<ReturnType<typeof createInvoiceRepository>['client']>>

// Copy printable identity only. Never refresh document prices, lines or delivery instructions.
export function clientSnapshot(client: ClientRow) {
  return {
    type: client.type,
    firstName: client.firstName,
    lastName: client.lastName,
    legalName: client.legalName,
    tradeName: client.tradeName,
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    city: client.city,
    postalCode: client.postalCode,
    countryCode: client.countryCode,
    ice: client.ice,
    taxIdentifier: client.taxIdentifier,
    registrationNumber: client.registrationNumber,
    registrationCity: client.registrationCity,
    professionalTaxNumber: client.professionalTaxNumber,
    email: client.email,
    phone: client.phone,
  }
}
