import { PROVIDER_LABEL, type SettingsView } from '../../../shared/types'

interface Props {
  settings: SettingsView
  value: string
  onChange: (key: string) => void
  className?: string
  title?: string
}

/** 登録済みの API キーで使えるモデルを、提供元ごとにまとめて表示する */
export function ModelSelect({
  settings,
  value,
  onChange,
  className = 'input',
  title
}: Props): React.JSX.Element {
  const groups = settings.providers.filter((p) => p.models.length > 0)
  if (groups.length === 0) {
    return (
      <select className={className} disabled title={title}>
        <option>設定画面で API キーを登録してください</option>
      </select>
    )
  }
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={title}
    >
      {!groups.some((g) => g.models.some((m) => m.key === value)) && (
        <option value="">モデルを選択</option>
      )}
      {groups.map((g) => (
        <optgroup key={g.provider} label={PROVIDER_LABEL[g.provider]}>
          {g.models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function modelLabel(settings: SettingsView, key: string): string {
  for (const p of settings.providers) {
    const m = p.models.find((x) => x.key === key)
    if (m) return m.label
  }
  return key
}
