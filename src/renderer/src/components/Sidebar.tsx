import { Library, Settings, Sun, Moon } from 'lucide-react'

export type PageId = 'library' | 'settings'

const NAV: { id: PageId; label: string; icon: typeof Library }[] = [
  { id: 'library', label: 'ライブラリ', icon: Library },
  { id: 'settings', label: '設定', icon: Settings }
]

interface Props {
  page: PageId
  onPage: (p: PageId) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Sidebar({ page, onPage, theme, onToggleTheme }: Props): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="logo" title="類題メーカー">
        <span>∑</span>
      </div>
      <nav className="nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => onPage(id)}
            title={label}
          >
            <span className="nav-icon">
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          className={`theme-switch ${theme === 'dark' ? 'on' : ''}`}
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
          aria-label="テーマ切替"
        >
          <span className="knob">{theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}</span>
        </button>
        <span className="nav-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      </div>
    </aside>
  )
}
