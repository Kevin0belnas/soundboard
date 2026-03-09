import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CloserDashboard from "./pages/closer/CloserDashboard";

// ---------------- Protected Route ----------------
const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) return <Navigate to="/login" replace />;
  if (allowedRole && role !== allowedRole) return <Navigate to="/unauthorized" replace />;

  return children;
};

// ---------------- Public Route ----------------
const PublicRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (token && role) {
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "closer") return <Navigate to="/closer" replace />;
  }

  return children;
};

// ---------------- Unauthorized Page ----------------
const Unauthorized = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100">
    <div className="bg-white p-8 rounded-lg shadow-md text-center">
      <h1 className="text-2xl font-bold text-red-600 mb-4">Unauthorized Access</h1>
      <p className="text-gray-600 mb-4">You don't have permission to access this page.</p>
      <button
        onClick={() => window.location.href = "/login"}
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        Go to Login
      </button>
    </div>
  </div>
);

function App() {
  // Login/logout callbacks
  const handleLogin = (userData) => {
    localStorage.setItem("token", userData.token);
    localStorage.setItem("role", userData.role);
    localStorage.setItem("name", userData.name);
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login onLogin={handleLogin} />
            </PublicRoute>
          }
        />

        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Admin Protected Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/scripts"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard onLogout={handleLogout} initialView="scripts" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/logs"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard onLogout={handleLogout} initialView="logs" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/addagents"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard onLogout={handleLogout} initialView="addagents" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/agentlist"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard onLogout={handleLogout} initialView="agentlist" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/voice-soundboard"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard onLogout={handleLogout} initialView="voice-soundboard" />
            </ProtectedRoute>
          }
        />

        

        {/* Agent Routes - commented for now */}
        {/*
        <Route
          path="/opener"
          element={
            <ProtectedRoute allowedRole="opener">
              <OpenerAgent onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        */}

        {/* Closer Routes */}
        <Route
          path="/closer"
          element={
            <ProtectedRoute allowedRole="closer">
              <CloserDashboard onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/closer/scripts"
          element={
            <ProtectedRoute allowedRole="closer">
              <CloserDashboard onLogout={handleLogout} initialView="scripts" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/closer/voice-soundboard"
          element={
            <ProtectedRoute allowedRole="closer">
              <CloserDashboard onLogout={handleLogout} initialView="voice-soundboard" />
            </ProtectedRoute>
          }
        />
       

        {/* Default & catch-all */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;