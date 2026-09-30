import { useEffect, useRef, useState } from 'react'
import { Camera, Images } from 'lucide-react'

// Camera button that offers "Take with camera" (opens the phone camera
// straight away) or "Upload from gallery" (opens the gallery, several photos
// can be picked at once). Calls onFiles(File[]) with whatever was chosen.
//
// `children` is the button's content; `className` styles the button.
export default function PhotoPicker({ onFiles, disabled, className, children, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('touchstart', onClickOutside)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('touchstart', onClickOutside)
    }
  }, [open])

  function pick(ref) {
    setOpen(false)
    ref.current?.click()
  }

  function handleChange(e) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length) onFiles(files)
  }

  const itemCls = 'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 text-left'

  return (
    <div className="relative inline-block" ref={boxRef}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} className={className}>
        {children}
      </button>

      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden`}>
          <button type="button" onClick={() => pick(cameraRef)} className={itemCls}>
            <Camera size={18} className="text-blue-600" /> Take with camera
          </button>
          <button type="button" onClick={() => pick(galleryRef)} className={`${itemCls} border-t border-gray-100`}>
            <Images size={18} className="text-blue-600" />
            <span>Upload from gallery<span className="block text-xs font-normal text-gray-400">Select one or more photos</span></span>
          </button>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handleChange} />
    </div>
  )
}
