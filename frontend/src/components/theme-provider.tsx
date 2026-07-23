import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core"
import {
  NavigationBar,
  Style as NavigationBarStyle,
} from "@capawesome/capacitor-navigation-bar"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  )

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  )

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolveTheme = useCallback(
    (t: Theme): "dark" | "light" => {
      if (t === "system") {
        return systemTheme
      }
      return t
    },
    [systemTheme],
  )

  useEffect(() => {
    const root = window.document.documentElement
    const resolved = resolveTheme(theme)

    root.classList.remove("light", "dark")
    root.classList.add(resolved)

    // Keep the Android system-bar icons readable against the app's theme.
    if (Capacitor.isNativePlatform()) {
      const dark = resolved === "dark"
      // Top status bar (icons/clock/battery).
      void SystemBars.setStyle({
        style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      }).catch(() => undefined)

      // Bottom navigation buttons bar (back/home/recents).
      const navStyle = dark ? NavigationBarStyle.Dark : NavigationBarStyle.Light
      void NavigationBar.setStyle({ style: navStyle }).catch(() => undefined)
      void NavigationBar.setColor({ color: "transparent" }).catch(
        () => undefined,
      )
    }
  }, [theme, resolveTheme, systemTheme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
