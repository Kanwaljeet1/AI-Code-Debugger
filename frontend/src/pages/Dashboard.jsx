import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../store/auth.js';

const languages = ['javascript', 'typescript', 'python', 'cpp', 'java'];

export default function Dashboard() {
  const [title, setTitle] = useState('Help me with recursion');
  const [language, setLanguage] = useState('javascript');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [recent, setRecent] = useState([]);
  const [activeRooms, setActiveRooms] = useState([]);
  const [loadingActive, setLoadingActive] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const createRoom = async () => {
    const { data } = await api.post('/rooms', { title, language });
    navigate(`/room/${data.roomId}`);
  };

  const joinRoom = () => {
    if (roomIdInput.trim()) navigate(`/room/${roomIdInput.trim()}`);
  };

  useEffect(() => {
    // In a full app we'd fetch user's recent rooms. Stub empty for now.
    setRecent([]);
    fetchActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchActive = async () => {
    try {
      setLoadingActive(true);
      const { data } = await api.get('/rooms/active');
      setActiveRooms(data.rooms || []);
    } catch (err) {
      console.error('Failed to load active rooms', err);
    } finally {
      setLoadingActive(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Start a session</h2>
        <div className="grid cols-2">
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Language</label>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="flex" style={{ marginTop: 12 }}>
          <button className="button primary" onClick={createRoom}>Create room</button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Join existing room</h3>
        <div className="flex" style={{ gap: 10 }}>
          <input className="input" placeholder="Room ID" value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value)} />
          <button className="button" onClick={joinRoom}>Join</button>
        </div>
      </div>

      <div className="panel">
        <div className="flex space-between">
          <h3 style={{ margin: 0 }}>Recent rooms</h3>
          <span className="badge">Employee dashboard</span>
        </div>
        {recent.length === 0 && <p className="muted">No rooms yet. Create one to begin.</p>}
      </div>

      <div className="panel">
        <div className="flex space-between">
          <div>
            <h3 style={{ margin: 0 }}>Active sessions</h3>
            <small className="muted">Live rooms with connected participants</small>
          </div>
          <button className="button inline" onClick={fetchActive} disabled={loadingActive}>
            {loadingActive ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {activeRooms.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>No live rooms right now.</p>
        ) : (
          <div className="list" style={{ marginTop: 12 }}>
            {activeRooms.map((r) => (
              <div className="list-item" key={r.roomId}>
                <div>
                  <strong>{r.title}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.language} · {r.activeConnections} live · {r.handsRaised} hands up
                  </div>
                </div>
                <button className="button inline" onClick={() => navigate(`/room/${r.roomId}`)}>Join</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
