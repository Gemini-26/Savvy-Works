import { useSyncExternalStore } from 'react'
import { THEMES } from '../constants/themes'
import { getTheme, setTheme, subscribeTheme } from '../utils/theme'

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme)
  return { theme, setTheme, themes: THEMES }
}
