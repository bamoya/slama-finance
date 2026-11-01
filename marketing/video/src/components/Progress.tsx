import { theme } from '../theme'
import { chapters } from '../config'

export const Progress = ({ index }: { index: number }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: theme.font }}>
    <div style={{ display: 'flex', gap: 6 }}>
      {chapters.map((c, i) => (
        <span
          key={c.id}
          style={{
            width: i === index ? 34 : 14,
            height: 6,
            borderRadius: 3,
            background: i <= index ? theme.primary : theme.border,
            opacity: i === index ? 1 : i < index ? 0.55 : 1,
          }}
        />
      ))}
    </div>
    <span style={{ fontSize: 20, fontWeight: 600, color: theme.caption }}>
      {index + 1}/{chapters.length}
    </span>
  </div>
)
