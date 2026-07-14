import { useState } from 'react'
import { HouseholdLogin } from './pages/HouseholdLogin'
import { ReceiptUpload } from './pages/ReceiptUpload'
import { ShoppingList } from './pages/ShoppingList'
import { PriceComparison } from './pages/PriceComparison'
import { Balance } from './pages/Balance'
import { getHouseholdSession } from './lib/household'
import './App.css'

type View = 'home' | 'upload-receipt' | 'shopping-list' | 'price-comparison' | 'balance'

function App() {
  const [session, setSession] = useState(() => getHouseholdSession())
  const [view, setView] = useState<View>('home')

  if (!session) {
    return <HouseholdLogin onEnter={() => setSession(getHouseholdSession())} />
  }

  if (view === 'upload-receipt') {
    return (
      <div className="app-shell">
        <main>
          <ReceiptUpload session={session} onDone={() => setView('home')} />
        </main>
      </div>
    )
  }

  if (view === 'shopping-list') {
    return (
      <div className="app-shell">
        <main>
          <ShoppingList
            session={session}
            onDone={() => setView('home')}
            onCompare={() => setView('price-comparison')}
          />
        </main>
      </div>
    )
  }

  if (view === 'price-comparison') {
    return (
      <div className="app-shell">
        <main>
          <PriceComparison session={session} onDone={() => setView('shopping-list')} />
        </main>
      </div>
    )
  }

  if (view === 'balance') {
    return (
      <div className="app-shell">
        <main>
          <Balance session={session} onDone={() => setView('home')} />
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Gringotshome</h1>
        <p>Hola, {session.displayName} 👋</p>
      </header>
      <main>
        <div className="home-actions">
          <button className="primary-action" onClick={() => setView('upload-receipt')}>
            📄 Subir recibo
          </button>
          <button className="primary-action" onClick={() => setView('shopping-list')}>
            🛒 Lista de mercado
          </button>
          <button className="primary-action" onClick={() => setView('balance')}>
            💰 Balance
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
