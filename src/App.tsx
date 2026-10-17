import { useEffect, useState } from 'react'
import { Home, Menu, Plus, Siren, Wrench } from 'lucide-react'
import { useActiveCar, useCars } from './lib/store'
import { useRoute, navigate } from './lib/router'
import { openSheet } from './lib/sheets'
import { allStatuses } from './lib/maintenance'
import { checkDue } from './lib/schedule'
import { syncPush, updateBadge } from './lib/push'
import { requestPersistence } from './lib/files'
import { SheetHost } from './components/sheets'
import { cx, ToastHost } from './components/ui'
import { HomeScreen } from './screens/Home'
import { PartDetail, PartsScreen } from './screens/Parts'
import { SymptomDetail, SymptomsScreen } from './screens/Symptoms'
import { BackupScreen, CostsScreen, HistoryScreen, MoreScreen, NotificationsScreen, SpecsScreen } from './screens/More'
import { CarForm, CarsScreen, CarSwitcher } from './screens/Cars'
import { DevScreen } from './screens/Dev'

export default function App() {
  const cars = useCars()
  const data = useActiveCar()
  const route = useRoute()
  const [switcher, setSwitcher] = useState(false)

  useEffect(() => {
    requestPersistence()
  }, [])

  // Notification taps deep-link to #/odometer and #/checks
  useEffect(() => {
    if (!data) return
    if (route[0] === 'odometer') {
      navigate('', true)
      openSheet({ type: 'odometer' })
    } else if (route[0] === 'checks') {
      navigate('', true)
      openSheet({ type: 'check' })
    }
  }, [route, data])

  // Keep the Home Screen badge and the push relay in step with the data
  useEffect(() => {
    if (!data) return
    const s = allStatuses(data)
    const count = s.filter((x) => x.state === 'overdue' || x.state === 'soon').length + data.symptoms.filter((x) => x.status === 'open').length + (checkDue(data.checks, data.settings, Date.now()).due ? 1 : 0)
    updateBadge(count)
    const t = setTimeout(() => syncPush().catch(() => {}), 1500)
    return () => clearTimeout(t)
  }, [data])

  if (cars === undefined || data === undefined) return <Splash />
  if (!cars.length || !data) return <Onboarding />

  let screen: React.ReactNode
  let tab = route[0] ?? ''
  switch (route[0]) {
    case 'parts':
      screen = <PartsScreen key={route[1] ?? 'all'} data={data} initialFilter={route[1]} />
      break
    case 'part':
      screen = <PartDetail data={data} partId={route[1]} />
      tab = 'parts'
      break
    case 'symptoms':
      screen = <SymptomsScreen data={data} />
      break
    case 'symptom':
      screen = <SymptomDetail data={data} id={Number(route[1])} />
      tab = 'symptoms'
      break
    case 'more':
      screen = <MoreScreen data={data} />
      break
    case 'cars':
      screen = <CarsScreen />
      tab = 'more'
      break
    case 'notifications':
      screen = <NotificationsScreen />
      tab = 'more'
      break
    case 'backup':
      screen = <BackupScreen />
      tab = 'more'
      break
    case 'history':
      screen = <HistoryScreen data={data} />
      tab = 'more'
      break
    case 'costs':
      screen = <CostsScreen data={data} />
      tab = 'more'
      break
    case 'specs':
      screen = <SpecsScreen data={data} />
      tab = 'more'
      break
    case 'dev':
      screen = <DevScreen />
      tab = 'more'
      break
    default:
      screen = <HomeScreen data={data} onSwitchCar={() => setSwitcher(true)} />
      tab = ''
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <main key={route.join('/')} className="animate-fade">{screen}</main>
      <TabBar active={tab} />
      <SheetHost data={data} />
      <CarSwitcher open={switcher} onClose={() => setSwitcher(false)} />
      <ToastHost />
    </div>
  )
}

function TabBar({ active }: { active: string }) {
  const tabs = [
    { id: '', label: 'خانه', icon: Home },
    { id: 'parts', label: 'قطعات', icon: Wrench },
    { id: '+', label: '', icon: Plus },
    { id: 'symptoms', label: 'علائم', icon: Siren },
    { id: 'more', label: 'بیشتر', icon: Menu },
  ]
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--tab-h)] max-w-xl items-center justify-around px-2">
        {tabs.map((t) =>
          t.id === '+' ? (
            <button key="+" aria-label="ثبت جدید" onClick={() => openSheet({ type: 'actions' })} className="-mt-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-accent/40 transition active:scale-95">
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
          ) : (
            <button key={t.id} onClick={() => navigate(t.id)} className={cx('flex min-w-16 flex-col items-center gap-0.5 py-1 text-[11px] font-semibold transition', active === t.id ? 'text-accent' : 'text-muted')}>
              <t.icon className="size-6" strokeWidth={active === t.id ? 2.4 : 1.8} />
              {t.label}
            </button>
          ),
        )}
      </div>
    </nav>
  )
}

function Splash() {
  return <div className="grid min-h-dvh place-items-center text-muted">…</div>
}

function Onboarding() {
  return (
    <div className="pt-safe mx-auto min-h-dvh max-w-xl px-5 pb-10">
      <div className="pb-6 pt-8 text-center">
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" className="mx-auto size-20 rounded-[22px] shadow-xl" />
        <h1 className="mt-4 text-3xl font-black">کارکر</h1>
        <p className="mt-2 leading-7 text-muted">دفترچه‌ی سرویس هوشمند ماشینت. تعویض‌ها را ثبت کن، کارکر یادش می‌ماند و سر موقع یادآوری می‌کند.</p>
      </div>
      <CarForm onDone={() => navigate('', true)} />
      <ToastHost />
    </div>
  )
}
