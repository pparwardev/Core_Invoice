import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import SplashScreen from './pages/SplashScreen';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import VendorsPage from './pages/VendorsPage';
import VendorDetailPage from './pages/VendorDetailPage';
import TaxInvoicePage from './pages/TaxInvoicePage';
import POReaderPage from './pages/POReaderPage';
import CompanyInfoPage from './pages/CompanyInfoPage';
import BillDetailPage from './pages/BillDetailPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PostSplashRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // After splash, redirect based on role
    if (location.pathname === '/') {
      if (user) {
        navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [navigate, location.pathname, user]);

  return null;
}

function AdminRedirect() {
  const { user } = useAuth();
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const { logout } = useAuth();

  const handleSplashFinish = () => {
    // Clear any existing session so user must login fresh each time app starts
    logout();
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  return (
    <>
      <PostSplashRedirect />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<AdminRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="vendors/:id" element={<VendorDetailPage />} />
          <Route path="billing" element={<TaxInvoicePage />} />
          <Route path="billing/:vendorId" element={<TaxInvoicePage />} />
          <Route path="po-reader" element={<POReaderPage />} />
          <Route path="company" element={<CompanyInfoPage />} />
          <Route path="bill/:billingRecordId" element={<BillDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}
