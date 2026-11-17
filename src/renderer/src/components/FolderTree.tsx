import { useEffect, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Library } from 'lucide-react'

/** child が parent フォルダの中 (子孫) にあるか */
export function isInside(child: string, parent: string): boolean {
  const p = parent.replace(/[\\/]+$/, '')
  return child.length > p.length + 1 && child.startsWith(p) && /[\\/]/.test(child.charAt(p.length))
}

interface NodeProps {
  path: string
  name: string
  depth: number
  current: string
  onSelect: (p: string) => void
  refreshKey: number
  isRoot?: boolean
}

function TreeNode({
  path,
  name,
  depth,
  current,
  onSelect,
  refreshKey,
  isRoot
}: NodeProps): React.JSX.Element {
  const [open, setOpen] = useState(!!isRoot)
  const [children, setChildren] = useState<{ name: string; path: string }[] | null>(null)
  const isAncestor = isInside(current, path)

  useEffect(() => {
    if (isAncestor) setOpen(true)
  }, [isAncestor])

  useEffect(() => {
    if (!open) return
    let alive = true
    window.api
      .listFolder(path)
      .then((l) => alive && setChildren(l.folders))
      .catch(() => alive && setChildren([]))
    return () => {
      alive = false
    }
  }, [open, path, refreshKey])

  const selected = current === path
  return (
    <div>
      <div
        className={`tree-row ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(path)}
        title={path}
      >
        <button
          className={`tree-chevron ${open ? 'open' : ''} ${children && children.length === 0 ? 'empty' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
        >
          <ChevronRight size={14} />
        </button>
        {isRoot ? (
          <Library size={16} className="tree-icon" />
        ) : open ? (
          <FolderOpen size={16} className="tree-icon" />
        ) : (
          <Folder size={16} className="tree-icon" />
        )}
        <span className="tree-name">{name}</span>
      </div>
      {open &&
        children?.map((c) => (
          <TreeNode
            key={c.path}
            path={c.path}
            name={c.name}
            depth={depth + 1}
            current={current}
            onSelect={onSelect}
            refreshKey={refreshKey}
          />
        ))}
    </div>
  )
}

export function FolderTree(p: {
  root: string
  current: string
  onSelect: (p: string) => void
  refreshKey: number
}): React.JSX.Element {
  return (
    <div className="tree">
      <TreeNode
        key={p.root}
        path={p.root}
        name="ライブラリ"
        depth={0}
        current={p.current}
        onSelect={p.onSelect}
        refreshKey={p.refreshKey}
        isRoot
      />
    </div>
  )
}
