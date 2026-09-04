import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#6366F1']

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="h-64">
        {children}
      </div>
    </div>
  )
}

function EmptyChart() {
  return <div className="h-full flex items-center justify-center text-sm text-gray-400">No data yet</div>
}

// One row of three charts (bar, line, pie) laid out horizontally across the
// page — the shared dashboard visual for every module dashboard.
export default function DashboardCharts({ bar, line, pie, loading }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title={bar?.title ?? 'Breakdown'}>
        {loading || !bar?.data?.length ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bar.data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="value" fill={bar.color ?? DEFAULT_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={line?.title ?? 'Trend'}>
        {loading || !line?.data?.length ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={line.data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="value" stroke={line.color ?? DEFAULT_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={pie?.title ?? 'Distribution'}>
        {loading || !pie?.data?.length ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <Pie data={pie.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={2}>
                {pie.data.map((entry, i) => (
                  <Cell key={entry.name} fill={(pie.colors ?? DEFAULT_COLORS)[i % (pie.colors ?? DEFAULT_COLORS).length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
