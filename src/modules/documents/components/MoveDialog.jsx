import { useState } from 'react'
import { HardDrive } from 'lucide-react'
import { FolderIcon } from './ItemIcon'

// "Move to…" — pick a destination folder from the whole tree. Folders being
// moved (and everything inside them) are greyed out: you can't move a folder
// into itself.
export default function MoveDialog({ folders, blockedIds, count, busy, onMove, onCancel }) {
  const [target, setTarget] = useState(undefined) // undefined = nothing picked yet, null = top level

  const byParent = new Map()
  for (const f of folders) {
    const key = f.parent_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(f)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

  function renderLevel(parentId, depth) {
    return (byParent.get(parentId) || []).map(folder => {
      const blocked = blockedIds.has(folder.id)
      return (
        <div key={folder.id}>
          <button
            type="button"
            disabled={blocked}
            onClick={() => setTarget(folder.id)}
            style={{ paddingLeft: 8 + depth * 16 }}
            className={`w-full flex items-center gap-2 py-1.5 pr-2 text-left text-sm rounded ${
              target === folder.id ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-700 hover:bg-gray-100'
            } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
          >
            <FolderIcon size={16} />
            <span className="truncate">{folder.name}</span>
          </button>
          {!blocked && renderLevel(folder.id, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-sm font-bold text-gray-900">Move {count === 1 ? 'item' : `${count} items`} to…</h2>
          <p className="text-xs text-gray-500 mt-0.5">Choose the folder to move into.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-1 border-y border-gray-100">
          <button
            type="button"
            onClick={() => setTarget(null)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded ${
              target === null ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <HardDrive size={16} className="text-gray-500" /> My Documents
          </button>
          {renderLevel(null, 1)}
        </div>
        <div className="flex gap-3 px-5 py-4">
          <button
            type="button"
            disabled={busy || target === undefined}
            onClick={() => onMove(target)}
            className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            {busy ? 'Moving…' : 'Move here'}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
