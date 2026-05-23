import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

// ===== Types =====
interface Permission {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface UserData {
  id: number;
  user_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean | number;
  designation?: string;
  company_name?: string;
  created_at: string;
  last_login?: string;
  permissions: Permission[];
}

interface PendingUser {
  id: number;
  user_id: string;
  name: string;
  email: string;
  role: string;
  designation?: string;
  company_name?: string;
  created_at: string;
}

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  created_at: string;
}

interface MonthlyBilling {
  month: number;
  year: number;
  total: number;
  count: number;
}

interface AdminStats {
  users: { total: number; active: number; pendingApproval: number };
  vendors: { total: number };
  purchaseOrders: { total: number; active: number; totalValue: number };
  billing: { total: number; totalValue: number };
  monthlyBilling: MonthlyBilling[];
  recentNotifications: Notification[];
  pendingUsers: PendingUser[];
}

interface CompanyInfo {
  name?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
}

type TabKey = 'overview' | 'users' | 'approvals' | 'analytics' | 'activity' | 'data' | 'security' | 'settings';

const MODULES = ['dashboard', 'vendors', 'billing', 'po_reader', 'company', 'profile', 'notifications'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800 border-purple-200',
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  associate: 'bg-green-100 text-green-800 border-green-200',
  guest: 'bg-gray-100 text-gray-800 border-gray-200',
};

const typeIcons: Record<string, string> = {
  po: '📋',
  invoice: '🧾',
  payment: '💳',
  vendor: '🏪',
  user: '👤',
  billing: '💰',
  system: '⚙️',
};

