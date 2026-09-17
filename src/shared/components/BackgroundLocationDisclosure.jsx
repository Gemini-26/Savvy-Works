import { MapPin, Lock, Clock, ShieldCheck } from 'lucide-react'

// Google Play requires a "prominent disclosure" — shown before the background
// location prompt, not after — that names the data, says it keeps being
// collected while the app is closed, explains why, and takes an explicit yes.
// Removing this screen or burying it inside a permission prompt is the usual
// reason a background-location app gets rejected, so it stays a hard gate in
// front of requestBackgroundLocationFlow().
export default function BackgroundLocationDisclosure({ onAccept, onDecline, busy }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-3">
            <MapPin size={20} className="text-blue-600" />
          </div>
          <h2 className="text-base font-bold text-gray-900">Share location while on shift</h2>
          <p className="text-sm text-gray-500 mt-1">
            Android calls this “Allow all the time”. Here is exactly what it does.
          </p>
        </div>

        <div className="px-5 space-y-3 pb-4">
          <div className="flex gap-3">
            <Lock size={16} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              Savvy Works collects this device’s location and sends it to your company’s Savvy Works
              account <strong className="text-gray-900">even when the app is closed or your phone is locked</strong>.
            </p>
          </div>
          <div className="flex gap-3">
            <Clock size={16} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              It is used to show your office which technician is nearest to a job, to confirm time on
              site, and to back up your timesheet.
            </p>
          </div>
          <div className="flex gap-3">
            <ShieldCheck size={16} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              It only runs while you are <strong className="text-gray-900">clocked in</strong> and
              “Share my location” is switched on. Clock out, or switch it off, and it stops
              immediately. A notification stays in your shade the whole time it is running.
            </p>
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-600"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
