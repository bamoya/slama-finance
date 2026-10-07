import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmAction } from '../management/confirm-action'
import { Button, buttonVariants } from './button'

describe('Shared action styles', () => {
  it('provides complete default sizing and typography without page classes', () => {
    render(<Button>Regenerate PDF</Button>)
    expect(screen.getByRole('button')).toHaveClass(
      'h-control',
      'px-3',
      'py-1.5',
      'font-semibold',
      'text-sm',
      'leading-5',
      '[&_svg]:size-4',
    )
    expect(buttonVariants({ variant: 'outline' })).toContain('h-control px-3 py-1.5')
  })

  it.each([
    ['sm', 'h-9'],
    ['md', 'h-10'],
    ['lg', 'h-control-lg'],
    ['icon', 'size-action'],
    ['icon-md', 'size-10'],
  ] as const)('uses %s size consistently', (size, expected) => {
    render(<Button size={size} aria-label="Action" />)
    expect(screen.getByRole('button')).toHaveClass(expected)
    expect(screen.getByRole('button')).toHaveAttribute('data-size', size)
    expect(screen.getByRole('button')).toHaveClass('font-semibold')
  })
  it('uses semantic primary colors by default, including action links', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'bg-[var(--primary)]',
      'border-[var(--primary-border)]',
      'text-[var(--primary-foreground)]',
    )
    expect(buttonVariants()).toContain('bg-[var(--primary)]')
  })

  it('carries destructive intent into the confirmation dialog', () => {
    render(
      <ConfirmAction
        label="Delete role"
        variant="destructive"
        description="Delete this role?"
        onConfirm={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Delete role' })
    expect(trigger).toHaveAttribute('data-variant', 'destructive')
    fireEvent.click(trigger)
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }),
    ).toHaveAttribute('data-variant', 'destructive')
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    ).toHaveAttribute('data-variant', 'outline')
  })
})
