import { useEffect, useState } from 'react'

import { useClient } from '../../clients'

// Only an explicit selection (or a prefilled new note) requests a default.
// Cancelling the request on typing protects custom addresses from late responses.
export function useDeliveryAddressDefault(
  initialClientId: string | null,
  onDefault: (address: string) => void,
) {
  const [pendingClientId, setPendingClientId] = useState(initialClientId)
  const client = useClient(pendingClientId ?? '', Boolean(pendingClientId))
  useEffect(() => {
    if (!pendingClientId || client.data?.id !== pendingClientId) return
    const data = client.data
    const address = data.deliveryAddressLine1?.trim()
      ? [
          data.deliveryAddressLine1,
          data.deliveryAddressLine2,
          data.deliveryPostalCode,
          data.deliveryCity,
          data.deliveryCountryCode,
        ]
      : [data.addressLine1, data.addressLine2, data.postalCode, data.city, data.countryCode]
    onDefault(
      address
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(', '),
    )
    setPendingClientId(null)
  }, [client.data, pendingClientId, onDefault])
  return {
    selectClient: (id: string) => setPendingClientId(id || null),
    keepCustomAddress: () => setPendingClientId(null),
  }
}
