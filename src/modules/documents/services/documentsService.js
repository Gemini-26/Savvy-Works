import { supabase } from '../../../lib/supabase'
import { getCurrentProfile } from '../../../services/authService'

// One file explorer, three kinds of owner:
//   { kind: 'profile',     id }   a person with a login   (they can read their own)
//   { kind: 'team_member', id }   a labourer/helper        (admins only)
//   COMPANY_OWNER                 the company's own files  (admins only)
// In the tables that is profile_id / team_member_id / neither.
const BUCKET = 'profile-documents'
const URL_TTL = 3600

export const COMPANY_OWNER = { kind: 'company', id: null }
export const profileOwner    = id => ({ kind: 'profile', id })
export const teamMemberOwner = id => ({ kind: 'team_member', id })

function ownerColumns(owner) {
  return {
    profile_id:     owner.kind === 'profile' ? owner.id : null,
    team_member_id: owner.kind === 'team_member' ? owner.id : null,
  }
}

// The owner a stored row belongs to (rows carry profile_id / team_member_id).
function ownerOfRow(row) {
  if (row.profile_id) return profileOwner(row.profile_id)
  if (row.team_member_id) return teamMemberOwner(row.team_member_id)
  return COMPANY_OWNER
}

// Narrows a query to one owner's rows (RLS already limits it to the right company).
function forOwner(query, owner) {
  if (owner.kind === 'profile') return query.eq('profile_id', owner.id)
  if (owner.kind === 'team_member') return query.eq('team_member_id', owner.id)
  return query.is('profile_id', null).is('team_member_id', null)
}

// What the top of the tree is called in the log (the explorer shows the same).
export const rootLabelFor = owner => (owner.kind === 'company' ? 'Company Documents' : owner.kind === 'team_member' ? 'Documents' : 'My Documents')
const pathFor = (owner, folders, id) => folderPath(folders, id, rootLabelFor(owner))

// Second segment of the storage path: {company}/{owner}/{file}.
const storageSegment = owner => (owner.kind === 'company' ? 'company' : owner.id)

// ── Loading ──────────────────────────────────────────────────────────────────

// Every folder and file an owner has, in one go. The set is small, so the
// explorer filters/sorts/searches it in memory instead of hitting the database
// on every click.
export async function fetchDocumentTree(owner) {
  const [foldersRes, filesRes] = await Promise.all([
    forOwner(supabase.from('document_folders').select('*'), owner).order('name'),
    forOwner(
      supabase.from('document_files').select('*, uploader:profiles!document_files_uploaded_by_fkey(full_name)'),
      owner,
    ).order('file_name'),
  ])
  if (foldersRes.error) throw foldersRes.error
  if (filesRes.error) throw filesRes.error
  return { folders: foldersRes.data || [], files: filesRes.data || [] }
}

export async function fetchDocumentActivity(owner, limit = 300) {
  const { data, error } = await forOwner(supabase.from('document_activity').select('*'), owner)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// ── Audit log ────────────────────────────────────────────────────────────────

// Best-effort: a logging hiccup must never undo or block the real action.
// The actor name is stamped by the database from the session, not from here.
export async function logDocumentActivity(owner, action, detail = null) {
  const { error } = await supabase
    .from('document_activity')
    .insert([{ ...ownerColumns(owner), action, detail }])
  if (error) console.warn('Could not write document activity', error)
}

// ── Signed links ─────────────────────────────────────────────────────────────

// Links for many files in one request (thumbnails / previews).
// Returns a Map of storage_path -> url.
export async function getSignedUrls(files) {
  if (!files.length) return new Map()
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(files.map(f => f.storage_path), URL_TTL)
  return new Map((data ?? []).filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]))
}

// A link that makes the browser save the file under its display name.
export async function getDownloadUrl(file) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 120, { download: file.file_name })
  if (error) throw error
  return data.signedUrl
}

// The file's bytes. Used for PDFs: storage serves its links with a sandboxing
// header that stops browsers drawing a PDF inline, but a blob we hold ourselves
// shows fine.
export async function downloadBlob(file) {
  const { data, error } = await supabase.storage.from(BUCKET).download(file.storage_path)
  if (error) throw error
  return data
}

// ── Names ────────────────────────────────────────────────────────────────────

