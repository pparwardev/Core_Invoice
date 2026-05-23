import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import ChatWidget from './ChatWidget';

const userNavItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/vendors', label: 'Vendors', icon: '👥' },
  { path: '/billing', label: 'Tax Invoice', icon: '📋' },
  { path: '/po-reader', label: 'PO Reader', icon: '📄' },
  { path: '/company', label: 'Company', icon: '🏢' },
  { path: '/profile', label: 'Profile', icon: '👤' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => { logout(); navigate('/login'); };

  const isAdmin = user?.role === 'admin';
  const isOnAdminPage = location.pathname === '/admin';

  // Admin top navbar: 2 tabs only
  const adminTopNav = [
    { path: '/admin', label: 'Admin Panel', icon: '⚙️' },
    { path: '/dashboard', label: 'User Panel', icon: '👤' },
  ];

  // Regular users: all items in top navbar
  const regularTopNav = userNavItems;

  const displayTopNav = isAdmin ? adminTopNav : regularTopNav;

  // Show user panel sidebar when admin is NOT on /admin page
  const showUserSidebar = isAdmin && !isOnAdminPage;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1a1a2e] text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-white flex items-center gap-2">
            <img src="/PO_Invoicing_App_Icon.ico" alt="Core-Invoice" className="w-7 h-7 rounded" />
            Core-Invoice
          </span>
          <div className="flex gap-1">
            {displayTopNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${isActive ? 'bg-[#4fc3f7] text-[#1a1a2e] font-semibold' : 'text-gray-300 hover:text-white hover:bg-white/10'}`
                }
              >
                <span className="text-xs">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <NavLink to="/profile" className="text-sm text-gray-300 hover:text-white transition">
            👤 {user?.name}
          </NavLink>
          <button onClick={handleLogout} className="text-sm text-red-400 hover:text-red-300 font-medium">Logout</button>
        </div>
      </nav>

      {/* Main content with optional sidebar for admin's User Panel */}
      {showUserSidebar ? (
        <div className="flex">
          {/* User Panel Sidebar */}
          <aside className="w-[200px] bg-white border-r border-gray-200 min-h-[calc(100vh-56px)] shrink-0 py-4">
            <div className="px-4 mb-3">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">User Panel</span>
            </div>
            <nav className="space-y-0.5">
              {userNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${isActive ? 'bg-[#0D7377]/10 text-[#0D7377] font-medium border-r-[3px] border-[#0D7377]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`
                  }
                >
                  <span>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
          {/* Content */}
          <main className="flex-1 px-8 py-6 max-w-[1200px]">
            <Outlet />
          </main>
        </div>
      ) : (
        <main className="px-8 py-6 max-w-[1400px] mx-auto">
          <Outlet />
        </main>
      )}
      <ChatWidget />
    </div>
  );
}
