import type { ReactNode } from 'react'
import { theme } from '../theme'

export const BAR_H = 46

export const BrowserFrame = ({
  host,
  width,
  height,
  children,
}: {
  host: string
  width: number
  height: number
  children: ReactNode
}) => (
  <div
    style={{
      width,
      height: height + BAR_H,
      borderRadius: 18,
      background: theme.surface,
      boxShadow: theme.shadow,
      border: `1px solid ${theme.border}`,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div
      style={{
        height: BAR_H,
        background: theme.muted,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 16,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        {['#ff6058', '#ffbd2e', '#28c93f'].map((c) => (
          <span
            key={c}
            style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.85 }}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          maxWidth: 560,
          margin: '0 auto',
          height: 28,
          borderRadius: 14,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 15,
          fontWeight: 500,
          color: theme.caption,
          fontFamily: theme.font,
        }}
      >
        <svg
          width="12"
          height="14"
          viewBox="0 0 12 14"
          fill="none"
          stroke={theme.caption}
          strokeWidth="1.6"
        >
          <rect x="1.5" y="6" width="9" height="7" rx="1.5" />
          <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" />
        </svg>
        {host}
      </div>
      <div style={{ width: 52 }} />
    </div>
    <div
      style={{ width, height, position: 'relative', overflow: 'hidden', background: theme.surface }}
    >
      {children}
    </div>
  </div>
)