const BAD_CHARS = /[\\/:*?"<>|]/

export function validateName(name) {
  const clean = (name || '').trim()
  if (!clean) return 'Type a name.'
  if (clean === '.' || clean === '..') return 'That name is not allowed.'
  if (BAD_CHARS.test(clean)) return 'A name can\'t contain any of these: \\ / : * ? " < > |'
  if (clean.length > 255) return 'That name is too long.'
  return null
}

// "scan.pdf" -> "scan (2).pdf" when the name is taken, like Windows does.
export function uniqueName(name, takenNames) {
  const taken = new Set([...takenNames].map(n => n.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext  = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; ; i += 1) {
    const candidate = `${base} (${i})${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

// The names already used inside one folder (files and folders share a namespace).
export function namesInFolder(folders, files, folderId) {
  return [
    ...folders.filter(f => (f.parent_id ?? null) === (folderId ?? null)).map(f => f.name),
    ...files.filter(f => (f.folder_id ?? null) === (folderId ?? null)).map(f => f.file_name),
  ]
}

// "ID / Front" — where something lives, for the log and the details pane.
export function folderPath(folders, folderId, rootLabel = 'My Documents') {
  const byId = new Map(folders.map(f => [f.id, f]))
  const parts = []
  let cur = folderId ? byId.get(folderId) : null
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parent_id ? byId.get(cur.parent_id) : null
  }
  return parts.length ? parts.join(' / ') : rootLabel
}

// ── Folders ──────────────────────────────────────────────────────────────────

export async function createFolder(owner, parentId, name, folders) {
  const { data, error } = await supabase
    .from('document_folders')
    .insert([{ ...ownerColumns(owner), parent_id: parentId || null, name: name.trim() }])
    .select()
    .single()
  if (error) throw friendly(error)
  await logDocumentActivity(owner, 'folder_created', `Created folder "${data.name}" in ${pathFor(owner, folders, parentId)}`)
  return data
}

export async function renameFolder(folder, name, folders) {
  const { error } = await supabase.from('document_folders').update({ name: name.trim() }).eq('id', folder.id)
  if (error) throw friendly(error)
  await logDocumentActivity(ownerOfRow(folder), 'folder_renamed', `Renamed folder "${folder.name}" to "${name.trim()}" in ${pathFor(ownerOfRow(folder), folders, folder.parent_id)}`)
}

export async function moveFolder(folder, newParentId, folders) {
  const { error } = await supabase.from('document_folders').update({ parent_id: newParentId || null }).eq('id', folder.id)
  if (error) throw friendly(error)
  await logDocumentActivity(ownerOfRow(folder), 'folder_moved', `Moved folder "${folder.name}" from ${pathFor(ownerOfRow(folder), folders, folder.parent_id)} to ${pathFor(ownerOfRow(folder), folders, newParentId)}`)
}

// Removes the folder and everything inside it. The database rows go first (they
// cascade); storage clean-up after, so a failure can leave an invisible orphan
// object but never a file row pointing at nothing.
export async function deleteFolder(folder, folders, files) {
  const doomedFolderIds = new Set([folder.id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parent_id && doomedFolderIds.has(f.parent_id) && !doomedFolderIds.has(f.id)) {
        doomedFolderIds.add(f.id)
        grew = true
      }
    }
  }
  const doomedFiles = files.filter(f => f.folder_id && doomedFolderIds.has(f.folder_id))

  const { error } = await supabase.from('document_folders').delete().eq('id', folder.id)
  if (error) throw friendly(error)

  if (doomedFiles.length) {
    await supabase.storage.from(BUCKET).remove(doomedFiles.map(f => f.storage_path)).catch(() => {})
  }
  const extra = doomedFiles.length ? ` (with ${doomedFiles.length} file${doomedFiles.length === 1 ? '' : 's'} inside)` : ''
  await logDocumentActivity(ownerOfRow(folder), 'folder_deleted', `Deleted folder "${folder.name}"${extra} from ${pathFor(ownerOfRow(folder), folders, folder.parent_id)}`)
}

// ── Files ────────────────────────────────────────────────────────────────────

// Uploads files into one folder, three at a time. Each file is kept exactly as
// it was (no recompression — an ID photo has to stay legible). Resolves to
// { uploaded, failed } so one bad file doesn't lose the rest of the batch.
export async function uploadFiles(owner, folderId, fileList, folders, existingFiles, onProgress) {
  const list = [...fileList]
  if (!list.length) return { uploaded: [], failed: [] }
  const me = await getCurrentProfile()
  if (!me?.company_id) throw new Error('Not signed in.')

  const taken = namesInFolder(folders, existingFiles, folderId)
  const queue = list.map(file => {
    const name = uniqueName(file.name, taken)
    taken.push(name)
    return { file, name }
  })
  const where = pathFor(owner, folders, folderId)

  let done = 0
  const uploaded = []
  const failed = []

  async function worker() {
    while (queue.length) {
      const { file, name } = queue.shift()
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${me.company_id}/${storageSegment(owner)}/${crypto.randomUUID()}_${safe}`
      try {
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { contentType: file.type || undefined, cacheControl: '3600' })
        if (upErr) throw upErr

        const { data, error: insErr } = await supabase
          .from('document_files')
          .insert([{
            ...ownerColumns(owner),
            folder_id:    folderId || null,
            storage_path: storagePath,
            file_name:    name,
            file_size:    file.size,
            mime_type:    file.type || null,
          }])
          .select('*, uploader:profiles!document_files_uploaded_by_fkey(full_name)')
          .single()
        if (insErr) {
          await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
          throw insErr
        }
        uploaded.push(data)
        await logDocumentActivity(owner, 'file_uploaded', `Uploaded "${name}" (${formatBytes(file.size)}) to ${where}`)
      } catch (err) {
        failed.push({ file, error: friendly(err) })
      } finally {
        done += 1
        onProgress?.(done, list.length)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker))
  return { uploaded, failed }
}

export async function renameFile(file, name, folders) {
  const { error } = await supabase.from('document_files').update({ file_name: name.trim() }).eq('id', file.id)
  if (error) throw friendly(error)
  await logDocumentActivity(ownerOfRow(file), 'file_renamed', `Renamed "${file.file_name}" to "${name.trim()}" in ${pathFor(ownerOfRow(file), folders, file.folder_id)}`)
}

export async function moveFile(file, newFolderId, folders) {
  const { error } = await supabase.from('document_files').update({ folder_id: newFolderId || null }).eq('id', file.id)
  if (error) throw friendly(error)
  await logDocumentActivity(ownerOfRow(file), 'file_moved', `Moved "${file.file_name}" from ${pathFor(ownerOfRow(file), folders, file.folder_id)} to ${pathFor(ownerOfRow(file), folders, newFolderId)}`)
}

export async function deleteFile(file, folders) {
  const { error } = await supabase.from('document_files').delete().eq('id', file.id)
  if (error) throw friendly(error)
  await supabase.storage.from(BUCKET).remove([file.storage_path]).catch(() => {})
  await logDocumentActivity(ownerOfRow(file), 'file_deleted', `Deleted "${file.file_name}" from ${pathFor(ownerOfRow(file), folders, file.folder_id)}`)
}

export async function logDownload(file, folders) {
  await logDocumentActivity(ownerOfRow(file), 'file_downloaded', `Downloaded "${file.file_name}" from ${pathFor(ownerOfRow(file), folders, file.folder_id)}`)
}

// ── Clean-up when a person is deleted ────────────────────────────────────────

// The storage paths of everything an owner has. Deleting a person cascades
// their rows away in the database, but the stored files would be left behind
// for good, so the caller takes the list first and removes the objects after.
export async function listOwnerStoragePaths(owner) {
  const { data, error } = await forOwner(supabase.from('document_files').select('storage_path'), owner)
  if (error) throw error
  return (data || []).map(f => f.storage_path)
}

export async function removeStoredFiles(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100)).catch(() => {})
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// Turns the database/storage's raw errors into something a person can act on.
function friendly(err) {
  const msg = err?.message || String(err)
  if (err?.code === '23505' || /duplicate key/i.test(msg)) {
    return new Error('Something with that name already exists here.')
  }
  if (/maximum allowed size|payload too large|exceeded/i.test(msg)) {
    return new Error('That file is bigger than the storage limit allows.')
  }
  if (/row-level security|violates row|not authorized|permission denied/i.test(msg)) {
    return new Error('You don\'t have permission to do that.')
  }
  return err instanceof Error ? err : new Error(msg)
}
