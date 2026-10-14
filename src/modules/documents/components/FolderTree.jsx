import { useState } from 'react'
import { ChevronRight, ChevronDown, HardDrive } from 'lucide-react'
import { FolderIcon } from './ItemIcon'

// The navigation pane down the left side of File Explorer: the root plus every
// folder, nested, expandable. `dropProps(folderId)` lets items be dragged onto it.
export default function FolderTree({ folders, currentId, ancestorIds, onOpen, dropProps, dropKey, rootLabel = 'My Documents' }) {
  const byParent = new Map()
  for (const f of folders) {
    const key = f.parent_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(f)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

  return (
    <nav aria-label="Folders" className="py-2 text-sm select-none">
      <button
        type="button"
        onClick={() => onOpen(null)}
        {...dropProps(null, 'root')}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left rounded transition-colors ${
          currentId === null ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-700 hover:bg-gray-100'
        } ${dropKey === 'root' ? 'ring-2 ring-blue-400' : ''}`}
      >
        <HardDrive size={15} className="text-gray-500 shrink-0" />
        <span className="truncate">{rootLabel}</span>
      </button>
      <Branch parentId={null} depth={1} byParent={byParent} currentId={currentId} ancestorIds={ancestorIds} onOpen={onOpen} dropProps={dropProps} dropKey={dropKey} />
    </nav>
  )
}

function Branch({ parentId, depth, byParent, currentId, ancestorIds, onOpen, dropProps, dropKey }) {
  const list = byParent.get(parentId) || []
  return list.map(folder => (
    <Node key={folder.id} folder={folder} depth={depth} byParent={byParent} currentId={currentId} ancestorIds={ancestorIds} onOpen={onOpen} dropProps={dropProps} dropKey={dropKey} />
  ))
}

function Node({ folder, depth, byParent, currentId, ancestorIds, onOpen, dropProps, dropKey }) {
  // Opened by hand, or because the folder being viewed is somewhere inside it.
  const [openByHand, setOpenByHand] = useState(null)
  const hasChildren = (byParent.get(folder.id) || []).length > 0
  const open = openByHand ?? ancestorIds.has(folder.id)
  const active = currentId === folder.id

  return (
    <div>
      <div
        {...dropProps(folder.id, folder.id)}
        className={`flex items-center rounded transition-colors ${active ? 'bg-blue-100' : 'hover:bg-gray-100'} ${dropKey === folder.id ? 'ring-2 ring-blue-400' : ''}`}
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpenByHand(!open)}
          className={`w-5 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 shrink-0 ${hasChildren ? '' : 'invisible'}`}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onOpen(folder.id)}
          className={`flex-1 min-w-0 flex items-center gap-1.5 py-1 pr-2 text-left ${active ? 'text-blue-800 font-semibold' : 'text-gray-700'}`}
        >
          <FolderIcon size={15} />
          <span className="truncate">{folder.name}</span>
        </button>
      </div>
      {open && hasChildren && (
        <Branch parentId={folder.id} depth={depth + 1} byParent={byParent} currentId={currentId} ancestorIds={ancestorIds} onOpen={onOpen} dropProps={dropProps} dropKey={dropKey} />
      )}
    </div>
  )
}
