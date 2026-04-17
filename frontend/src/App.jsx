import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './store/auth.js';
import LoginPage from './pages/LoginPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RoomPage from './pages/RoomPage.jsx';
import DebugAssistant from './pages/DebugAssistant.jsx';
import AIDebuggerStandalone from './pages/AIDebuggerStandalone.jsx';

function Protected({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function PublicOnly({ children }) {
  const { token } = useAuth();
  return token ? <Navigate to="/" replace /> : children;
}

export default function App() {
  const { user, logout, token } = useAuth();
  return (
    <div className="app-shell">
      <nav className="navbar">
        <div className="brand">AI Debugging Assistant</div>
        <div className="flex" style={{ gap: '12px' }}>
          {!token ? (
            <>
              <Link to="/login" className="button inline">Login</Link>
              <Link to="/signup" className="button inline">Sign up</Link>
            </>
          ) : (
            <>
              <Link to="/" className="button inline">Home</Link>
              <Link to="/codemate" className="button inline">Collab Rooms</Link>
              <small className="muted">{user?.email}</small>
              <button className="button inline" onClick={logout}>Logout</button>
            </>
          )}
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Protected><AIDebuggerStandalone /></Protected>} />
        <Route path="/debugger" element={<Protected><DebugAssistant /></Protected>} />
        <Route path="/codemate" element={<Protected><Dashboard /></Protected>} />
        <Route path="/room/:roomId" element={<Protected><RoomPage /></Protected>} />
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><LoginPage defaultMode="register" /></PublicOnly>} />
        <Route path="*" element={<Navigate to={token ? '/' : '/login'} replace />} />
      </Routes>
    </div>
  );
}
