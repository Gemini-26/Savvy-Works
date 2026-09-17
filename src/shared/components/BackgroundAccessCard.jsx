import { useState } from 'react'
import { AlertTriangle, Battery, Bell, Check, MapPin, Navigation, Settings, ShieldCheck } from 'lucide-react'
import { useAppPermissions } from '../../hooks/useAppPermissions'
import BackgroundLocationDisclosure from './BackgroundLocationDisclosure'

function StateBadge({ state }) {
  const map = {
    granted: ['Allowed', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    denied: ['Blocked', 'bg-red-50 text-red-700 border-red-200'],
  }
  const [label, className] = map[state] || ['Not set', 'bg-amber-50 text-amber-700 border-amber-200']
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${className}`}>{label}</span>
}

function PermissionRow({ icon: Icon, title, description, state, actionLabel, onAction, busy, hint }) {
  const granted = state === 'granted'
  return (
    <div className="flex gap-3 py-3 border-t border-gray-100 first:border-t-0 first:pt-0">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${granted ? 'bg-emerald-50' : 'bg-gray-100'}`}>
        {granted ? <Check size={15} className="text-emerald-600" /> : <Icon size={15} className="text-gray-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <StateBadge state={state} />
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        {hint && !granted && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mt-2">{hint}</p>}
        {!granted && (
          <button
            type="button"
            disabled={!!busy}
            onClick={onAction}
            className="mt-2 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {busy ? 'Waiting…' : actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// The one screen where a technician can see, and fix, everything Android needs
// before the app can keep tracking with the phone locked. Native app only —
// a browser tab can't hold any of these, so on the web this renders nothing.
export default function BackgroundAccessCard({ className = '' }) {
  const perms = useAppPermissions()
  const [showDisclosure, setShowDisclosure] = useState(false)
  const [triedBackground, setTriedBackground] = useState(false)

  if (!perms.supported || !perms.status) return null

  const s = perms.status
  const backgroundBlocked = s.backgroundLocation === 'denied' || (triedBackground && s.backgroundLocation !== 'granted')

  async function acceptDisclosure() {
    setShowDisclosure(false)
    await perms.requestBackgroundLocation()
    setTriedBackground(true)
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-1">
        <ShieldCheck size={16} /> Background Access
      </div>
      <p className="text-xs text-gray-500 mb-3">
        What the app is allowed to do while it is not open on your screen.
      </p>

      <div
        className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 mb-3 border ${
          perms.backgroundLocationReady
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        {perms.backgroundLocationReady ? <Check size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
        <span>
          {perms.backgroundLocationReady
            ? 'Location keeps reporting while your phone is locked.'
            : 'Tracking will stop when your screen locks until the items below are sorted.'}
        </span>
      </div>

      {!s.locationServicesEnabled && (
        <button
          type="button"
          onClick={perms.openLocationSettings}
          className="w-full text-left text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-3"
        >
          <strong>Location is switched off on this phone.</strong> Tap to open location settings.
        </button>
      )}

      <PermissionRow
        icon={MapPin}
        title="Location while using the app"
        description="The basic GPS permission. Nothing else works without it."
        state={s.location}
        actionLabel={s.location === 'denied' ? 'Open settings' : 'Allow'}
        busy={perms.busy === 'backgroundLocation' || perms.busy === 'settings'}
        onAction={s.location === 'denied' ? perms.openSettings : () => setShowDisclosure(true)}
        hint={s.location === 'denied' ? 'Open Permissions → Location and choose at least “Allow only while using the app”.' : null}
      />

      <PermissionRow
        icon={Navigation}
        title="Location all the time"
        description="Keeps GPS reporting once your phone is locked or you switch to another app."
        state={s.backgroundLocation}
        actionLabel={backgroundBlocked ? 'Open settings' : 'Allow all the time'}
        busy={perms.busy === 'backgroundLocation' || perms.busy === 'settings'}
        onAction={backgroundBlocked ? perms.openSettings : () => setShowDisclosure(true)}
        hint={
          backgroundBlocked
            ? 'Android only offers this from its own settings page: Permissions → Location → “Allow all the time”.'
            : null
        }
      />

      <PermissionRow
        icon={Bell}
        title="Notifications"
        description="Android hides the ongoing “on shift” notification without this — and quietly kills tracking with it."
        state={s.notifications}
        actionLabel={s.notifications === 'denied' ? 'Open settings' : 'Allow'}
        busy={perms.busy === 'notifications' || perms.busy === 'settings'}
        onAction={s.notifications === 'denied' ? perms.openSettings : perms.requestNotifications}
        hint={s.notifications === 'denied' ? 'Open Notifications and switch them on for Savvy Works.' : null}
      />

      <PermissionRow
        icon={Battery}
        title="Unrestricted battery use"
        description="Stops the phone’s battery saver from freezing the app mid-shift."
        state={s.batteryUnrestricted ? 'granted' : 'prompt'}
        actionLabel="Turn off battery limits"
        busy={perms.busy === 'battery'}
        onAction={perms.requestBattery}
        hint={perms.oemHint}
      />

      <button
        type="button"
        onClick={perms.openSettings}
        className="w-full flex items-center justify-center gap-2 mt-3 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg py-2"
      >
        <Settings size={13} /> Open app settings
      </button>

      {showDisclosure && (
        <BackgroundLocationDisclosure
          busy={perms.busy === 'backgroundLocation'}
          onAccept={acceptDisclosure}
          onDecline={() => setShowDisclosure(false)}
        />
      )}
    </div>
  )
}
