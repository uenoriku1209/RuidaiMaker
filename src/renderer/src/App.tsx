import { useEffect, useState } from 'react'
import type { SettingsView } from '../../shared/types'
import { Sidebar, type PageId } from './components/Sidebar'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { ToastProvider } from './lib/toast'

type Theme = 'light' | 'dark'

function Shell(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [page, setPage] = useState<PageId>('library')
  const [settings, setSettings] = useState<SettingsView | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
    window.api.setTheme(theme)
  }, [theme])

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setSettings(s)
      // 初回 (キー未登録) は設定画面から始める
      if (!s.providers.some((p) => p.hasKey)) setPage('settings')
    })
  }, [])

  return (
    <div className="app">
      <Sidebar
        page={page}
        onPage={setPage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
      <main className="main">
        {settings && page === 'library' && (
          <LibraryPage
            key={settings.libraryRoot}
            settings={settings}
            onOpenSettings={() => setPage('settings')}
          />
        )}
        {settings && page === 'settings' && (
          <SettingsPage settings={settings} onChange={setSettings} />
        )}
      </main>
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}
