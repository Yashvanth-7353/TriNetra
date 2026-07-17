import React from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquareText,
  FolderSearch,
  Network,
  BarChart3,
  UserX,
  BellRing,
  User,
  LogOut,
  Shield,
  Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/ask', label: 'Ask TriNetra', icon: MessageSquareText },
  { path: '/cases', label: 'Case Explorer', icon: FolderSearch },
  { path: '/network', label: 'Network Analysis', icon: Network },
  { path: '/analytics', label: 'Crime Analytics', icon: BarChart3 },
  { path: '/pattern-analytics', label: 'Pattern Analytics', icon: Layers },
  { path: '/offenders', label: 'Offender Profiles', icon: UserX },
  { path: '/alerts', label: 'Prevention Alerts', icon: BellRing },
  { path: '/profile', label: 'My Profile', icon: User },
];

export default function AppShell() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Extract initials for the avatar
  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <div className="flex h-screen w-full bg-white text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-primary-900 text-white flex flex-col transition-all duration-300 hidden md:flex shrink-0">
        <Link to="/" className="p-4 flex items-center gap-3 border-b border-primary-800 hover:bg-primary-800 transition-colors cursor-pointer">
          <div className="w-8 h-8 bg-accent-500 rounded-full flex items-center justify-center shrink-0">
            <span className="font-bold text-primary-900 text-xs">TN</span>
          </div>
          <span className="font-semibold text-lg tracking-wide whitespace-nowrap">TriNetra</span>
        </Link>

        <nav className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors",
                isActive
                  ? "bg-primary-800 text-accent-500 font-medium"
                  : "text-primary-100 hover:bg-primary-800/50 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Real user info */}
        <div className="p-4 border-t border-primary-800">
          <NavLink
            to="/profile"
            className="flex items-center gap-3 hover:bg-primary-800/50 rounded-lg p-2 transition-colors -mx-2"
          >
            <div className="w-9 h-9 rounded-full bg-accent-500 flex items-center justify-center text-primary-900 text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium text-white truncate">{profile?.name || 'Unknown'}</div>
              <div className="text-xs text-primary-300 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {profile?.role || 'N/A'} · {profile?.district_name || ''}
              </div>
            </div>
          </NavLink>
          <button
            onClick={handleLogout}
            className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-primary-300 hover:text-white hover:bg-primary-800 py-2 rounded-md transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
          <div className="md:hidden">
            <span className="font-bold text-primary-900">TriNetra</span>
          </div>
          <div className="hidden md:block">
            {/* Breadcrumbs or page title */}
          </div>

          <div className="flex items-center gap-4">
            {/* Role Badge */}
            {profile && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-900 border border-primary-100">
                <Shield className="w-3.5 h-3.5 text-accent-500" />
                {profile.role} — {profile.unit_name}
              </span>
            )}

            <Link to="/alerts" className="text-slate-500 hover:text-primary-900 transition-colors relative">
              <BellRing className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </Link>

            <NavLink to="/profile" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center text-sm font-bold text-accent-500">
                {initials}
              </div>
            </NavLink>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-slate-50/50 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
