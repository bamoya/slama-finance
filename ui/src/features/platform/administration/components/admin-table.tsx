import type { ReactNode } from 'react'

/** Horizontally scrollable table that keeps its columns readable on narrow screens. */
export function AdminTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table
        data-slot="data-table"
        className="w-full min-w-[720px] text-left text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2"
      >
        {children}
      </table>
    </div>
  )
}
