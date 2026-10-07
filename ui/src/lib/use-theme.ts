import { useEffect, useState } from 'react'

export function useTheme() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('slama-theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', isDark)
    return () => document.documentElement.classList.remove('theme-dark')
  }, [isDark])
  const toggleTheme = () => {
    const next = !isDark
    localStorage.setItem('slama-theme', next ? 'dark' : 'light')
    setIsDark(next)
  }
  return { isDark, toggleTheme }
}
