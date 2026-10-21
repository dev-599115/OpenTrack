import { Link, NavLink, Outlet } from 'react-router-dom';

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white'}`;

export default function Layout() {
  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true">
              <rect x="1" y="1" width="24" height="18" rx="2" fill="none" stroke="#7fd1dc" strokeWidth="2" />
              <path d="M7 3v14M13 3v14M19 3v14" stroke="#7fd1dc" strokeWidth="1.5" />
            </svg>
            Container tracker
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1">
            <NavLink to="/" end className={navLink}>Containers</NavLink>
            <NavLink to="/bookings" className={navLink}>Bookings</NavLink>
            <NavLink to="/webhooks" className={navLink}>Webhooks</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
