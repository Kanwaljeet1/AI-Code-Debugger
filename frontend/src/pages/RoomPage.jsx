import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import api from '../api/client.js';
import { useAuth } from '../store/auth.js';

const LANGUAGE_LABEL = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  cpp: 'C++',
  java: 'Java'
};

export default function RoomPage() {
  const { roomId } = useParams();
  const { token, user } = useAuth();
  const [room, setRoom] = useState(null);
  const [code, setCode] = useState('// Loading...');
  const [language, setLanguage] = useState('javascript');
  const [status, setStatus] = useState('disconnected');
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState([]);
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [presenceCount, setPresenceCount] = useState(0);
  const [hands, setHands] = useState([]);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState('');
  const [handBusy, setHandBusy] = useState(false);

  const socketRef = useRef();
  const editorRef = useRef();

  const pcRef = useRef();
  const localStreamRef = useRef();
  const remoteAudioRef = useRef();

  const myMember = room?.members?.find((m) => m.userId === user?.id);
  const canRun = myMember?.permissions?.run !== false;
  const canWrite = myMember?.permissions?.write !== false;

  useEffect(() => {
    loadRoom();
    return () => {
      socketRef.current?.disconnect();
      hangup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const loadRoom = async () => {
    try {
      const { data } = await api.get(`/rooms/${roomId}`);
      setRoom(data.room);
      setRevisions(data.revisions || []);
      setPresenceCount(data.presence || 0);
      setHands(data.hands || []);
      setIsHandRaised((data.hands || []).some((h) => h.userId === user?.id));
      const last = data.revisions?.[0];
      setCode(last?.code || '// New file');
      setLanguage(data.room?.language || 'javascript');
      connectSocket();
    } catch (err) {
      setStatus('error');
      console.error(err);
    }
  };

  const connectSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const url = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const socket = io(url, {
      auth: { token },
      transports: ['websocket']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('online');
      socket.emit('join-room', { roomId });
    });

    socket.on('disconnect', () => setStatus('disconnected'));

    socket.on('code:update', ({ code: incoming, userId }) => {
      if (userId === user?.id) return;
      setCode(incoming);
    });

    socket.on('chat:message', (payload) => setChat((prev) => [...prev, payload]));

    socket.on('execution:done', ({ result }) => setRunResult(result));

    socket.on('call:signal', handleSignal);

    socket.on('presence:update', ({ count }) => setPresenceCount(count || 0));

    socket.on('hand:raise', (entry) => {
      if (!entry?.userId) return;
      setHands((prev) => {
        const exists = prev.find((h) => h.userId === entry?.userId);
        if (exists) return prev;
        return [...prev, entry];
      });
      if (entry?.userId === user?.id) setIsHandRaised(true);
    });

    socket.on('hand:update', ({ hands: list }) => {
      setHands(list || []);
      if (!(list || []).some((h) => h.userId === user?.id)) setIsHandRaised(false);
    });

    socket.on('save:revision', (rev) => {
      setRevisions((prev) => [rev, ...prev].slice(0, 50));
    });
  };

  const handleSignal = async ({ data, from }) => {
    if (!pcRef.current) await ensurePeerConnection();
    const pc = pcRef.current;
    if (data.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const stream = await ensureLocalStream();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('call:signal', { roomId, data: answer });
    } else if (data.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.candidate) {
      try { await pc.addIceCandidate(data); } catch (err) { console.error(err); }
    }
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  };

  const ensurePeerConnection = async () => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('call:signal', { roomId, data: event.candidate });
      }
    };
    pc.ontrack = (event) => {
      const [remote] = event.streams;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remote;
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    const pc = await ensurePeerConnection();
    const stream = await ensureLocalStream();
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current.emit('call:signal', { roomId, data: offer });
  };

  const hangup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };

  const handleCodeChange = (value) => {
    if (!canWrite) return;
    setCode(value);
    socketRef.current?.emit('code:update', { roomId, code: value });
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const payload = { message: chatInput.trim(), userId: user?.id, createdAt: new Date().toISOString() };
    setChat((prev) => [...prev, payload]);
    socketRef.current?.emit('chat:message', { roomId, message: chatInput.trim() });
    setChatInput('');
  };

  const refreshRevisions = async () => {
    const { data } = await api.get(`/rooms/${roomId}/revisions`);
    setRevisions(data.revisions || []);
  };

  const saveSnapshot = async () => {
    setSaving(true);
    try {
      await api.post(`/rooms/${roomId}/save`, { code, language, message: 'Manual save' });
      await refreshRevisions();
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const raiseHandRequest = async () => {
    setHandBusy(true);
    try {
      await api.post(`/rooms/${roomId}/hand`);
      setIsHandRaised(true);
    } catch (err) {
      console.error('Raise hand failed', err);
    } finally {
      setHandBusy(false);
    }
  };

  const clearHand = async (userId) => {
    setHandBusy(true);
    try {
      await api.post(`/rooms/${roomId}/hand/clear`, { userId: userId || user?.id });
      if (!userId || userId === user?.id) setIsHandRaised(false);
    } catch (err) {
      console.error('Clear hand failed', err);
    } finally {
      setHandBusy(false);
    }
  };

  const restoreRevision = async (rev) => {
    if (!rev?._id) return;
    setRestoringId(rev._id);
    try {
      await api.post(`/rooms/${roomId}/revisions/${rev._id}/restore`);
      setCode(rev.code);
      socketRef.current?.emit('code:update', { roomId, code: rev.code });
      await refreshRevisions();
    } catch (err) {
      console.error('Restore failed', err);
    } finally {
      setRestoringId('');
    }
  };

  const copyRevisionLink = async (rev) => {
    if (!rev?._id || !navigator?.clipboard) return;
    const link = `${window.location.origin}/room/${roomId}?rev=${rev._id}`;
    await navigator.clipboard.writeText(link);
    setChat((prev) => [...prev, { message: 'Revision link copied', userId: 'system', createdAt: new Date().toISOString() }]);
  };

  const runCode = async () => {
    if (!canRun) {
      setRunResult({ status: 'blocked', stderr: 'Runs are disabled for your role in this room.' });
      return;
    }
    setRunning(true);
    setRunResult(null);
    try {
      const { data } = await api.post(`/rooms/${roomId}/run`, { code, language, stdin: '' });
      setRunResult(data.result);
      socketRef.current?.emit('execution:done', { roomId, execId: data.execId, result: data.result });
    } catch (err) {
      setRunResult({ status: 'error', stderr: err.response?.data?.error || err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="flex space-between">
        <div>
          <h2 style={{ margin: '0 0 4px' }}>{room?.title || 'Room'} · {roomId}</h2>
          <div className="flex" style={{ gap: 8 }}>
            <small className="muted">{LANGUAGE_LABEL[language] || language}</small>
            <span className="badge">Live {presenceCount || 1}</span>
            <span className="badge">Hands {hands.length}</span>
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <span className="badge" style={{ background: status === 'online' ? 'rgba(29,211,176,0.15)' : 'rgba(255,99,132,0.12)' }}>{status}</span>
          <button className="button inline" onClick={saveSnapshot} disabled={saving || !canWrite}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="button inline" onClick={startCall}>Start call</button>
          <button className="button inline" onClick={hangup}>Hang up</button>
        </div>
      </div>

      <div className="room-layout">
        <div className="panel" style={{ minHeight: 520 }}>
          <div className="flex space-between" style={{ marginBottom: 8 }}>
            <div className="flex" style={{ gap: 10 }}>
              <label className="label" style={{ marginBottom: 0 }}>Language</label>
              <select className="input" style={{ width: 160, marginBottom: 0 }} value={language} onChange={(e) => setLanguage(e.target.value)}>
                {Object.keys(LANGUAGE_LABEL).map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>)}
              </select>
            </div>
            <div className="flex" style={{ gap: 10 }}>
              <button className="button inline" onClick={runCode} disabled={running || !canRun}>{running ? 'Running…' : 'Run'}</button>
            </div>
          </div>
          <Editor
            height="420px"
            defaultLanguage={language}
            language={language}
            theme="vs-dark"
            value={code}
            onChange={handleCodeChange}
            onMount={(editor) => { editorRef.current = editor; }}
            options={{ fontSize: 14, fontFamily: 'JetBrains Mono', minimap: { enabled: false }, readOnly: !canWrite }}
          />
          <div className="statusbar">
            {status === 'online' ? 'Connected' : 'Reconnecting...'} | Role: {user?.role} | Peers: {presenceCount || 1}
          </div>
          {runResult && (
            <div className="panel" style={{ background: '#0f1727', marginTop: 12 }}>
              <strong>Run result: {runResult.status}</strong>
              {runResult.stdout && <pre style={{ whiteSpace: 'pre-wrap' }}>{runResult.stdout}</pre>}
              {runResult.stderr && <pre style={{ whiteSpace: 'pre-wrap', color: '#fda4af' }}>{runResult.stderr}</pre>}
            </div>
          )}
        </div>

        <div className="grid" style={{ gap: 12 }}>
          <div className="panel">
            <div className="flex space-between" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>Chat & Voice</h3>
                <small className="muted">Raise hand to request TA</small>
              </div>
              <span className="badge">{hands.length} in queue</span>
            </div>
            <div className="chat-log">
              {chat.map((c, idx) => (
                <div key={idx} className={`chat-line ${c.userId === user?.id ? 'me' : ''}`}>
                  <small className="muted">{c.userId === user?.id ? 'You' : c.userId || 'Peer'} · {new Date(c.createdAt).toLocaleTimeString()}</small>
                  <div>{c.message}</div>
                </div>
              ))}
            </div>
            <div className="flex" style={{ marginTop: 10, gap: 8 }}>
              <input className="input" placeholder="Type a message" value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
              <button className="button" onClick={sendChat}>Send</button>
            </div>
            <div className="flex" style={{ marginTop: 10, gap: 8 }}>
              <button className="button inline" onClick={isHandRaised ? () => clearHand(user?.id) : raiseHandRequest} disabled={handBusy}>
                {isHandRaised ? 'Lower hand' : 'Raise hand'}
              </button>
              {user?.role === 'ta' && hands.length > 0 && (
                <button className="button inline" onClick={() => clearHand()} disabled={handBusy}>Clear queue</button>
              )}
            </div>
            {hands.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>Hands queue</strong>
                <div className="list" style={{ marginTop: 8 }}>
                  {hands.map((h) => (
                    <div className="list-item" key={h.userId}>
                      <div>
                        <div>{h.userId}</div>
                        <small className="muted">{new Date(h.raisedAt).toLocaleTimeString()}</small>
                      </div>
                      {user?.role === 'ta' && (
                        <button className="button inline" onClick={() => clearHand(h.userId)} disabled={handBusy}>Mark helped</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <audio ref={remoteAudioRef} autoPlay playsInline />
            </div>
          </div>

          <div className="panel">
            <div className="flex space-between" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Version history</h3>
              <button className="button inline" onClick={refreshRevisions}>Reload</button>
            </div>
            {revisions.length === 0 ? (
              <p className="muted">No revisions yet.</p>
            ) : (
              <div className="list">
                {revisions.map((rev) => (
                  <div className="list-item" key={rev._id} style={{ alignItems: 'flex-start' }}>
                    <div>
                      <strong>{rev.message || 'Snapshot'}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {new Date(rev.createdAt).toLocaleString()} · {rev.language}
                      </div>
                    </div>
                    <div className="flex" style={{ gap: 6 }}>
                      <button className="button inline" onClick={() => { setLanguage(rev.language || language); setCode(rev.code); }}>Load</button>
                      <button className="button inline" onClick={() => restoreRevision(rev)} disabled={restoringId === rev._id}>
                        {restoringId === rev._id ? 'Restoring…' : 'Restore'}
                      </button>
                      <button className="button inline" onClick={() => copyRevisionLink(rev)}>Share</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