// ===== Helpers =====
function formatCurrency(val: number): string {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val.toLocaleString('en-IN')}`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getTypeIcon(type: string): string {
  return typeIcons[type?.toLowerCase()] || '🔔';
}

// ===== Main Component =====
export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permModalUser, setPermModalUser] = useState<UserData | null>(null);
  const [editPerms, setEditPerms] = useState<Permission[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await api.get('/auth/admin/stats');
      setStats(res.data);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch users');
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setAllNotifications(Array.isArray(res.data) ? res.data : res.data.notifications || []);
    } catch (err: any) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchUsers(), fetchNotifications()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleApprove = async (userId: number) => {
    try {
      await api.put(`/auth/admin/approve/${userId}`);
      await fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve user');
    }
  };

  const handleReject = async (userId: number) => {
    if (!confirm('Are you sure you want to reject and remove this user?')) return;
    try {
      await api.put(`/auth/admin/reject/${userId}`);
      await fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject user');
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await api.put(`/auth/users/${userId}/role`, { role: newRole });
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleToggleActive = async (u: UserData) => {
    try {
      const isActive = u.is_active === true || u.is_active === 1;
      if (isActive) {
        await api.put(`/auth/users/${u.id}/deactivate`);
      } else {
        await api.put(`/auth/users/${u.id}/activate`);
      }
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to toggle user status');
    }
  };

  const handleDeleteUser = async (u: UserData) => {
    if (u.role === 'admin') { alert('Cannot delete admin account!'); return; }
    if (!confirm(`⚠️ Permanently delete user "${u.name}" (${u.user_id})? This cannot be undone!`)) return;
    try {
      await api.delete(`/auth/users/${u.id}`);
      await fetchUsers();
      await fetchStats();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const openPermModal = (u: UserData) => {
    setPermModalUser(u);
    const existingPerms = u.permissions || [];
    const perms = MODULES.map(mod => {
      const existing = existingPerms.find((p) => p.module === mod);
      if (existing) return { ...existing };
      return { module: mod, can_view: false, can_create: false, can_edit: false, can_delete: false };
    });
    setEditPerms(perms);
  };

  const handlePermChange = (module: string, field: keyof Permission, value: boolean) => {
    setEditPerms(prev => prev.map(p => p.module === module ? { ...p, [field]: value } : p));
  };

  const savePermissions = async () => {
    if (!permModalUser) return;
    try {
      setSaving(true);
      await api.put(`/auth/users/${permModalUser.id}/permissions`, { permissions: editPerms });
      setPermModalUser(null);
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = stats?.users?.pendingApproval || 0;

  const sidebarItems: { key: TabKey; icon: string; label: string; badge?: number }[] = [
    { key: 'overview', icon: '📊', label: 'Overview' },
    { key: 'users', icon: '👥', label: 'Users' },
    { key: 'approvals', icon: '✅', label: 'Approvals', badge: pendingCount },
    { key: 'analytics', icon: '📈', label: 'Analytics' },
    { key: 'activity', icon: '📝', label: 'Activity Log' },
    { key: 'data', icon: '📁', label: 'Data Mgmt' },
    { key: 'security', icon: '🛡️', label: 'Security' },
    { key: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8f9fa]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#0D7377] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-60px)] -mx-8 -my-6">
      {/* Sidebar */}
      <aside className="w-[240px] bg-[#1a1a2e] text-white flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#0D7377] flex items-center justify-center text-white font-bold text-sm">
              CI
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Admin Panel</h2>
              <p className="text-[11px] text-gray-400">{user?.name}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {sidebarItems.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full text-left px-6 py-3 text-sm flex items-center gap-3 transition-all duration-200 ${
                activeTab === item.key
                  ? 'bg-[#0D7377]/20 text-[#4dd0e1] border-r-[3px] border-[#0D7377] font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-white/10">
          <p className="text-[10px] text-gray-500">Core-Invoice v1.0.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#f8f9fa] p-8 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab stats={stats} />}
        {activeTab === 'users' && (
          <UsersTab
            users={users}
            error={error}
            onRoleChange={handleRoleChange}
            onToggleActive={handleToggleActive}
            onOpenPerms={openPermModal}
            onDeleteUser={handleDeleteUser}
          />
        )}
        {activeTab === 'approvals' && (
          <ApprovalsTab
            pendingUsers={stats?.pendingUsers || []}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}
        {activeTab === 'analytics' && <AnalyticsTab stats={stats} />}
        {activeTab === 'activity' && <ActivityTab notifications={allNotifications} />}
        {activeTab === 'data' && <DataManagementTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'settings' && <SettingsTab stats={stats} />}

        {/* Permissions Modal */}
        {permModalUser && (
          <PermissionsModal
            user={permModalUser}
            editPerms={editPerms}
            saving={saving}
            onPermChange={handlePermChange}
            onSave={savePermissions}
            onClose={() => setPermModalUser(null)}
          />
        )}
      </main>
    </div>
  );
}


// ===== Overview Tab =====
function OverviewTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <div className="text-gray-400">No data available</div>;

  const statCards = [
    { label: 'Total Users', value: stats.users.total, color: 'border-l-blue-500', icon: '👥', iconBg: 'bg-blue-50' },
    { label: 'Active Users', value: stats.users.active, color: 'border-l-green-500', icon: '✅', iconBg: 'bg-green-50' },
    { label: 'Pending Approvals', value: stats.users.pendingApproval, color: 'border-l-amber-500', icon: '⏳', iconBg: 'bg-amber-50' },
    { label: 'Total Vendors', value: stats.vendors.total, color: 'border-l-purple-500', icon: '🏪', iconBg: 'bg-purple-50' },
    { label: 'Active POs', value: stats.purchaseOrders.active, color: 'border-l-teal-500', icon: '📋', iconBg: 'bg-teal-50' },
    { label: 'Total Billed', value: formatCurrency(stats.billing.totalValue), color: 'border-l-indigo-500', icon: '💰', iconBg: 'bg-indigo-50' },
  ];

  const maxBilling = Math.max(...stats.monthlyBilling.map(m => m.total), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Overview</h1>
        <span className="text-xs text-gray-400">Last updated: {new Date().toLocaleTimeString()}</span>
      </div>

      {/* Stat Cards - 2 rows × 3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className={`bg-white rounded-xl shadow-sm border-l-4 ${card.color} p-5 flex items-center gap-4 hover:shadow-md transition-shadow`}>
            <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center text-xl`}>
              {card.icon}
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">{card.value}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Monthly Billing Chart */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-6">Monthly Billing (Last 6 Months)</h3>
        <div className="flex items-end gap-4 h-44">
          {stats.monthlyBilling.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-[10px] text-gray-500 font-medium">
                {formatCurrency(m.total)}
              </span>
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{
                  height: `${Math.max((m.total / maxBilling) * 100, 5)}%`,
                  background: 'linear-gradient(to top, #0D7377, #14919B)',
                }}
              />
              <span className="text-[11px] text-gray-600 font-medium">
                {MONTH_NAMES[m.month - 1]} '{String(m.year).slice(2)}
              </span>
            </div>
          ))}
          {stats.monthlyBilling.length === 0 && (
            <div className="flex-1 text-center text-gray-400 text-sm py-12">No billing data yet</div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Activity</h3>
        <div className="space-y-1 max-h-[360px] overflow-y-auto">
          {stats.recentNotifications.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No recent activity</p>
          ) : (
            stats.recentNotifications.slice(0, 15).map((n) => (
              <div key={n.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                <span className="text-sm">{getTypeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{n.title || n.message}</p>
                </div>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{timeAgo(n.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}


// ===== Users Tab =====
function UsersTab({
  users, error, onRoleChange, onToggleActive, onOpenPerms, onDeleteUser,
}: {
  users: UserData[];
  error: string;
  onRoleChange: (id: number, role: string) => void;
  onToggleActive: (u: UserData) => void;
  onOpenPerms: (u: UserData) => void;
  onDeleteUser: (u: UserData) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const filtered = users.filter(u => {
    // Search filter
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.user_id.toLowerCase().includes(search.toLowerCase());
    // Status filter
    const isActive = u.is_active === true || u.is_active === 1;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && isActive) || (statusFilter === 'inactive' && !isActive);
    // Role filter
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const activeCount = users.filter(u => u.is_active === true || u.is_active === 1).length;
  const inactiveCount = users.length - activeCount;

  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl">{error}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Users</h1>
        <span className="text-xs text-gray-400">{filtered.length} of {users.length} users</span>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setStatusFilter('all')} className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${statusFilter === 'all' ? 'bg-[#0D7377] text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-[#0D7377]'}`}>
          All ({users.length})
        </button>
        <button onClick={() => setStatusFilter('active')} className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${statusFilter === 'active' ? 'bg-green-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-400'}`}>
          ✅ Active ({activeCount})
        </button>
        <button onClick={() => setStatusFilter('inactive')} className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${statusFilter === 'inactive' ? 'bg-red-500 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-red-400'}`}>
          ❌ Inactive ({inactiveCount})
        </button>
        <div className="border-l border-gray-200 mx-2"></div>
        {/* Role Filter */}
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#0D7377]">
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="associate">Associate</option>
          <option value="guest">Guest</option>
        </select>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="text"
          placeholder="Search by name, email, or user ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]/30 focus:border-[#0D7377] transition-all"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">User ID</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">Last Login</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{u.user_id}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleBadgeColors[u.role] || roleBadgeColors.guest}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(u.is_active === true || u.is_active === 1) ? (
                      <span className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span>Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-red-700 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span>Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.last_login ? timeAgo(u.last_login) : u.created_at ? timeAgo(u.created_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => onRoleChange(u.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#0D7377] cursor-pointer"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="associate">Associate</option>
                        <option value="guest">Guest</option>
                      </select>
                      <button
                        onClick={() => onToggleActive(u)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                          (u.is_active === true || u.is_active === 1)
                            ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                            : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                        }`}
                      >
                        {(u.is_active === true || u.is_active === 1) ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => onOpenPerms(u)}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-[#0D7377]/10 text-[#0D7377] hover:bg-[#0D7377]/20 border border-[#0D7377]/20 transition-colors"
                      >
                        Permissions
                      </button>
                      <button
                        onClick={() => onDeleteUser(u)}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">No users found matching your search</div>
        )}
      </div>
    </div>
  );
}


// ===== Approvals Tab =====
function ApprovalsTab({
  pendingUsers, onApprove, onReject,
}: {
  pendingUsers: PendingUser[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  if (pendingUsers.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-gray-800">Approvals</h1>
        <div className="bg-white rounded-xl shadow-sm p-16 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">All caught up!</h3>
          <p className="text-gray-400">No pending approvals at the moment</p>
          <div className="mt-6 flex justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-3 h-3 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Approvals</h1>
        <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full">
          {pendingUsers.length} pending
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pendingUsers.map(u => (
          <div key={u.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0D7377] to-[#14919B] flex items-center justify-center text-white font-bold text-sm">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{u.name}</h3>
                  <p className="text-sm text-gray-500">{u.email}</p>
                </div>
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold uppercase">Pending</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-5 bg-gray-50 rounded-lg p-3">
              <div><span className="text-gray-400">ID:</span> {u.user_id}</div>
              <div><span className="text-gray-400">Role:</span> {u.role || 'guest'}</div>
              <div><span className="text-gray-400">Designation:</span> {u.designation || '—'}</div>
              <div><span className="text-gray-400">Company:</span> {u.company_name || '—'}</div>
              <div className="col-span-2"><span className="text-gray-400">Registered:</span> {timeAgo(u.created_at)}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => onApprove(u.id)}
                className="flex-1 py-2.5 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-sm"
              >
                ✅ Approve
              </button>
              <button
                onClick={() => onReject(u.id)}
                className="flex-1 py-2.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm"
              >
                ❌ Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ===== Analytics Tab =====
function AnalyticsTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <div className="text-gray-400">No data available</div>;

  const poValue = stats.purchaseOrders.totalValue;
  const billedValue = stats.billing.totalValue;
  const utilization = poValue > 0 ? ((billedValue / poValue) * 100).toFixed(1) : '0';
  const expiredPOs = Math.max(stats.purchaseOrders.total - stats.purchaseOrders.active, 0);
  const maxBilling = Math.max(...stats.monthlyBilling.map(m => m.total), 1);

  // Simulated top vendors (from billing data context)
  const topVendors = [
    { name: 'Top Vendor 1', value: billedValue * 0.3 },
    { name: 'Top Vendor 2', value: billedValue * 0.22 },
    { name: 'Top Vendor 3', value: billedValue * 0.18 },
    { name: 'Top Vendor 4', value: billedValue * 0.15 },
    { name: 'Top Vendor 5', value: billedValue * 0.1 },
  ];
  const maxVendorValue = Math.max(...topVendors.map(v => v.value), 1);

  const exportAnalytics = (format: string) => {
    if (format === 'excel') {
      const headers = ['Month', 'Year', 'Bills Count', 'Total Amount'];
      const rows = (stats?.monthlyBilling || []).map(m => [MONTH_NAMES[m.month-1], m.year, m.count, m.total]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'analytics_report.csv'; a.click(); URL.revokeObjectURL(url);
    } else {
      const html = `<html><head><title>Analytics Report</title><style>body{font-family:Arial;padding:40px}h1{color:#1a1a2e}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h1>Core-Invoice Analytics Report</h1><p>Generated: ${new Date().toLocaleDateString()}</p><h3>Summary</h3><ul><li>Total PO Value: ₹${(stats?.purchaseOrders?.totalValue || 0).toLocaleString('en-IN')}</li><li>Total Billed: ₹${(stats?.billing?.totalValue || 0).toLocaleString('en-IN')}</li><li>Active POs: ${stats?.purchaseOrders?.active || 0}</li><li>Total Vendors: ${stats?.vendors?.total || 0}</li></ul><h3>Monthly Billing</h3><table><tr><th>Month</th><th>Bills</th><th>Amount</th></tr>${(stats?.monthlyBilling || []).map(m => `<tr><td>${MONTH_NAMES[m.month-1]} ${m.year}</td><td>${m.count}</td><td>₹${m.total.toLocaleString('en-IN')}</td></tr>`).join('')}</table></body></html>`;
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <div className="flex gap-2">
          <button onClick={() => exportAnalytics('excel')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">📊 Export Excel</button>
          <button onClick={() => exportAnalytics('pdf')} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">📄 Export PDF</button>
        </div>
      </div>

      {/* Value Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-blue-500 p-5">
          <div className="text-xs text-gray-500 font-medium mb-1">Total PO Value</div>
          <div className="text-2xl font-bold text-gray-800">{formatCurrency(poValue)}</div>
          <div className="text-xs text-gray-400 mt-1">{stats.purchaseOrders.total} purchase orders</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-green-500 p-5">
          <div className="text-xs text-gray-500 font-medium mb-1">Total Billed</div>
          <div className="text-2xl font-bold text-gray-800">{formatCurrency(billedValue)}</div>
          <div className="text-xs text-gray-400 mt-1">{stats.billing.total} records</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-purple-500 p-5">
          <div className="text-xs text-gray-500 font-medium mb-1">Utilization %</div>
          <div className="text-2xl font-bold text-gray-800">{utilization}%</div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(Number(utilization), 100)}%`, background: 'linear-gradient(to right, #0D7377, #14919B)' }} />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-amber-500 p-5">
          <div className="text-xs text-gray-500 font-medium mb-1">Active vs Expired</div>
          <div className="text-2xl font-bold text-gray-800">{stats.purchaseOrders.active} / {expiredPOs}</div>
          <div className="text-xs text-gray-400 mt-1">active / expired POs</div>
        </div>
      </div>

      {/* Monthly Billing Trend */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-6">Monthly Billing Trend</h3>
        <div className="flex items-end gap-4 h-48">
          {stats.monthlyBilling.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-[10px] text-gray-500 font-medium">{formatCurrency(m.total)}</span>
              <span className="text-[10px] text-gray-400">{m.count} inv</span>
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{
                  height: `${Math.max((m.total / maxBilling) * 100, 5)}%`,
                  background: 'linear-gradient(to top, #0D7377, #2196F3)',
                }}
              />
              <span className="text-[11px] text-gray-600 font-medium">
                {MONTH_NAMES[m.month - 1]} '{String(m.year).slice(2)}
              </span>
            </div>
          ))}
          {stats.monthlyBilling.length === 0 && (
            <div className="flex-1 text-center text-gray-400 text-sm py-12">No billing data</div>
          )}
        </div>
      </div>

      {/* Top 5 Vendors */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 5 Vendors by Billing</h3>
        <div className="space-y-3">
          {topVendors.map((v, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-24 truncate">{v.name}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                <div
                  className="h-full rounded-full flex items-center px-3 transition-all duration-500"
                  style={{
                    width: `${Math.max((v.value / maxVendorValue) * 100, 10)}%`,
                    background: 'linear-gradient(to right, #0D7377, #14919B)',
                  }}
                >
                  <span className="text-[10px] text-white font-medium">{formatCurrency(v.value)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Department Breakdown */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Department-wise Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <div className="text-xl font-bold text-blue-700">{stats.purchaseOrders.total}</div>
            <div className="text-xs text-blue-600 mt-1">Purchase Orders</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-xl">
            <div className="text-xl font-bold text-green-700">{stats.billing.total}</div>
            <div className="text-xs text-green-600 mt-1">Billing Records</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-xl">
            <div className="text-xl font-bold text-purple-700">{stats.vendors.total}</div>
            <div className="text-xs text-purple-600 mt-1">Vendors</div>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-xl">
            <div className="text-xl font-bold text-amber-700">{stats.users.total}</div>
            <div className="text-xs text-amber-600 mt-1">Users</div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ===== Activity Log Tab =====
function ActivityTab({ notifications }: { notifications: Notification[] }) {
  const [filter, setFilter] = useState('all');

  const filterTypes = ['all', 'po', 'invoice', 'payment', 'vendor', 'user'];
  const filtered = filter === 'all'
    ? notifications.slice(0, 50)
    : notifications.filter(n => n.type?.toLowerCase() === filter).slice(0, 50);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Activity Log</h1>
        <span className="text-xs text-gray-400">{filtered.length} entries</span>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {filterTypes.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              filter === t
                ? 'bg-[#0D7377] text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-[#0D7377] hover:text-[#0D7377]'
            }`}
          >
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Activity List */}
      <div className="bg-white rounded-xl shadow-sm max-h-[600px] overflow-y-auto divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No activity records found</div>
        ) : (
          filtered.map(n => (
            <div key={n.id} className="px-5 py-4 flex items-start gap-4 hover:bg-gray-50/50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm shrink-0">
                {getTypeIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-gray-400">{timeAgo(n.created_at)}</div>
                {n.type && (
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full mt-1 inline-block">
                    {n.type}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ===== Settings Tab =====
function SettingsTab({ stats }: { stats: AdminStats | null }) {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [dbStats, setDbStats] = useState<{table: string; rows: number}[]>([]);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const res = await api.get('/company');
        setCompanyInfo(res.data);
      } catch {
        setCompanyInfo(null);
      } finally {
        setLoadingCompany(false);
      }
    };
    fetchCompany();
    api.get('/auth/admin/db-stats').then(res => setDbStats(res.data)).catch(() => {});
  }, []);

  const dbTables = dbStats.length > 0 ? dbStats.map(s => ({ name: s.table, rows: s.rows })) : [
    { name: 'users', rows: stats?.users?.total || 0 },
    { name: 'vendors', rows: stats?.vendors?.total || 0 },
    { name: 'purchase_orders', rows: stats?.purchaseOrders?.total || 0 },
    { name: 'billing_records', rows: stats?.billing?.total || 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Settings</h1>

      {/* Company Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          🏢 Company Information
        </h3>
        {loadingCompany ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : companyInfo ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Company Name</span>
              <span className="font-medium text-gray-800">{companyInfo.name || '—'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">GSTIN</span>
              <span className="font-medium text-gray-800">{companyInfo.gstin || '—'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">PAN</span>
              <span className="font-medium text-gray-800">{companyInfo.pan || '—'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-800">{companyInfo.email || '—'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Phone</span>
              <span className="font-medium text-gray-800">{companyInfo.phone || '—'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Address</span>
              <span className="font-medium text-gray-800 text-right max-w-[200px]">{companyInfo.address || '—'}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No company info configured</p>
        )}
      </div>

      {/* Database Stats */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          🗄️ Database Statistics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {dbTables.map(t => (
            <div key={t.name} className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="text-2xl font-bold text-gray-800">{t.rows}</div>
              <div className="text-xs text-gray-500 mt-1 font-mono">{t.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* App Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          ℹ️ Application Info
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2.5 border-b border-gray-100">
            <span className="text-gray-500">App Name</span>
            <span className="font-medium text-gray-800">Core-Invoice</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-gray-100">
            <span className="text-gray-500">Version</span>
            <span className="font-medium text-gray-800">1.0.0</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-gray-100">
            <span className="text-gray-500">Deployed On</span>
            <span className="font-medium text-gray-800">Render</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-gray-100">
            <span className="text-gray-500">Database</span>
            <span className="font-medium text-gray-800">PostgreSQL</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-gray-100">
            <span className="text-gray-500">Server</span>
            <span className="font-medium text-gray-800">Express + TypeScript</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-gray-500">Client</span>
            <span className="font-medium text-gray-800">React + Vite + Tailwind</span>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-red-100">
        <h3 className="text-sm font-semibold text-red-600 mb-4 flex items-center gap-2">
          ⚠️ Danger Zone
        </h3>
        <p className="text-xs text-gray-500 mb-4">These actions are irreversible. Please proceed with caution.</p>
        <button
          onClick={async () => {
            try {
              const res = await api.get('/auth/admin/export-data', { responseType: 'blob' });
              const url = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }));
              const a = document.createElement('a'); a.href = url; a.download = 'core-invoice-export.json'; a.click(); URL.revokeObjectURL(url);
            } catch (err: any) { alert('Export failed: ' + (err.message || '')); }
          }}
          className="px-4 py-2.5 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          📦 Export Database
        </button>
      </div>
    </div>
  );
}



// ===== Data Management Tab =====
function DataManagementTab() {
  const [dbStats, setDbStats] = useState<{table: string; rows: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanupResult, setCleanupResult] = useState('');
  const [storageStats, setStorageStats] = useState<any>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    api.get('/auth/admin/db-stats').then(res => setDbStats(res.data)).catch(() => {}).finally(() => setLoading(false));
    api.get('/auth/admin/storage-stats').then(res => setStorageStats(res.data)).catch(() => {});
  }, []);

  const handleExport = async (table: string) => {
    try {
      const res = await api.get('/auth/admin/export-data');
      const tableData = res.data[table];
      if (!tableData) { alert('No data for ' + table); return; }
      const csv = [Object.keys(tableData[0] || {}).join(','), ...tableData.map((r: any) => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${table}_export.csv`; a.click(); URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  };

  const handleFullExport = async () => {
    try {
      const res = await api.get('/auth/admin/export-data');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'core-invoice-full-backup.json'; a.click(); URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  };

  const handleCleanup = async () => {
    if (!confirm('This will remove duplicate POs and fix data inconsistencies. Continue?')) return;
    setCleaning(true);
    try {
      const res = await api.post('/auth/admin/cleanup-duplicates');
      setCleanupResult(res.data.message);
      // Refresh stats
      api.get('/auth/admin/db-stats').then(r => setDbStats(r.data)).catch(() => {});
    } catch (err: any) {
      setCleanupResult('❌ ' + (err.response?.data?.error || 'Cleanup failed'));
    } finally {
      setCleaning(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  const totalRows = dbStats.reduce((s, t) => s + t.rows, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Data Management</h1>
        <button onClick={handleFullExport} className="px-4 py-2 bg-[#0D7377] text-white rounded-lg text-sm font-medium hover:bg-[#0a5c5f] transition-colors">
          📦 Full Backup (JSON)
        </button>
      </div>

      {/* Storage Overview */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">📊 Storage Overview</h3>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <div className="text-2xl font-bold text-blue-700">{dbStats.length}</div>
            <div className="text-xs text-blue-600 mt-1">Tables</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-xl">
            <div className="text-2xl font-bold text-green-700">{totalRows.toLocaleString()}</div>
            <div className="text-xs text-green-600 mt-1">Total Records</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-xl">
            <div className="text-2xl font-bold text-purple-700">PostgreSQL</div>
            <div className="text-xs text-purple-600 mt-1">Database Engine</div>
          </div>
        </div>

        {/* Table-wise stats */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Table</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Rows</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dbStats.map(t => (
                <tr key={t.table} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{t.table}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">{t.rows.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleExport(t.table)} className="text-xs text-[#0D7377] hover:underline font-medium">Export CSV</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Storage */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">📄 Document Storage</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-orange-50 rounded-xl border border-orange-100">
            <div className="text-2xl font-bold text-orange-700">{storageStats?.uploadedFiles || 0}</div>
            <div className="text-xs text-orange-600 mt-1">Uploaded Files</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="text-2xl font-bold text-blue-700">{storageStats?.poFiles || 0}</div>
            <div className="text-xs text-blue-600 mt-1">PO PDFs</div>
          </div>
          <div className="text-center p-4 bg-teal-50 rounded-xl border border-teal-100">
            <div className="text-2xl font-bold text-teal-700">{storageStats?.documents || 0}</div>
            <div className="text-xs text-teal-600 mt-1">Documents</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div className="text-2xl font-bold text-purple-700">{storageStats?.totalStorageMB || '0'} MB</div>
            <div className="text-xs text-purple-600 mt-1">Total Storage</div>
          </div>
        </div>
      </div>

      {/* Data Cleanup */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">🧹 Data Cleanup</h3>
        <p className="text-xs text-gray-500 mb-4">Remove duplicate POs, fix expired status, clean orphan records.</p>
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {cleaning ? '🔄 Cleaning...' : '🧹 Run Cleanup'}
        </button>
        {cleanupResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${cleanupResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {cleanupResult}
          </div>
        )}
      </div>

      {/* Bulk Operations */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">🔄 Bulk Operations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border border-gray-200 rounded-xl">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Import Vendors (CSV)</h4>
            <p className="text-xs text-gray-500 mb-3">Upload a CSV file to bulk-create vendors</p>
            <a href="/vendors" className="text-xs text-[#0D7377] hover:underline font-medium">Go to Vendors → Bulk Upload</a>
          </div>
          <div className="p-4 border border-gray-200 rounded-xl">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Import POs (PDF)</h4>
            <p className="text-xs text-gray-500 mb-3">Upload PO PDFs to extract and save</p>
            <a href="/po-reader" className="text-xs text-[#0D7377] hover:underline font-medium">Go to PO Reader</a>
          </div>
        </div>
      </div>
    </div>
  );
}


function SecurityTab() {
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [securitySummary, setSecuritySummary] = useState<any>(null);

  useEffect(() => {
    api.get('/auth/admin/login-history')
      .then(res => setLoginHistory(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get('/auth/admin/security-summary').then(res => setSecuritySummary(res.data)).catch(() => {});
  }, []);

  const failedAttempts = loginHistory.filter(h => !h.success);
  const successfulLogins = loginHistory.filter(h => h.success);

  if (loading) return <div className="text-gray-400 py-12 text-center">Loading security data...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Security</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-green-500 p-5">
          <div className="text-2xl font-bold text-gray-800">{successfulLogins.length}</div>
          <div className="text-xs text-gray-500 mt-1">Successful Logins (last 100)</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-red-500 p-5">
          <div className="text-2xl font-bold text-red-600">{failedAttempts.length}</div>
          <div className="text-xs text-gray-500 mt-1">Failed Attempts</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-blue-500 p-5">
          <div className="text-2xl font-bold text-gray-800">{loginHistory.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Login Events</div>
        </div>
      </div>

      {/* Security Summary */}
      {securitySummary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Today's Activity</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Logins today</span><span className="font-bold text-gray-800">{securitySummary.today.logins}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Failed today</span><span className="font-bold text-red-600">{securitySummary.today.failed}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Last login</span><span className="text-xs text-gray-500">{securitySummary.lastLogin ? timeAgo(securitySummary.lastLogin) : '—'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Last failed</span><span className="text-xs text-red-500">{securitySummary.lastFailed ? timeAgo(securitySummary.lastFailed) : '—'}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Account Status</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Inactive accounts</span><span className="font-bold text-orange-600">{securitySummary.inactiveUsers}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Unapproved accounts</span><span className="font-bold text-amber-600">{securitySummary.unapprovedUsers}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Total login events</span><span className="font-bold text-gray-800">{securitySummary.total.logins}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Total failed attempts</span><span className="font-bold text-red-600">{securitySummary.total.failed}</span></div>
              </div>
            </div>
          </div>

          {/* Suspicious Activity */}
          {securitySummary.topFailedLogins?.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5 border border-red-100">
              <h4 className="text-xs font-semibold text-red-600 uppercase mb-3">⚠️ Suspicious Login IDs (Most Failed Attempts)</h4>
              <div className="space-y-2">
                {securitySummary.topFailedLogins.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm bg-red-50 px-3 py-2 rounded-lg">
                    <span className="font-mono text-gray-700">{item.login_id}</span>
                    <span className="text-red-600 font-bold">{item.attempts} failed attempts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Login History Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Login History</h3>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Login ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">IP Address</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loginHistory.slice(0, 50).map((h: any) => (
                <tr key={h.id} className={`hover:bg-gray-50 ${!h.success ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-2.5">
                    {h.success ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Success</span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">✕ Failed</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 font-medium">{h.user_name || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{h.login_id}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{h.ip_address || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{h.created_at ? timeAgo(h.created_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loginHistory.length === 0 && (
            <div className="py-12 text-center text-gray-400 text-sm">No login history yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Permissions Modal =====
function PermissionsModal({
  user, editPerms, saving, onPermChange, onSave, onClose,
}: {
  user: UserData;
  editPerms: Permission[];
  saving: boolean;
  onPermChange: (module: string, field: keyof Permission, value: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Edit Permissions</h2>
            <p className="text-sm text-gray-500">{user.name} ({user.user_id})</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors">×</button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Module</th>
                <th className="text-center py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">View</th>
                <th className="text-center py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Create</th>
                <th className="text-center py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Edit</th>
                <th className="text-center py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Delete</th>
              </tr>
            </thead>
            <tbody>
              {editPerms.map(perm => (
                <tr key={perm.module} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 capitalize font-medium text-gray-700">{perm.module.replace('_', ' ')}</td>
                  <td className="text-center py-3">
                    <input type="checkbox" checked={!!perm.can_view} onChange={(e) => onPermChange(perm.module, 'can_view', e.target.checked)} className="w-4 h-4 text-[#0D7377] rounded border-gray-300 focus:ring-[#0D7377]" />
                  </td>
                  <td className="text-center py-3">
                    <input type="checkbox" checked={!!perm.can_create} onChange={(e) => onPermChange(perm.module, 'can_create', e.target.checked)} className="w-4 h-4 text-[#0D7377] rounded border-gray-300 focus:ring-[#0D7377]" />
                  </td>
                  <td className="text-center py-3">
                    <input type="checkbox" checked={!!perm.can_edit} onChange={(e) => onPermChange(perm.module, 'can_edit', e.target.checked)} className="w-4 h-4 text-[#0D7377] rounded border-gray-300 focus:ring-[#0D7377]" />
                  </td>
                  <td className="text-center py-3">
                    <input type="checkbox" checked={!!perm.can_delete} onChange={(e) => onPermChange(perm.module, 'can_delete', e.target.checked)} className="w-4 h-4 text-[#0D7377] rounded border-gray-300 focus:ring-[#0D7377]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button onClick={onSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-[#0D7377] rounded-lg hover:bg-[#0a5c5f] transition-colors disabled:opacity-50 shadow-sm">
            {saving ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}
