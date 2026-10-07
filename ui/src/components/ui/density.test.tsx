import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DataTable } from '../management/data-table'
import { StatsGrid } from '../management/stats-grid'
import { Card, CardContent, CardHeader } from './card'
import { FieldGroup } from './field'
import { Input } from './input'
import { Select, SelectOption } from './select'

describe('Shared responsive density', () => {
  it('uses one control height token for inputs and selects', () => {
    render(
      <>
        <Input aria-label="Name" />
        <Select aria-label="Status" value="active">
          <SelectOption value="active">Active</SelectOption>
        </Select>
      </>,
    )
    expect(screen.getByRole('textbox')).toHaveClass('h-control', 'rounded-control')
    expect(screen.getByRole('combobox')).toHaveClass('h-control', 'rounded-control')
  })

  it('shares spacing tokens between form groups and card sections', () => {
    const { container } = render(
      <Card>
        <CardHeader>Identity</CardHeader>
        <CardContent>
          <FieldGroup>
            <Input aria-label="Name" />
          </FieldGroup>
        </CardContent>
      </Card>,
    )
    expect(container.querySelector('[data-slot="card"]')).toHaveClass('gap-section', 'py-panel')
    expect(container.querySelector('[data-slot="card-content"]')).toHaveClass('px-panel')
    expect(container.querySelector('[data-slot="field-group"]')).toHaveClass('gap-section')
  })

  it('identifies application tables and metric values without targeting document contents', () => {
    const { container } = render(
      <>
        <StatsGrid items={[{ label: 'Clients', value: 12 }]} />
        <DataTable
          items={[{ id: 'one' }]}
          columns={[{ title: 'Name', render: () => 'Atlas' }]}
          emptyTitle="No clients"
          emptyDescription="Add a client"
        />
      </>,
    )
    expect(screen.getByRole('table')).toHaveAttribute('data-slot', 'data-table')
    expect(container.querySelector('[data-slot="stat-value"]')).toHaveTextContent('12')
  })
})
