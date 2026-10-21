import { useState } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import DocumentExplorer from './DocumentExplorer'
import DocumentActivityLog from './DocumentActivityLog'

const TABS = ['Documents', 'Activity']

// Phone layout for technicians, normal page layout for everyone else.
// (Module level on purpose: a component defined inside another component is a
// new component every render and would wipe the explorer's state.)
export function DocumentsShell({ compact, children }) {
  return compact ? <div className="p-4 space-y-4">{children}</div> : <PageContainer>{children}</PageContainer>
}

// The page around one explorer: title, who can see it, optional Back button,
// and the Documents / Activity tabs (same look as a job's tabs). Every
// "documents" page — a person's, a team member's, the company's — is this.
export default function DocumentsWorkspace({ compact, title, subtitle, onBack, ownerKind, ownerId, canManage, rootLabel, topSlot }) {
  const [activeTab, setActiveTab] = useState('Documents')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <DocumentsShell compact={compact}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 break-words`}>{title}</h1>
          <p className="flex items-start gap-1.5 text-sm text-gray-500 mt-0.5">
            <ShieldCheck size={14} className="shrink-0 mt-1" />
            <span>{subtitle}</span>
          </p>
        </div>
        {onBack && (
          <button type="button" onClick={onBack}
            className="shrink-0 flex items-center gap-1.5 bg-blue-500 text-white px-3 py-2 rounded text-sm font-semibold hover:bg-blue-600 transition-colors">
            <ArrowLeft size={14} /> Back
          </button>
        )}
      </div>

      {topSlot}

      <div className="flex border-b border-gray-300 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              tab === activeTab
                ? 'border-blue-600 text-white bg-blue-600'
                : 'border-transparent text-gray-600 hover:text-blue-600 hover:border-blue-300',
            ].join(' ')}>
            {tab}
          </button>
        ))}
      </div>

      {/* Kept mounted while on the Activity tab so the folder you were in is still open when you come back. */}
      <div className={activeTab === 'Documents' ? '' : 'hidden'}>
        <DocumentExplorer
          key={`${ownerKind}:${ownerId}`}
          ownerKind={ownerKind}
          ownerId={ownerId}
          canManage={canManage}
          rootLabel={rootLabel}
          onChanged={() => setRefreshKey(k => k + 1)}
        />
      </div>
      {activeTab === 'Activity' && <DocumentActivityLog ownerKind={ownerKind} ownerId={ownerId} refreshKey={refreshKey} />}
    </DocumentsShell>
  )
}
