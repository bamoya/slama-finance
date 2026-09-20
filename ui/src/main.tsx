import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileText,
  Gift,
  LayoutDashboard,
  Menu,
  Moon,
  MoreHorizontal,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Target,
  TriangleAlert,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'

const queryClient = new QueryClient()

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Cash flow', icon: ChartNoAxesCombined },
]

const billingNavigation = [
  { label: 'Invoices', icon: ReceiptText },
  { label: 'Quotes', icon: FileText },
  { label: 'Scope tracker', icon: Target },
]

const clientNavigation = [
  { label: 'Clients', icon: UsersRound },
  { label: 'Payments', icon: CreditCard },
]

const toolNavigation = [
  { label: 'AI insights', icon: Sparkles },
  { label: 'Reports', icon: ChartNoAxesCombined },
]

function NavGroup({ items, active, onSelect }: { items: typeof navigation; active: string; onSelect: (label: string) => void }) {
  return items.map(({ label, icon: Icon }) => (
    <button className={`nav-item ${active === label ? 'active' : ''}`} key={label} onClick={() => onSelect(label)}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  ))
}

function App() {
  const [activeItem, setActiveItem] = useState('Dashboard')
  const [isDark, setIsDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [range, setRange] = useState('This month')

  return (
    <main className={`app-canvas ${isDark ? 'is-dark' : ''}`}>
      <section className="dashboard-shell">
        <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
          <div className="brand-row">
            <img className="brand-logo" src="/slama-logo.png" alt="Slama" />
            <span>Slama Finance</span>
            <button className="collapse-button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}>×</button>
          </div>

          <button className="search-button"><Search size={18} /><span>Search...</span><kbd>⌘ F</kbd></button>
          <nav>
            <NavGroup items={navigation} active={activeItem} onSelect={setActiveItem} />
            <p className="nav-heading">Billing</p>
            <NavGroup items={billingNavigation} active={activeItem} onSelect={setActiveItem} />
            <p className="nav-heading">Clients</p>
            <NavGroup items={clientNavigation} active={activeItem} onSelect={setActiveItem} />
            <p className="nav-heading">Tools</p>
            <NavGroup items={toolNavigation} active={activeItem} onSelect={setActiveItem} />
          </nav>

          <div className="sidebar-bottom">
            <div className="profile-card">
              <div className="avatar">SM</div>
              <div><strong>Slama Finance</strong><span>Owner workspace</span></div>
              <ChevronDown size={16} />
            </div>
            <div className="settings-card">
              <label className="theme-switch"><Moon size={18} /><span>Dark mode</span><input type="checkbox" checked={isDark} onChange={(event) => setIsDark(event.target.checked)} /><i /></label>
              <button className="nav-item"><Settings size={18} /> <span>Settings</span></button>
            </div>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div className="topbar-title"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={22} /></button><h1>{activeItem}</h1></div>
            <div className="topbar-actions">
              <button aria-label="Notifications"><Bell size={19} /><b /></button>
              <button aria-label="What's new"><Gift size={19} /><b /></button>
              <span className="topbar-divider" />
              <button className="help"><CircleHelp size={18} /> Get help</button>
            </div>
          </header>

          <div className="dashboard-content">
            <section className="metric-grid">
              <MetricCard icon={<WalletCards />} label="Received this month" value="84,200 MAD" detail="18%" trend="positive" />
              <MetricCard icon={<CalendarDays />} label="Awaiting payment" value="147,500 MAD" detail="Across 7 invoices" />
              <MetricCard icon={<TriangleAlert />} label="Overdue now" value="42,000 MAD" detail="03 overdue" trend="negative" />
              <MetricCard icon={<Sparkles />} label="Predicted next 30d" value="113,000 MAD" detail="From payment patterns" />
            </section>

            <section className="panel forecast-panel">
              <div className="panel-header"><div><h2>Cash flow forecast</h2><div className="legend"><span><i className="received" />Received</span><span><i className="predicted" />Predicted</span><span><i className="overdue" />Overdue</span></div></div><button><MoreHorizontal size={20} /></button></div>
              <div className="forecast-summary"><div><strong>324,000 MAD</strong><span>Predicted next 4 months</span></div><div className="forecast-controls"><button className="range-button" onClick={() => setRange(range === 'This month' ? 'Mar – Aug 2026' : 'This month')}><CalendarDays size={17} />{range}<ChevronDown size={16} /></button><button className="icon-button"><ChartNoAxesCombined size={18} /></button></div></div>
              <CashflowChart />
            </section>

            <section className="lower-grid">
              <section className="panel risk-panel">
                <div className="panel-title-row"><h2>Client payment risk</h2><div><button className="text-button">View all</button><button><MoreHorizontal size={20} /></button></div></div>
                <div className="risk-content"><div className="risk-donut"><div><strong>64</strong><span>Clients</span></div></div><div className="risk-breakdown"><h3>Breakdown</h3><RiskLine color="purple" label="Low risk" count="37 clients" /><RiskLine color="blue" label="Medium risk" count="19 clients" /><RiskLine color="pink" label="High risk" count="8 clients" /></div></div>
              </section>
              <section className="panel briefing-panel">
                <div className="panel-title-row"><div><h2>AI briefing <small>i</small></h2><strong className="attention-count">03 <span>Need attention</span></strong></div><div><button className="text-button">Dismiss all</button><button><MoreHorizontal size={20} /></button></div></div>
                <div className="briefing-item"><div className="alert-icon"><TriangleAlert size={18} /></div><div><p className="briefing-meta">OVERDUE · 12 DAYS LATE</p><h3>#047 · Studio Budi is 12 days overdue</h3><div className="chips"><span>Pay chance · 31%</span><span>Overdue · 12d</span><span>At risk · 2,800 MAD</span></div></div></div>
                <div className="briefing-item secondary"><div className="alert-icon blue"><FileText size={18} /></div><div><p className="briefing-meta">INVOICE · READY TO SEND</p><h3>#052 · Atlas Studio invoice is ready for review</h3></div></div>
              </section>
            </section>
          </div>
        </section>
      </section>
    </main>
  )
}

function MetricCard({ icon, label, value, detail, trend }: { icon: React.ReactNode; label: string; value: string; detail: string; trend?: 'positive' | 'negative' }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-icon">{icon}</span><button><MoreHorizontal size={19} /></button></div><p>{label}</p><div className="metric-value"><strong>{value}</strong><span className={trend ?? ''}>{trend === 'positive' ? '↑' : trend === 'negative' ? '↑' : ''} {detail}</span></div></article>
}

function RiskLine({ color, label, count }: { color: string; label: string; count: string }) {
  return <div className="risk-line"><span><i className={color} />{label}</span><em>{count}</em></div>
}

function CashflowChart() {
  return <div className="chart-wrap"><div className="y-labels"><span>20k</span><span>16k</span><span>12k</span><span>8k</span><span>4k</span><span>0</span></div><svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-label="Cash flow forecast"><defs><linearGradient id="forecast-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#d9ac2d" stopOpacity=".30" /><stop offset="1" stopColor="#d9ac2d" stopOpacity=".02" /></linearGradient></defs><g className="chart-grid"><line x1="0" y1="30" x2="1000" y2="30" /><line x1="0" y1="85" x2="1000" y2="85" /><line x1="0" y1="140" x2="1000" y2="140" /><line x1="0" y1="195" x2="1000" y2="195" /><line x1="0" y1="250" x2="1000" y2="250" /></g><path className="forecast-fill" d="M20 140 L135 140 L250 114 L365 114 L480 102 L595 48 L710 104 L825 145 L940 145 L940 250 L20 250 Z" /><path className="forecast-line" d="M20 140 L135 140 L250 114 L365 114 L480 102 L595 48 L710 104 L825 145 L940 145" />{[[20,140],[135,140],[250,114],[365,114],[480,102],[595,48],[710,104],[825,145],[940,145]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" className="chart-dot" />)}<line className="current-marker" x1="480" y1="30" x2="480" y2="250" /><circle cx="480" cy="180" r="4" className="overdue-dot" /></svg><div className="chart-months">{['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((month) => <span className={month === 'Aug' ? 'current-month' : ''} key={month}>{month}</span>)}</div><div className="chart-tooltip"><strong>August 2026</strong><span><i className="received" />Received <b>13,240</b></span><span><i className="predicted" />Predicted <b>13,240</b></span><span><i className="overdue" />Overdue <b>4,130</b></span></div></div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
