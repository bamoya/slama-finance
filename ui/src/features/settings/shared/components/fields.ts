import { translate } from '../../../../lib/i18n'
import type { SettingsField } from './settings-form'

export const currencyOptions = ['MAD', 'EUR', 'USD'].map((value) => ({ value, label: value }))
export const addressFields: SettingsField[] = [
  {
    name: 'addressLine1',
    get label() {
      return translate('Address line 1')
    },
    nullable: true,
    get section() {
      return translate('Company address')
    },
  },
  {
    name: 'addressLine2',
    get label() {
      return translate('Address line 2')
    },
    nullable: true,
  },
  {
    name: 'city',
    get label() {
      return translate('City')
    },
    nullable: true,
  },
  {
    name: 'postalCode',
    get label() {
      return translate('Postal code')
    },
    nullable: true,
    get hint() {
      return translate('Five digits; leading zeros are preserved.')
    },
  },
  {
    name: 'countryCode',
    get label() {
      return translate('Country')
    },
    type: 'select',
    options: [
      {
        value: 'MA',
        get label() {
          return translate('Morocco')
        },
      },
    ],
  },
]
export const companyIdentityFields: SettingsField[] = [
  {
    name: 'legalName',
    get label() {
      return translate('Legal company name')
    },
    nullable: true,
    get section() {
      return translate('Company identity')
    },
  },
  {
    name: 'tradeName',
    get label() {
      return translate('Trade name')
    },
    nullable: true,
  },
  {
    name: 'legalForm',
    get label() {
      return translate('Legal form')
    },
    nullable: true,
    get hint() {
      return translate('For example: SARL, SA or sole trader.')
    },
  },
  {
    name: 'shareCapital',
    get label() {
      return translate('Share capital (MAD)')
    },
    nullable: true,
    get hint() {
      return translate('Optional amount with up to two decimal places.')
    },
  },
  {
    name: 'ice',
    get label() {
      return translate('ICE')
    },
    nullable: true,
    get hint() {
      return translate('15 digits.')
    },
    get section() {
      return translate('Tax and registration')
    },
  },
  {
    name: 'taxIdentifier',
    get label() {
      return translate('Tax identifier (IF)')
    },
    nullable: true,
  },
  {
    name: 'registrationNumber',
    get label() {
      return translate('Commercial register (RC)')
    },
    nullable: true,
  },
  {
    name: 'registrationCity',
    get label() {
      return translate('RC registration city')
    },
    nullable: true,
    get hint() {
      return translate('Provide both the RC number and its city, or leave both empty.')
    },
  },
  {
    name: 'professionalTaxNumber',
    get label() {
      return translate('Professional tax / Patente')
    },
    nullable: true,
  },
  {
    name: 'email',
    get label() {
      return translate('Company email')
    },
    type: 'email',
    nullable: true,
    get section() {
      return translate('Contact information')
    },
  },
  {
    name: 'phone',
    get label() {
      return translate('Company phone')
    },
    nullable: true,
    get hint() {
      return translate('Moroccan national or international format.')
    },
  },
]
export const bankFields: SettingsField[] = [
  {
    name: 'bankName',
    get label() {
      return translate('Bank name')
    },
    get section() {
      return translate('Bank details')
    },
  },
  {
    name: 'accountHolder',
    get label() {
      return translate('Account holder')
    },
  },
  {
    name: 'rib',
    get label() {
      return translate('RIB')
    },
    nullable: true,
    get hint() {
      return translate('24 digits. Provide RIB or IBAN.')
    },
  },
  {
    name: 'iban',
    get label() {
      return translate('IBAN')
    },
    nullable: true,
    get hint() {
      return translate('Uppercase without spaces.')
    },
  },
  {
    name: 'name',
    get label() {
      return translate('Account label')
    },
    get section() {
      return translate('Account settings')
    },
    column: 'side',
  },
  {
    name: 'currency',
    get label() {
      return translate('Currency')
    },
    type: 'select',
    options: currencyOptions,
    column: 'side',
  },
]
export const appearanceFields: SettingsField[] = [
  {
    name: 'name',
    get label() {
      return translate('Template name')
    },
    get section() {
      return translate('Template identity')
    },
  },
  {
    name: 'layout',
    get label() {
      return translate('Layout')
    },
    type: 'layout',
    options: [
      {
        value: 'classic',
        get label() {
          return translate('Classic')
        },
      },
      {
        value: 'modern',
        get label() {
          return translate('Modern')
        },
      },
      {
        value: 'minimal',
        get label() {
          return translate('Compact')
        },
      },
      {
        value: 'signature',
        get label() {
          return translate('Signature')
        },
      },
      {
        value: 'atelier',
        get label() {
          return translate('Atelier')
        },
      },
      {
        value: 'ledger',
        get label() {
          return translate('Ledger')
        },
      },
      {
        value: 'essential',
        get label() {
          return translate('Essential')
        },
      },
    ],
  },
  {
    name: 'density',
    get label() {
      return translate('Density')
    },
    type: 'density',
    options: [
      {
        value: 'standard',
        get label() {
          return translate('Standard')
        },
      },
      {
        value: 'compact',
        get label() {
          return translate('Compact density')
        },
      },
    ],
  },
  {
    name: 'accentColor',
    get label() {
      return translate('Accent color')
    },
    type: 'color',
  },
  {
    name: 'showBankDetails',
    get label() {
      return translate('Show bank details')
    },
    type: 'boolean',
    hidden: true,
  },
  {
    name: 'logoAssetId',
    get label() {
      return translate('Template logo')
    },
    type: 'logo',
    nullable: true,
    get section() {
      return translate('Brand assets')
    },
  },
  {
    name: 'signatureAssetId',
    get label() {
      return translate('Authorized signature')
    },
    type: 'signature',
    nullable: true,
  },
  {
    name: 'showSignature',
    get label() {
      return translate('Show signature')
    },
    type: 'boolean',
  },
  {
    name: 'showPaymentTerms',
    hidden: true,
    get label() {
      return translate('Show payment terms')
    },
    type: 'boolean',
    get section() {
      return translate('Terms and footer')
    },
  },
  {
    name: 'paymentTerms',
    get label() {
      return translate('Payment terms')
    },
    type: 'textarea',
    nullable: true,
    hidden: true,
  },
  {
    name: 'footerText',
    get label() {
      return translate('Footer text')
    },
    type: 'textarea',
    nullable: true,
  },
]
