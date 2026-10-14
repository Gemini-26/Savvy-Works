import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, FolderPlus, ArrowUp, LayoutGrid, List, Search, X, Pencil, Trash2, Download, FolderInput,
  Info, EllipsisVertical, RefreshCw, FolderOpen, ChevronRight, ArrowUpDown, Eye, CircleAlert, CircleCheck, HardDrive,
} from 'lucide-react'
import {
  fetchDocumentTree, createFolder, renameFolder, moveFolder, deleteFolder,
  uploadFiles, renameFile, moveFile, deleteFile, getSignedUrls, getDownloadUrl, logDownload,
  validateName, namesInFolder, folderPath, formatBytes,
} from '../services/documentsService'
import { formatDateTime } from '../../../shared/utils/formatDate'
import { fileKind, kindLabel } from './fileKinds'
import { FolderIcon, FileGlyph, Thumb } from './ItemIcon'
import FolderTree from './FolderTree'
import PreviewModal from './PreviewModal'
import MoveDialog from './MoveDialog'

const DND_MIME   = 'application/x-savvy-documents'
const VIEW_KEY   = 'savvy.documents.view'
const URL_FRESH  = 50 * 60 * 1000
const collator   = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Signed links, shared across renders. Keyed by storage path.
const urlCache = new Map()
const cachedUrl = path => {
  const hit = urlCache.get(path)
  return hit && Date.now() - hit.at < URL_FRESH ? hit.url : null
}

function folderItem(f) {
  return { key: `folder:${f.id}`, kind: 'folder', id: f.id, name: f.name, data: f, modified: f.updated_at, size: null, type: 'File folder' }
}
function fileItem(f) {
  return { key: `file:${f.id}`, kind: 'file', id: f.id, name: f.file_name, data: f, modified: f.updated_at, size: f.file_size, type: kindLabel(f) }
}
const parentOf = item => (item.kind === 'folder' ? item.data.parent_id : item.data.folder_id) ?? null

// Every folder id underneath rootId (null = all of them).
function subtreeIds(folders, rootId) {
  const ids = new Set()
  let frontier = [rootId ?? null]
  while (frontier.length) {
    const next = []
    for (const f of folders) {
      if (!ids.has(f.id) && frontier.includes(f.parent_id ?? null)) {
        ids.add(f.id)
        next.push(f.id)
      }
    }
    frontier = next
  }
  return ids
}

function compareItems(a, b, sort) {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1 // folders always first, like Explorer
  const byName = collator.compare(a.name, b.name)
  let r = byName
  if (sort.key === 'modified') r = new Date(a.modified) - new Date(b.modified) || byName
  else if (sort.key === 'size') r = (a.size ?? -1) - (b.size ?? -1) || byName
  else if (sort.key === 'type') r = collator.compare(a.type, b.type) || byName
  return sort.dir === 'asc' ? r : -r
}

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

// Files dragged in from the desktop. Folders can't be read as files here, so
// they are filtered out and reported.
function filesFromDrop(e) {
  const files = []
  let skippedFolders = 0
  const items = [...(e.dataTransfer.items || [])]
  if (items.length) {
    for (const it of items) {
      if (it.kind !== 'file') continue
      if (it.webkitGetAsEntry?.()?.isDirectory) { skippedFolders += 1; continue }
      const f = it.getAsFile()
      if (f) files.push(f)
    }
  } else {
    files.push(...e.dataTransfer.files)
  }
  return { files, skippedFolders }
}

const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files')
const isOurDrag = e => hasFiles(e) || [...(e.dataTransfer?.types || [])].includes(DND_MIME)

