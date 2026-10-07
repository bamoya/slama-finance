import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import type { Client } from '../../../api/generated/schemas/clients/clients.schemas'
import { useDeliveryAddressDefault } from './use-delivery-address-default'

const state = vi.hoisted(() => ({ client: undefined as Client | undefined }))
vi.mock('../../clients', () => ({ useClient: () => ({ data: state.client }) }))
const client = {
  id: 'a',
  addressLine1: 'Billing street',
  city: 'Rabat',
  countryCode: 'MA',
  deliveryAddressLine1: 'Delivery street',
  deliveryCity: 'Casablanca',
  deliveryCountryCode: 'MA',
} as Client
beforeEach(() => {
  state.client = undefined
})
it('prefills the selected client delivery address only once', () => {
  state.client = client
  const fill = vi.fn()
  const hook = renderHook(() => useDeliveryAddressDefault('a', fill))
  expect(fill).toHaveBeenCalledWith('Delivery street, Casablanca, MA')
  hook.rerender()
  expect(fill).toHaveBeenCalledTimes(1)
})
it('uses billing details when no separate delivery address is configured', () => {
  state.client = { ...client, deliveryAddressLine1: null }
  const fill = vi.fn()
  renderHook(() => useDeliveryAddressDefault('a', fill))
  expect(fill).toHaveBeenCalledWith('Billing street, Rabat, MA')
})
it('preserves saved addresses and custom input while loading', () => {
  const fill = vi.fn()
  const hook = renderHook(() => useDeliveryAddressDefault(null, fill))
  state.client = client
  hook.rerender()
  expect(fill).not.toHaveBeenCalled()
  state.client = undefined
  act(() => hook.result.current.selectClient('a'))
  act(() => hook.result.current.keepCustomAddress())
  state.client = client
  hook.rerender()
  expect(fill).not.toHaveBeenCalled()
})
it('ignores a stale client response after changing selection', () => {
  const fill = vi.fn()
  const hook = renderHook(() => useDeliveryAddressDefault('a', fill))
  act(() => hook.result.current.selectClient('b'))
  state.client = client
  hook.rerender()
  expect(fill).not.toHaveBeenCalled()
  state.client = { ...client, id: 'b', deliveryAddressLine1: 'New address' }
  hook.rerender()
  expect(fill).toHaveBeenCalledWith('New address, Casablanca, MA')
})