export default function DocumentExplorer({ ownerKind, ownerId, canManage, rootLabel = 'My Documents', onChanged }) {
  const owner = useMemo(() => ({ kind: ownerKind, id: ownerId }), [ownerKind, ownerId])
  const [tree, setTree]           = useState({ folders: [], files: [] })
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy]           = useState(false)
  const [uploading, setUploading] = useState(null)
  const [notice, setNotice]       = useState(null)

  const [currentId, setCurrentId] = useState(null)
  const [query, setQuery]         = useState('')
  const [view, setView]           = useState(readView)
  const [sort, setSort]           = useState({ key: 'name', dir: 'asc' })
  const [showDetails, setShowDetails] = useState(false)

  const [selected, setSelected]   = useState(() => new Set())
  const [focusKey, setFocusKey]   = useState(null)
  const [renaming, setRenaming]   = useState(null)
  const [draftFolder, setDraftFolder] = useState(false)
  const [menu, setMenu]           = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const [moveKeysDialog, setMoveKeysDialog] = useState(null)
  const [deleteKeysDialog, setDeleteKeysDialog] = useState(null)
  const [dropKey, setDropKey]     = useState(null)
  const [, setUrlTick]            = useState(0)

  const [coarse] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches)
  const fileInputRef = useRef(null)
  const contentRef   = useRef(null)

  // ── Data ───────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      setTree(await fetchDocumentTree(owner))
      setLoadError(null)
    } catch (err) {
      setLoadError(err.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    let cancelled = false
    fetchDocumentTree(owner)
      .then(t => { if (!cancelled) { setTree(t); setLoadError(null) } })
      .catch(err => { if (!cancelled) setLoadError(err.message || 'Failed to load documents') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [owner])

  // Runs a change, reports failure in the banner, and says whether it worked.
  const run = useCallback(async fn => {
    setBusy(true)
    setNotice(null)
    try {
      await fn()
      return true
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Something went wrong.' })
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const changed = useCallback(async () => {
    await reload()
    onChanged?.()
  }, [reload, onChanged])

  useEffect(() => {
    if (notice?.type !== 'success') return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  // ── What's on screen ───────────────────────────────────────────────────────
  const folderById = useMemo(() => new Map(tree.folders.map(f => [f.id, f])), [tree.folders])
  const cur = currentId && folderById.has(currentId) ? currentId : null

  const lookup = useMemo(() => {
    const map = new Map()
    for (const f of tree.folders) map.set(`folder:${f.id}`, folderItem(f))
    for (const f of tree.files) map.set(`file:${f.id}`, fileItem(f))
    return map
  }, [tree])

  const ancestorIds = useMemo(() => {
    const ids = new Set()
    let node = cur ? folderById.get(cur) : null
    while (node?.parent_id) {
      ids.add(node.parent_id)
      node = folderById.get(node.parent_id)
    }
    if (cur) ids.add(cur)
    return ids
  }, [cur, folderById])

  const crumbs = useMemo(() => {
    const list = []
    let node = cur ? folderById.get(cur) : null
    while (node) {
      list.unshift(node)
      node = node.parent_id ? folderById.get(node.parent_id) : null
    }
    return list
  }, [cur, folderById])

  const q = query.trim().toLowerCase()
  const items = useMemo(() => {
    let folderRows
    let fileRows
    if (q) {
      const sub = subtreeIds(tree.folders, cur)
      folderRows = tree.folders.filter(f => sub.has(f.id) && f.name.toLowerCase().includes(q))
      fileRows = tree.files.filter(f => ((f.folder_id ?? null) === cur || sub.has(f.folder_id)) && f.file_name.toLowerCase().includes(q))
    } else {
      folderRows = tree.folders.filter(f => (f.parent_id ?? null) === cur)
      fileRows = tree.files.filter(f => (f.folder_id ?? null) === cur)
    }
    return [...folderRows.map(folderItem), ...fileRows.map(fileItem)].sort((a, b) => compareItems(a, b, sort))
  }, [tree, cur, q, sort])

  const viewFiles = useMemo(() => items.filter(i => i.kind === 'file').map(i => i.data), [items])

  // Thumbnails: fetch links for the photos/videos on screen, all in one request.
  useEffect(() => {
    const need = viewFiles.filter(f => {
      const kind = fileKind(f)
      return (kind === 'image' || kind === 'video') && !cachedUrl(f.storage_path)
    })
    if (!need.length) return
    let cancelled = false
    getSignedUrls(need).then(map => {
      if (cancelled) return
      for (const [path, url] of map) urlCache.set(path, { url, at: Date.now() })
      setUrlTick(t => t + 1)
    })
    return () => { cancelled = true }
  }, [viewFiles])

  const resolveUrl = useCallback(async file => {
    const hit = cachedUrl(file.storage_path)
    if (hit) return hit
    const map = await getSignedUrls([file])
    const url = map.get(file.storage_path) || null
    if (url) urlCache.set(file.storage_path, { url, at: Date.now() })
    return url
  }, [])

  // Keep the keyboard-focused item in view.
  useEffect(() => {
    if (!focusKey || !contentRef.current) return
    contentRef.current.querySelector(`[data-key="${focusKey}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [focusKey])

  // Drop selections that no longer exist (deleted / moved away).
  const liveSelected = useMemo(() => {
    const shown = new Set(items.map(i => i.key))
    return new Set([...selected].filter(k => shown.has(k)))
  }, [selected, items])

  const selectedItems = useMemo(() => [...liveSelected].map(k => lookup.get(k)).filter(Boolean), [liveSelected, lookup])
  const selectedBytes = selectedItems.reduce((sum, i) => sum + (i.kind === 'file' ? i.size || 0 : 0), 0)

  // ── Navigation ─────────────────────────────────────────────────────────────
  const openFolder = useCallback(id => {
    setCurrentId(id)
    setQuery('')
    setSelected(new Set())
    setFocusKey(null)
    setDraftFolder(false)
    setRenaming(null)
  }, [])

  function goUp() {
    if (!cur) return
    openFolder(folderById.get(cur)?.parent_id ?? null)
  }

  function openItem(item) {
    if (item.kind === 'folder') openFolder(item.id)
    else setPreviewId(item.id)
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  function selectOnly(key) {
    setSelected(new Set([key]))
    setFocusKey(key)
  }

  function onItemClick(e, item) {
    e.stopPropagation()
    if (renaming) return
    if (coarse) { openItem(item); return }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(liveSelected)
      if (next.has(item.key)) next.delete(item.key)
      else next.add(item.key)
      setSelected(next)
      setFocusKey(item.key)
    } else if (e.shiftKey && focusKey) {
      const keys = items.map(i => i.key)
      const a = keys.indexOf(focusKey)
      const b = keys.indexOf(item.key)
      if (a === -1 || b === -1) { selectOnly(item.key); return }
      setSelected(new Set(keys.slice(Math.min(a, b), Math.max(a, b) + 1)))
    } else {
      selectOnly(item.key)
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function download(file) {
    try {
      const url = await getDownloadUrl(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.file_name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      logDownload(file, tree.folders).then(() => onChanged?.())
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Could not download that file.' })
    }
  }

  async function doUpload(fileList, folderId = cur) {
    if (!canManage || !fileList.length) return
    setNotice(null)
    setUploading({ done: 0, total: fileList.length })
    try {
      const { uploaded, failed } = await uploadFiles(owner, folderId, fileList, tree.folders, tree.files, (done, total) => setUploading({ done, total }))
      await changed()
      if (failed.length) {
        const names = failed.slice(0, 3).map(f => f.file.name).join(', ')
        setNotice({ type: 'error', text: `${failed.length} of ${fileList.length} file${fileList.length === 1 ? '' : 's'} didn't upload (${names}${failed.length > 3 ? '…' : ''}): ${failed[0].error.message}` })
      } else {
        setNotice({ type: 'success', text: `Uploaded ${uploaded.length} file${uploaded.length === 1 ? '' : 's'}.` })
      }
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Upload failed.' })
    } finally {
      setUploading(null)
    }
  }

  function startRename(item) {
    if (!canManage) return
    setDraftFolder(false)
    setRenaming(item.key)
  }

  async function commitRename(item, value) {
    setRenaming(null)
    const name = value.trim()
    if (!name || name === item.name) return
    const problem = validateName(name)
    if (problem) { setNotice({ type: 'error', text: problem }); return }
    const taken = namesInFolder(tree.folders, tree.files, parentOf(item)).filter(n => n.toLowerCase() !== item.name.toLowerCase())
    if (taken.some(n => n.toLowerCase() === name.toLowerCase())) {
      setNotice({ type: 'error', text: `"${name}" already exists in this folder.` })
      return
    }
    const ok = await run(async () => {
      if (item.kind === 'folder') await renameFolder(item.data, name, tree.folders)
      else await renameFile(item.data, name, tree.folders)
      await changed()
    })
    if (ok) setNotice({ type: 'success', text: `Renamed to "${name}".` })
  }

  async function commitNewFolder(value) {
    setDraftFolder(false)
    const name = value.trim()
    if (!name) return
    const problem = validateName(name)
    if (problem) { setNotice({ type: 'error', text: problem }); return }
    if (namesInFolder(tree.folders, tree.files, cur).some(n => n.toLowerCase() === name.toLowerCase())) {
      setNotice({ type: 'error', text: `"${name}" already exists in this folder.` })
      return
    }
    await run(async () => {
      await createFolder(owner, cur, name, tree.folders)
      await changed()
    })
  }

  function startNewFolder() {
    if (!canManage) return
    setQuery('')
    setRenaming(null)
    setDraftFolder(true)
  }

  // Everything in `moving` plus, for folders, everything inside them.
  function blockedFor(moving) {
    const blocked = new Set()
    for (const it of moving) {
      if (it.kind !== 'folder') continue
      blocked.add(it.id)
      for (const id of subtreeIds(tree.folders, it.id)) blocked.add(id)
    }
    return blocked
  }

  async function moveItems(keys, targetId) {
    const moving = keys.map(k => lookup.get(k)).filter(Boolean)
    if (targetId && blockedFor(moving).has(targetId)) {
      setNotice({ type: 'error', text: 'A folder can\'t be moved into itself.' })
      return
    }
    const toMove = moving.filter(it => parentOf(it) !== (targetId ?? null))
    if (!toMove.length) return
    const taken = new Set(namesInFolder(tree.folders, tree.files, targetId).map(n => n.toLowerCase()))
    const skipped = []
    let moved = 0
    const ok = await run(async () => {
      for (const it of toMove) {
        if (taken.has(it.name.toLowerCase())) { skipped.push(it.name); continue }
        if (it.kind === 'folder') await moveFolder(it.data, targetId, tree.folders)
        else await moveFile(it.data, targetId, tree.folders)
        taken.add(it.name.toLowerCase())
        moved += 1
      }
      await changed()
    })
    setSelected(new Set())
    setMoveKeysDialog(null)
    if (!ok) return
    if (skipped.length) {
      setNotice({ type: 'error', text: `${skipped.map(n => `"${n}"`).join(', ')} already exist${skipped.length === 1 ? 's' : ''} in the destination folder, so ${skipped.length === 1 ? 'it was' : 'they were'} left where ${skipped.length === 1 ? 'it is' : 'they are'}.${moved ? ` Moved ${moved} other item${moved === 1 ? '' : 's'}.` : ''}` })
    } else {
      setNotice({ type: 'success', text: `Moved ${moved} item${moved === 1 ? '' : 's'} to ${folderPath(tree.folders, targetId, rootLabel)}.` })
    }
  }

  async function deleteItems(keys) {
    const doomed = keys.map(k => lookup.get(k)).filter(Boolean)
    const doomedFolderIds = blockedFor(doomed)
    const ok = await run(async () => {
      // A folder inside another selected folder goes with its parent.
      for (const it of doomed.filter(i => i.kind === 'folder')) {
        if (it.data.parent_id && doomedFolderIds.has(it.data.parent_id)) continue
        await deleteFolder(it.data, tree.folders, tree.files)
      }
      for (const it of doomed.filter(i => i.kind === 'file')) {
        if (it.data.folder_id && doomedFolderIds.has(it.data.folder_id)) continue
        await deleteFile(it.data, tree.folders)
      }
      await changed()
    })
    setDeleteKeysDialog(null)
    setSelected(new Set())
    if (ok) setNotice({ type: 'success', text: `Deleted ${doomed.length} item${doomed.length === 1 ? '' : 's'}.` })
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  // Spread onto anything that can receive a drop. `hiKey` is the highlight id.
  const dropProps = useCallback((targetId, hiKey) => {
    if (!canManage) return {}
    const key = hiKey ?? 'content'
    return {
      onDragOver: e => {
        if (!isOurDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = hasFiles(e) ? 'copy' : 'move'
        setDropKey(k => (k === key ? k : key))
      },
      onDragLeave: e => {
        if (e.currentTarget.contains(e.relatedTarget)) return
        setDropKey(k => (k === key ? null : k))
      },
      onDrop: e => {
        if (!isOurDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        setDropKey(null)
        if (hasFiles(e)) {
          const { files, skippedFolders } = filesFromDrop(e)
          if (skippedFolders) setNotice({ type: 'error', text: 'Folders can\'t be dropped in. Create a folder here, open it, then drop the files inside.' })
          if (files.length) doUpload(files, targetId ?? null)
        } else {
          try {
            const keys = JSON.parse(e.dataTransfer.getData(DND_MIME))
            moveItems(keys, targetId ?? null)
          } catch { /* not ours */ }
        }
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, tree, cur, lookup])

  function onItemDragStart(e, item) {
    const keys = liveSelected.has(item.key) ? [...liveSelected] : [item.key]
    if (!liveSelected.has(item.key)) selectOnly(item.key)
    e.dataTransfer.setData(DND_MIME, JSON.stringify(keys))
    e.dataTransfer.effectAllowed = 'move'
  }

  // ── Menus ──────────────────────────────────────────────────────────────────
  function openMenuFor(e, item) {
    e.preventDefault()
    e.stopPropagation()
    const keys = liveSelected.has(item.key) ? [...liveSelected] : [item.key]
    if (!liveSelected.has(item.key)) selectOnly(item.key)
    const rect = e.currentTarget.getBoundingClientRect?.()
    const fromButton = e.type === 'click' && rect
    setMenu({ x: fromButton ? rect.right - 190 : e.clientX, y: fromButton ? rect.bottom + 2 : e.clientY, keys })
  }

  function openBackgroundMenu(e) {
    if (!canManage) return
    e.preventDefault()
    setSelected(new Set())
    setMenu({ x: e.clientX, y: e.clientY, keys: null })
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = e => { if (e.key === 'Escape') close() }
    // Deferred so the click that opened the menu can't also close it.
    const arm = setTimeout(() => window.addEventListener('click', close), 0)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(arm)
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // What the right-click / ⋯ menu shows. Plain data; runMenuAction does the work.
  function menuEntries() {
    if (!menu) return []
    if (!menu.keys) {
      return [
        { id: 'new-folder', label: 'New folder', icon: FolderPlus },
        { id: 'upload', label: 'Upload files', icon: Upload },
        { separator: true },
        { id: 'refresh', label: 'Refresh', icon: RefreshCw },
      ]
    }
    const picked = menu.keys.map(k => lookup.get(k)).filter(Boolean)
    const one = picked.length === 1 ? picked[0] : null
    const entries = []
    if (one) entries.push({ id: 'open', label: 'Open', icon: one.kind === 'folder' ? FolderOpen : Eye })
    if (one?.kind === 'file') entries.push({ id: 'download', label: 'Download', icon: Download })
    if (one) entries.push({ id: 'properties', label: 'Properties', icon: Info })
    if (canManage) {
      if (entries.length) entries.push({ separator: true })
      if (one) entries.push({ id: 'rename', label: 'Rename', icon: Pencil })
      entries.push({ id: 'move', label: 'Move to…', icon: FolderInput })
      entries.push({ id: 'delete', label: 'Delete', icon: Trash2, danger: true })
    }
    return entries
  }

  function runMenuAction(id) {
    const keys = menu?.keys
    setMenu(null)
    const picked = (keys || []).map(k => lookup.get(k)).filter(Boolean)
    const one = picked.length === 1 ? picked[0] : null
    if (id === 'new-folder') startNewFolder()
    else if (id === 'upload') fileInputRef.current?.click()
    else if (id === 'refresh') reload()
    else if (id === 'open' && one) openItem(one)
    else if (id === 'download' && one) download(one.data)
    else if (id === 'properties') setShowDetails(true)
    else if (id === 'rename' && one) startRename(one)
    else if (id === 'move') setMoveKeysDialog(keys)
    else if (id === 'delete') setDeleteKeysDialog(keys)
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.target.closest?.('input, textarea, select')) return
    const meta = e.ctrlKey || e.metaKey
    const keys = items.map(i => i.key)
    if (meta && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelected(new Set(keys))
    } else if (e.key === 'Delete' && canManage && liveSelected.size) {
      e.preventDefault()
      setDeleteKeysDialog([...liveSelected])
    } else if (e.key === 'F2' && canManage && selectedItems.length === 1) {
      e.preventDefault()
      startRename(selectedItems[0])
    } else if (e.key === 'Enter' && selectedItems.length === 1) {
      e.preventDefault()
      openItem(selectedItems[0])
    } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault()
      goUp()
    } else if (e.key === 'Escape') {
      setSelected(new Set())
    } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key) && keys.length) {
      e.preventDefault()
      const at = focusKey ? keys.indexOf(focusKey) : -1
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
      const next = keys[Math.max(0, Math.min(keys.length - 1, at === -1 ? 0 : at + (forward ? 1 : -1)))]
      if (e.shiftKey && focusKey) {
        const a = keys.indexOf(focusKey)
        const b = keys.indexOf(next)
        setSelected(new Set(keys.slice(Math.min(a, b), Math.max(a, b) + 1)))
        setFocusKey(next)
      } else {
        selectOnly(next)
      }
    }
  }

  function toggleSort(key) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  function changeView(v) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const previewIndex = previewId ? viewFiles.findIndex(f => f.id === previewId) : -1
  const moveBlocked  = moveKeysDialog ? blockedFor(moveKeysDialog.map(k => lookup.get(k)).filter(Boolean)) : new Set()
  const deleteItemsPicked = deleteKeysDialog ? deleteKeysDialog.map(k => lookup.get(k)).filter(Boolean) : []
  const menuList = menuEntries()

  const ribbonBtn = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors disabled:opacity-50'

  if (loading) return <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-400">Loading documents…</div>
  if (loadError) return <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-red-600">{loadError}</div>

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
      {/* Address bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
        <button type="button" onClick={goUp} disabled={!cur} aria-label="Up one level" title="Up one level (Backspace)"
          className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent shrink-0">
          <ArrowUp size={16} />
        </button>
        <nav aria-label="Location" className="flex-1 min-w-0 flex items-center overflow-x-auto border border-gray-200 rounded px-1 py-0.5 text-sm">
          <button type="button" onClick={() => openFolder(null)} {...dropProps(null, 'crumb-root')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-gray-100 ${dropKey === 'crumb-root' ? 'ring-2 ring-blue-400' : ''} ${cur ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
            <HardDrive size={14} className="text-gray-500" /> {rootLabel}
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center shrink-0">
              <ChevronRight size={14} className="text-gray-400" />
              <button type="button" onClick={() => openFolder(c.id)} {...dropProps(c.id, `crumb-${c.id}`)}
                className={`px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-gray-100 ${dropKey === `crumb-${c.id}` ? 'ring-2 ring-blue-400' : ''} ${i === crumbs.length - 1 ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="relative hidden sm:block w-48 shrink-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${cur ? crumbs[crumbs.length - 1].name : rootLabel}`}
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Ribbon */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
        {canManage && (
          <>
            <button type="button" onClick={startNewFolder} disabled={busy || !!uploading} className={`${ribbonBtn} bg-white border-gray-300 text-gray-700 hover:bg-gray-100`}>
              <FolderPlus size={14} /> New folder
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy || !!uploading} className={`${ribbonBtn} bg-blue-600 border-blue-600 text-white hover:bg-blue-700`}>
              <Upload size={14} />
              {uploading ? `Uploading ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}…` : 'Upload'}
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={e => { const list = [...e.target.files]; e.target.value = ''; doUpload(list) }} />
            {selectedItems.length > 0 && (
              <>
                <span className="w-px h-5 bg-gray-300 mx-1 hidden sm:block" />
                {selectedItems.length === 1 && (
                  <button type="button" onClick={() => startRename(selectedItems[0])} disabled={busy} className={`${ribbonBtn} bg-white border-gray-300 text-gray-700 hover:bg-gray-100`}>
                    <Pencil size={14} /> <span className="hidden sm:inline">Rename</span>
                  </button>
                )}
                <button type="button" onClick={() => setMoveKeysDialog([...liveSelected])} disabled={busy} className={`${ribbonBtn} bg-white border-gray-300 text-gray-700 hover:bg-gray-100`}>
                  <FolderInput size={14} /> <span className="hidden sm:inline">Move to</span>
                </button>
                <button type="button" onClick={() => setDeleteKeysDialog([...liveSelected])} disabled={busy} className={`${ribbonBtn} bg-white border-red-200 text-red-600 hover:bg-red-50`}>
                  <Trash2 size={14} /> <span className="hidden sm:inline">Delete</span>
                </button>
              </>
            )}
          </>
        )}
        {selectedItems.length === 1 && selectedItems[0].kind === 'file' && (
          <button type="button" onClick={() => download(selectedItems[0].data)} className={`${ribbonBtn} bg-white border-gray-300 text-gray-700 hover:bg-gray-100`}>
            <Download size={14} /> <span className="hidden sm:inline">Download</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="sm:hidden relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search"
              className="w-32 pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
          </div>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <ArrowUpDown size={13} />
            <select value={sort.key} onChange={e => setSort({ key: e.target.value, dir: 'asc' })} aria-label="Sort by"
              className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700">
              <option value="name">Name</option>
              <option value="modified">Date modified</option>
              <option value="type">Type</option>
              <option value="size">Size</option>
            </select>
          </label>
          <div className="flex rounded border border-gray-200 overflow-hidden bg-white">
            <button type="button" onClick={() => changeView('grid')} aria-label="Large icons" title="Large icons"
              className={`p-1.5 ${view === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}><LayoutGrid size={15} /></button>
            <button type="button" onClick={() => changeView('list')} aria-label="Details" title="Details"
              className={`p-1.5 ${view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}><List size={15} /></button>
          </div>
          <button type="button" onClick={() => setShowDetails(v => !v)} aria-label="Details pane" title="Details pane" aria-pressed={showDetails}
            className={`p-1.5 rounded border ${showDetails ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
            <Info size={15} />
          </button>
        </div>
      </div>

      {notice && (
        <div className={`flex items-start gap-2 px-3 py-2 text-sm border-b ${notice.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {notice.type === 'error' ? <CircleAlert size={16} className="mt-0.5 shrink-0" /> : <CircleCheck size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1 min-w-0 break-words">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Panes */}
      <div className="flex flex-col lg:flex-row min-h-[420px] md:h-[62vh]">
        <aside className="hidden md:block w-56 shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50/60 px-1">
          <FolderTree folders={tree.folders} currentId={cur} ancestorIds={ancestorIds} onOpen={openFolder} dropProps={dropProps} dropKey={dropKey} rootLabel={rootLabel} />
        </aside>

        <div
          ref={contentRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onClick={() => { setSelected(new Set()); setFocusKey(null) }}
          onContextMenu={openBackgroundMenu}
          {...dropProps(cur)}
          className={`@container flex-1 min-w-0 overflow-auto p-2 outline-none relative ${dropKey === 'content' ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
        >
          {view === 'list' && items.length + (draftFolder ? 1 : 0) > 0 && (
            <div className="hidden @xl:grid grid-cols-[minmax(0,1fr)_9.5rem_8rem_5.5rem_2rem] gap-2 px-2 pb-1 text-xs font-semibold text-gray-500 border-b border-gray-100 sticky top-0 bg-white z-[1]">
              {[['name', 'Name'], ['modified', 'Date modified'], ['type', 'Type'], ['size', 'Size']].map(([key, label]) => (
                <button key={key} type="button" onClick={e => { e.stopPropagation(); toggleSort(key) }} className={`text-left hover:text-gray-800 ${key === 'size' ? 'text-right' : ''}`}>
                  {label}{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              ))}
              <span />
            </div>
          )}

          {items.length === 0 && !draftFolder ? (
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-gray-400 select-none px-4">
              {q ? <Search size={40} className="mb-2" /> : <FolderOpen size={44} className="mb-2" />}
              <p className="text-sm font-medium text-gray-500">{q ? `No results for "${query.trim()}".` : 'This folder is empty.'}</p>
              {!q && canManage && <p className="text-xs mt-1">Drag files here, or use Upload.</p>}
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
              {draftFolder && (
                <div className="flex flex-col items-center p-2 rounded border border-blue-300 bg-blue-50">
                  <div className="h-20 flex items-center justify-center"><FolderIcon size={56} /></div>
                  <NameInput initial="New folder" onCommit={commitNewFolder} onCancel={() => setDraftFolder(false)} className="mt-1 w-full text-center" />
                </div>
              )}
              {items.map(item => (
                <div
                  key={item.key}
                  data-key={item.key}
                  draggable={canManage && renaming !== item.key}
                  onDragStart={e => onItemDragStart(e, item)}
                  onDragEnd={() => setDropKey(null)}
                  onClick={e => onItemClick(e, item)}
                  onDoubleClick={e => { e.stopPropagation(); openItem(item) }}
                  onContextMenu={e => openMenuFor(e, item)}
                  {...(item.kind === 'folder' ? dropProps(item.id, item.id) : {})}
                  className={`group relative flex flex-col items-center p-2 rounded border cursor-default select-none transition-colors ${
                    liveSelected.has(item.key) ? 'bg-blue-50 border-blue-300' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                  } ${dropKey === item.id ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
                >
                  <div className="h-20 w-full flex items-center justify-center overflow-hidden rounded">
                    <Thumb item={item} url={item.kind === 'file' ? cachedUrl(item.data.storage_path) : null} />
                  </div>
                  <div className="mt-1 w-full text-center">
                    {renaming === item.key ? (
                      <NameInput initial={item.name} isFile={item.kind === 'file'} onCommit={v => commitRename(item, v)} onCancel={() => setRenaming(null)} className="w-full text-center" />
                    ) : (
                      <>
                        <p className="text-xs text-gray-800 break-words line-clamp-2" title={item.name}>{item.name}</p>
                        {q && <p className="text-[10px] text-gray-400 truncate">{folderPath(tree.folders, parentOf(item), rootLabel)}</p>}
                      </>
                    )}
                  </div>
                  <button type="button" aria-label="More actions" onClick={e => openMenuFor(e, item)}
                    className="absolute top-1 right-1 p-1 rounded bg-white/90 border border-gray-200 text-gray-600 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100">
                    <EllipsisVertical size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {draftFolder && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-blue-300 bg-blue-50">
                  <FolderIcon size={20} />
                  <NameInput initial="New folder" onCommit={commitNewFolder} onCancel={() => setDraftFolder(false)} className="flex-1" />
                </div>
              )}
              {items.map(item => (
                <div
                  key={item.key}
                  data-key={item.key}
                  draggable={canManage && renaming !== item.key}
                  onDragStart={e => onItemDragStart(e, item)}
                  onDragEnd={() => setDropKey(null)}
                  onClick={e => onItemClick(e, item)}
                  onDoubleClick={e => { e.stopPropagation(); openItem(item) }}
                  onContextMenu={e => openMenuFor(e, item)}
                  {...(item.kind === 'folder' ? dropProps(item.id, item.id) : {})}
                  className={`group grid grid-cols-[minmax(0,1fr)_2rem] @xl:grid-cols-[minmax(0,1fr)_9.5rem_8rem_5.5rem_2rem] items-center gap-2 px-2 py-1.5 rounded cursor-default select-none transition-colors ${
                    liveSelected.has(item.key) ? 'bg-blue-50' : 'hover:bg-gray-50'
                  } ${dropKey === item.id ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.kind === 'folder' ? <FolderIcon size={20} /> : <FileGlyph file={item.data} size={20} />}
                    <div className="min-w-0 flex-1">
                      {renaming === item.key ? (
                        <NameInput initial={item.name} isFile={item.kind === 'file'} onCommit={v => commitRename(item, v)} onCancel={() => setRenaming(null)} className="w-full" />
                      ) : (
                        <>
                          <p className="text-sm text-gray-800 truncate" title={item.name}>{item.name}</p>
                          <p className="text-xs text-gray-400 truncate @xl:hidden">
                            {item.kind === 'file' ? `${formatBytes(item.size)} · ` : ''}{formatDateTime(item.modified)}
                          </p>
                          {q && <p className="text-[11px] text-gray-400 truncate">{folderPath(tree.folders, parentOf(item), rootLabel)}</p>}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="hidden @xl:block text-xs text-gray-500 truncate">{formatDateTime(item.modified)}</span>
                  <span className="hidden @xl:block text-xs text-gray-500 truncate">{item.type}</span>
                  <span className="hidden @xl:block text-xs text-gray-500 text-right">{item.kind === 'file' ? formatBytes(item.size) : ''}</span>
                  <button type="button" aria-label="More actions" onClick={e => openMenuFor(e, item)}
                    className="p-1 rounded text-gray-500 hover:bg-gray-200 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100">
                    <EllipsisVertical size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {showDetails && (
          <aside className="lg:w-64 shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto p-4 bg-gray-50/60">
            <DetailsPane selectedItems={selectedItems} tree={tree} cur={cur} crumbs={crumbs} rootLabel={rootLabel}
              urlOf={file => cachedUrl(file.storage_path)} />
          </aside>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
        <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
        {selectedItems.length > 0 && (
          <span>{selectedItems.length} selected{selectedBytes ? ` · ${formatBytes(selectedBytes)}` : ''}</span>
        )}
        {!canManage && <span className="ml-auto">View only. Ask an admin to add or change documents.</span>}
      </div>

      {/* Context menu */}
      {menu && menuList.length > 0 && (
        <div
          role="menu"
          onClick={e => e.stopPropagation()}
          style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 200)), top: Math.max(8, Math.min(menu.y, window.innerHeight - (menuList.length * 34 + 16))) }}
          className="fixed z-50 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1"
        >
          {menuList.map((entry, i) => entry.separator ? (
            <div key={i} className="my-1 border-t border-gray-100" />
          ) : (
            <button key={entry.id} type="button" role="menuitem" onClick={() => runMenuAction(entry.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left ${entry.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'}`}>
              <entry.icon size={15} /> {entry.label}
            </button>
          ))}
        </div>
      )}

      {previewIndex >= 0 && (
        <PreviewModal
          files={viewFiles}
          index={previewIndex}
          resolveUrl={resolveUrl}
          onDownload={download}
          onIndex={i => setPreviewId(viewFiles[i].id)}
          onClose={() => setPreviewId(null)}
        />
      )}

      {moveKeysDialog && (
        <MoveDialog
          folders={tree.folders}
          blockedIds={moveBlocked}
          count={moveKeysDialog.length}
          busy={busy}
          onMove={target => moveItems(moveKeysDialog, target)}
          onCancel={() => setMoveKeysDialog(null)}
        />
      )}

      {deleteKeysDialog && (
        <DeleteDialog items={deleteItemsPicked} tree={tree} busy={busy} onConfirm={() => deleteItems(deleteKeysDialog)} onCancel={() => setDeleteKeysDialog(null)} />
      )}
    </div>
  )
}

// Inline name editor (rename / new folder): Enter or clicking away saves,
// Escape cancels. For files only the part before the extension is pre-selected.
function NameInput({ initial, isFile, onCommit, onCancel, className = '' }) {
  const ref = useRef(null)
  const done = useRef(false)
  const [value, setValue] = useState(initial)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = isFile ? initial.lastIndexOf('.') : -1
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial, isFile])

  function finish(save) {
    if (done.current) return
    done.current = true
    if (save) onCommit(value)
    else onCancel()
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={e => setValue(e.target.value)}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
      maxLength={255}
      className={`text-xs px-1 py-0.5 border border-blue-500 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
    />
  )
}

function DeleteDialog({ items, tree, busy, onConfirm, onCancel }) {
  const folders = items.filter(i => i.kind === 'folder')
  // What goes with the folders: every file and sub-folder inside them.
  const inside = new Set()
  for (const f of folders) {
    inside.add(f.id)
    for (const id of subtreeIds(tree.folders, f.id)) inside.add(id)
  }
  const nestedFiles = tree.files.filter(f => f.folder_id && inside.has(f.folder_id)).length
  const nestedFolders = inside.size - folders.length

  const title = items.length === 1 ? `Delete "${items[0].name}"?` : `Delete ${items.length} items?`
  const extras = []
  if (folders.length && nestedFiles) extras.push(`${nestedFiles} file${nestedFiles === 1 ? '' : 's'}`)
  if (folders.length && nestedFolders) extras.push(`${nestedFolders} folder${nestedFolders === 1 ? '' : 's'}`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 space-y-1">
          <h2 className="text-sm font-bold text-gray-900 break-words">{title}</h2>
          <p className="text-sm text-gray-500">
            {extras.length ? `This also deletes everything inside: ${extras.join(' and ')}. ` : ''}
            There is no recycle bin, so this can't be undone. The deletion will be recorded in the activity log.
          </p>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button type="button" disabled={busy} onClick={onConfirm} className="flex-1 bg-red-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
            {busy ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function DetailsPane({ selectedItems, tree, cur, crumbs, rootLabel, urlOf }) {
  if (selectedItems.length === 0) {
    const here = cur ? crumbs[crumbs.length - 1].name : rootLabel
    return (
      <div className="space-y-2 text-sm">
        <FolderIcon size={48} />
        <p className="font-semibold text-gray-800 break-words">{here}</p>
        <p className="text-xs text-gray-500">Select a file or folder to see its details.</p>
      </div>
    )
  }
  if (selectedItems.length > 1) {
    const bytes = selectedItems.reduce((s, i) => s + (i.kind === 'file' ? i.size || 0 : 0), 0)
    return (
      <div className="space-y-1 text-sm">
        <p className="font-semibold text-gray-800">{selectedItems.length} items selected</p>
        {bytes > 0 && <p className="text-xs text-gray-500">{formatBytes(bytes)}</p>}
      </div>
    )
  }

  const item = selectedItems[0]
  const rows = [['Type', item.type]]
  if (item.kind === 'file') {
    rows.push(['Size', formatBytes(item.size)])
  } else {
    const inside = subtreeIds(tree.folders, item.id)
    const ids = new Set([item.id, ...inside])
    const fileCount = tree.files.filter(f => f.folder_id && ids.has(f.folder_id))
    rows.push(['Contains', `${fileCount.length} file${fileCount.length === 1 ? '' : 's'}, ${inside.size} folder${inside.size === 1 ? '' : 's'}`])
    rows.push(['Size', formatBytes(fileCount.reduce((s, f) => s + (f.file_size || 0), 0))])
  }
  rows.push(['Location', folderPath(tree.folders, parentOf(item), rootLabel)])
  if (item.kind === 'file') rows.push(['Added by', item.data.uploader?.full_name || '—'])
  rows.push([item.kind === 'file' ? 'Added' : 'Created', formatDateTime(item.data.created_at)])
  rows.push(['Modified', formatDateTime(item.modified)])

  return (
    <div className="space-y-3">
      <div className="h-28 rounded overflow-hidden bg-white border border-gray-200 flex items-center justify-center">
        <Thumb item={item} url={item.kind === 'file' ? urlOf(item.data) : null} size={56} />
      </div>
      <p className="text-sm font-semibold text-gray-800 break-words">{item.name}</p>
      <dl className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
            <dd className="text-xs text-gray-700 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
