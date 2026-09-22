'use client';

import { useState, useEffect, useRef } from 'react';
import { questions } from '@/lib/questions';
import { useSSE } from '@/lib/useSSE';

interface SessionState {
    currentQuestionIndex: number;
    timerStartTime: string | null;
    timerDuration: number;
    showAnswers: boolean;
    isLocked: boolean;
    isEnded: boolean;
    serverTime: string;
    leaderboardRevealed: boolean;
    badgesAwarded?: boolean;
}

interface PlayerStatus {
    name: string;
    usn: string;
    score: number;
    correctCount: number;
    answered: boolean;
}

export default function HiddenAdminPage() {
    const [password, setPassword] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authError, setAuthError] = useState('');
    
    // Live states
    const [sessionState, setSessionState] = useState<SessionState | null>(null);
    const [players, setPlayers] = useState<PlayerStatus[]>([]);
    const [customDuration, setCustomDuration] = useState<string>('');
    const [actionError, setActionError] = useState('');
    const [resetConfirm, setResetConfirm] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');

    const [pollingActive, setPollingActive] = useState(true);
    const [showProjector, setShowProjector] = useState(false);

    // Synchronized countdown timer states
    const [clientServerOffset, setClientServerOffset] = useState<number>(0);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Save admin password in localStorage on successful authenticate
    useEffect(() => {
        const savedPass = localStorage.getItem('admin_pass');
        if (savedPass) {
            setPassword(savedPass);
            verifyPasswordOnMount(savedPass);
        }
    }, []);

    // Status polling
    useEffect(() => {
        if (!isAuthenticated) return;

        let interval: NodeJS.Timeout;
        if (pollingActive) {
            fetchStatus(); // immediate
            interval = setInterval(fetchStatus, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isAuthenticated, password, pollingActive]);

    // SSE listener for instant updates — bypasses polling interval lag
    useSSE({
        'session-update': () => fetchStatus(),
        'leaderboard-update': () => fetchStatus(),
    });

    const timerParamsRef = useRef({ startTime: 0, duration: 10 });
    const offsetRef = useRef(0);

    useEffect(() => {
        offsetRef.current = clientServerOffset;
    }, [clientServerOffset]);

    // Keep local countdown updated based on server time offset
    useEffect(() => {
        if (!sessionState || !sessionState.timerStartTime) {
            setTimeLeft(0);
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
            return;
        }

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        timerParamsRef.current = {
            startTime: new Date(sessionState.timerStartTime).getTime(),
            duration: sessionState.timerDuration
        };

        const updateTimer = () => {
            const { startTime, duration } = timerParamsRef.current;
            const currentServerTime = Date.now() + offsetRef.current;
            const elapsed = (currentServerTime - startTime) / 1000;
            const remaining = Math.max(0, duration - elapsed);
            
            const rounded = Math.ceil(remaining);
            setTimeLeft((prev) => (prev !== rounded ? rounded : prev));
        };

        updateTimer();
        timerIntervalRef.current = setInterval(updateTimer, 200);

        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [sessionState?.timerStartTime, sessionState?.timerDuration]);

    const verifyPasswordOnMount = async (pass: string) => {
        try {
            const res = await fetch('/api/admin/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'status', password: pass })
            });
            const data = await res.json();
            if (data.success) {
                setIsAuthenticated(true);
            } else {
                localStorage.removeItem('admin_pass');
            }
        } catch (e) {}
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');

        try {
            const res = await fetch('/api/admin/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'status', password })
            });
            const data = await res.json();
            if (data.success) {
                setIsAuthenticated(true);
                localStorage.setItem('admin_pass', password);
            } else {
                setAuthError(data.error || 'Invalid password.');
            }
        } catch (e) {
            setAuthError('Connection failure.');
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/admin/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'status', password })
            });
            const data = await res.json();
            if (data.success) {
                setSessionState(data.sessionState);
                setPlayers(data.playersStatus);
                // Sync client-server time offset
                const serverTimeMs = new Date(data.sessionState.serverTime).getTime();
                const offset = serverTimeMs - Date.now();
                setClientServerOffset(offset);
            } else {
                setActionError(data.error || 'Failed to sync status.');
            }
        } catch (e) {
            console.error('Polling error', e);
        }
    };

    const sendControl = async (action: string, durationOverride?: number): Promise<boolean> => {
        setActionError('');
        try {
            const res = await fetch('/api/admin/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action, 
                    password,
                    duration: durationOverride 
                })
            });
            const data = await res.json();
            if (data.success) {
                setSessionState(data.sessionState);
                setPlayers(data.playersStatus);
                setActionError('');
                // Sync client-server time offset
                const serverTimeMs = new Date(data.sessionState.serverTime).getTime();
                const offset = serverTimeMs - Date.now();
                setClientServerOffset(offset);
                return true;
            } else {
                setActionError(data.error || 'Action failed.');
                return false;
            }
        } catch (e) {
            setActionError('Connection failed.');
            return false;
        }
    };

    const handleRelease = () => {
        if (!sessionState) return;
        const q = questions[sessionState.currentQuestionIndex];
        const duration = customDuration ? parseInt(customDuration, 10) : q.timer;
        if (isNaN(duration) || duration <= 0) {
            setActionError('Invalid duration entered.');
            return;
        }
        sendControl('release', duration);
    };

    const removePlayer = async (usn: string) => {
        if (!confirm(`Remove player ${usn}? This cannot be undone.`)) return;
        setActionError('');
        try {
            const res = await fetch('/api/admin/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove-player', password, usn })
            });
            const data = await res.json();
            if (data.success) {
                setSessionState(data.sessionState);
                setPlayers(data.playersStatus);
            } else {
                setActionError(data.error || 'Failed to remove player.');
            }
        } catch (e) {
            setActionError('Connection failed.');
        }
    };

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setResetSuccess('');
        setActionError('');

        if (resetConfirm !== 'RESET') {
            setActionError('Please type RESET to confirm deletion.');
            return;
        }

        try {
            const res = await fetch('/api/admin/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) {
                setResetSuccess('Quiz database successfully wiped!');
                setResetConfirm('');
                fetchStatus();
            } else {
                setActionError(data.error || 'Reset failed.');
            }
        } catch (e) {
            setActionError('Reset connection failure.');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('admin_pass');
        setIsAuthenticated(false);
        setPassword('');
    };

    // 1. PASSWORD GATE
    if (!isAuthenticated) {
        return (
            <div className="glass-container" style={{ maxWidth: 450 }}>
                <div className="glass-card">
                    <h1>ADMIN CONSOLE</h1>
                    <div className="subtitle" style={{ marginBottom: 24, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                        Protocol X // Coordinator Access
                    </div>

                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">Access Password</label>
                            <input 
                                type="password" 
                                className="form-control" 
                                placeholder="Enter admin password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {authError && <div className="answer-reveal wrong" style={{ marginTop: 0, marginBottom: 20 }}>❌ {authError}</div>}
                        <button type="submit" className="btn">AUTHENTICATE</button>
                    </form>
                </div>
            </div>
        );
    }

    if (!sessionState) {
        return (
            <div className="glass-container">
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <div className="pulsing-loader"></div>
                    <div className="waiting-message">Syncing Session Data...</div>
                </div>
            </div>
        );
    }

    if (showProjector) {
        const top3 = players.slice(0, 3);
        const runnersUp = players.slice(3);
        const firstPlace = top3[0] || null;
        const secondPlace = top3[1] || null;
        const thirdPlace = top3[2] || null;
        const isCompleted = sessionState.currentQuestionIndex >= questions.length || sessionState.isEnded;
        const activeQ = !isCompleted ? questions[sessionState.currentQuestionIndex] : null;
        const isTimerDanger = timeLeft <= 3 && timeLeft > 0;

        return (
            <div className="projector-container" style={{ position: 'relative', maxWidth: 1200, margin: '0 auto' }}>
                <button
                    onClick={() => setShowProjector(false)}
                    style={{
                        position: 'fixed', top: 16, left: 16, zIndex: 100,
                        padding: '10px 20px', borderRadius: 10, border: 'none',
                        background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer',
                        fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(8px)'
                    }}
                >
                    ← Back to Dashboard
                </button>

                {sessionState.isEnded || isCompleted ? (
                    <div className="glass-card" style={{ padding: 48, borderRadius: 20 }}>
                        <h1 style={{ fontSize: '2.5rem', marginBottom: 8 }}>
                            PROTOCOL X // CHAMPIONSHIPS
                        </h1>
                        <p className="subtitle" style={{ fontSize: '1.1rem', marginBottom: 16 }}>
                            The challenge has concluded. Official final standings:
                        </p>
                        <div className="celebration-podium">
                            {secondPlace && (
                                <div className="podium-column second">
                                    <div className="podium-user-info">
                                        <span className="podium-avatar">🥈</span>
                                        <div className="podium-user-name" title={secondPlace.name}>{secondPlace.name}</div>
                                        <div className="podium-user-usn">{secondPlace.usn}</div>
                                    </div>
                                    <div className="podium-box">
                                        <div className="podium-number">2</div>
                                        <div className="podium-pts">{secondPlace.score} pts</div>
                                        <div className="podium-correct-badge">{secondPlace.correctCount} correct</div>
                                    </div>
                                </div>
                            )}
                            {firstPlace && (
                                <div className="podium-column first">
                                    <div className="podium-user-info">
                                        <span className="podium-avatar">👑</span>
                                        <div className="podium-user-name" style={{ fontSize: '1.25rem', color: '#ffd700' }} title={firstPlace.name}>{firstPlace.name}</div>
                                        <div className="podium-user-usn">{firstPlace.usn}</div>
                                    </div>
                                    <div className="podium-box">
                                        <div className="podium-number">1</div>
                                        <div className="podium-pts" style={{ color: '#ffd700', fontSize: '1.1rem' }}>{firstPlace.score} pts</div>
                                        <div className="podium-correct-badge" style={{ borderColor: 'rgba(255,215,0,0.3)', color: '#ffd700' }}>{firstPlace.correctCount} correct</div>
                                    </div>
                                </div>
                            )}
                            {thirdPlace && (
                                <div className="podium-column third">
                                    <div className="podium-user-info">
                                        <span className="podium-avatar">🥉</span>
                                        <div className="podium-user-name" title={thirdPlace.name}>{thirdPlace.name}</div>
                                        <div className="podium-user-usn">{thirdPlace.usn}</div>
                                    </div>
                                    <div className="podium-box">
                                        <div className="podium-number">3</div>
                                        <div className="podium-pts">{thirdPlace.score} pts</div>
                                        <div className="podium-correct-badge">{thirdPlace.correctCount} correct</div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 40 }}>
                            <h2 style={{ fontSize: '1.5rem', marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' }}>
                                Full Rankings & Results
                            </h2>
                            {runnersUp.length === 0 && top3.length === 0 ? (
                                <div className="empty-leaderboard">No registrations logged.</div>
                            ) : (
                                <div className="leaderboard-container" style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 16, border: '1px solid var(--glass-border)' }}>
                                    <div className="leaderboard-row header" style={{ padding: '16px 24px' }}>
                                        <div className="rank-col" style={{ fontSize: '1rem', width: 70 }}>Rank</div>
                                        <div className="name-col" style={{ fontSize: '1rem' }}>Player</div>
                                        <div className="score-col" style={{ fontSize: '1rem' }}>Total Score</div>
                                    </div>
                                    {players.map((entry, idx) => (
                                        <div key={entry.usn} className="leaderboard-row" style={{ padding: '14px 24px', background: idx < 3 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                            <div className="rank-col" style={{ fontWeight: idx < 3 ? 700 : 500, width: 70 }}>
                                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                            </div>
                                            <div className="name-col">
                                                <span className="name-text" style={{ fontSize: '1rem', fontWeight: idx < 3 ? 700 : 500 }}>{entry.name}</span>
                                                <span className="usn-text" style={{ fontSize: '0.8rem' }}>{entry.usn}</span>
                                            </div>
                                            <div className="score-col" style={{ fontWeight: 700, color: idx === 0 ? '#ffd700' : 'var(--text-main)', fontSize: '1rem' }}>
                                                {entry.score} pts ({entry.correctCount} correct)
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'stretch' }}>
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 40, margin: 0, borderRadius: 28 }}>
                            <span className="badge" style={{ alignSelf: 'center', marginBottom: 12, padding: '8px 18px', fontSize: '0.85rem' }}>
                                {activeQ?.section}
                            </span>
                            <h2 style={{ fontSize: '1.8rem', textAlign: 'center', margin: '8px 0 24px 0' }}>
                                Question {sessionState.currentQuestionIndex + 1} of {questions.length}
                            </h2>
                            <div className="projector-timer-container">
                                <div className="projector-timer-label">
                                    {!sessionState.timerStartTime
                                        ? 'Awaiting release'
                                        : sessionState.isLocked || timeLeft <= 0
                                        ? 'Submissions locked'
                                        : 'Seconds Remaining'}
                                </div>
                                <div className={`projector-timer-countdown ${isTimerDanger ? 'danger' : ''}`}>
                                    {!sessionState.timerStartTime
                                        ? '--'
                                        : sessionState.isLocked || timeLeft <= 0
                                        ? '00'
                                        : Math.ceil(timeLeft).toString().padStart(2, '0')}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: 12 }}>
                                {!sessionState.timerStartTime ? (
                                    <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '1.1rem' }}>
                                        <span className="pulsing-loader" style={{ width: 24, height: 24, borderWidth: 2, margin: 0 }}></span>
                                        Waiting for coordinator to launch question...
                                    </div>
                                ) : sessionState.isLocked || timeLeft <= 0 ? (
                                    <div style={{ color: 'var(--danger)', fontSize: '1.25rem', fontWeight: 800, letterSpacing: 1 }}>
                                        🔒 ANSWERS LOCKED FOR THIS ROUND
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--primary)', fontSize: '1.25rem', fontWeight: 800, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                        <span className="status-indicator active" style={{ position: 'relative', top: 'auto', left: 'auto' }}></span>
                                        SUBMISSIONS OPEN - PLACE YOUR GUESSES!
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="glass-card" style={{ padding: 40, margin: 0, borderRadius: 28, display: 'flex', flexDirection: 'column' }}>
                            <h2 style={{ fontSize: '1.5rem', marginBottom: 20, borderBottom: '1px solid var(--glass-border)', paddingBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Standings Leaderboard</span>
                                <span className="badge" style={{ color: 'var(--text-muted)' }}>{players.length} players</span>
                            </h2>
                            {players.length === 0 ? (
                                <div className="waiting-message" style={{ margin: 'auto' }}>
                                    Awaiting player registrations...
                                </div>
                            ) : (
                                <div className="leaderboard-container" style={{ flexGrow: 1, overflowY: 'auto' }}>
                                    <div className="leaderboard-row header" style={{ padding: '12px 16px' }}>
                                        <div className="rank-col" style={{ width: 70 }}>Rank</div>
                                        <div className="name-col">Player</div>
                                        <div className="score-col">Score</div>
                                    </div>
                                    {players.map((entry, idx) => (
                                        <div
                                            key={entry.usn}
                                            className="leaderboard-row"
                                            style={{
                                                padding: '14px 16px',
                                                background: idx < 3 ? 'rgba(0, 242, 254, 0.02)' : 'transparent',
                                                borderColor: idx < 3 ? 'rgba(0, 242, 254, 0.08)' : 'var(--glass-border)'
                                            }}
                                        >
                                            <div className="rank-col" style={{ width: 70, fontWeight: idx < 3 ? 700 : 500 }}>
                                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                            </div>
                                            <div className="name-col">
                                                <span className="name-text" style={{ fontSize: '1rem', fontWeight: idx < 3 ? 700 : 500 }}>{entry.name}</span>
                                                <span className="usn-text" style={{ fontSize: '0.75rem' }}>{entry.usn}</span>
                                            </div>
                                            <div className="score-col" style={{ fontWeight: 700, fontSize: '1rem' }}>
                                                {entry.score} pts
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const currentIdx = sessionState.currentQuestionIndex;
    const isCompleted = currentIdx >= questions.length;
    const q = !isCompleted ? questions[currentIdx] : null;

    const answeredCount = players.filter(p => p.answered).length;
    const totalPlayers = players.length;

    // Use the synchronized real-time countdown timer
    const timerVal = timeLeft;

    // 2. DASHBOARD & LEADERBOARD CELEBRATION VIEW
    if (sessionState.isEnded) {
        const top3 = players.slice(0, 3);
        const runnersUp = players.slice(3);
        const firstPlace = top3[0] || null;
        const secondPlace = top3[1] || null;
        const thirdPlace = top3[2] || null;

        return (
            <div className="admin-container" style={{ maxWidth: 1000 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div>
                        <h1 style={{ textAlign: 'left', marginBottom: 4 }}>Session Completed</h1>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            The active quiz has concluded. Champions are celebrated below.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <button 
                            onClick={async () => {
                                await sendControl('reveal-leaderboard');
                                setShowProjector(true);
                            }}
                            className="btn"
                            style={{ 
                                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', 
                                color: '#000', 
                                fontWeight: 800, 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 8,
                                cursor: 'pointer',
                                border: 'none',
                                padding: '10px 22px',
                                fontSize: '0.9rem',
                                letterSpacing: '0.05em',
                                boxShadow: '0 0 20px rgba(0, 242, 254, 0.4), 0 4px 12px rgba(0,0,0,0.3)',
                                borderRadius: '8px'
                            }}
                        >
                            🖥️ OPEN PROJECTOR VIEW ↗
                        </button>
                        <button onClick={handleLogout} className="badge" style={{ cursor: 'pointer', padding: '10px 16px' }}>Log Out</button>
                    </div>
                </div>

                {actionError && <div className="answer-reveal wrong" style={{ marginBottom: 24 }}>⚠️ Error: {actionError}</div>}
                {resetSuccess && <div className="answer-reveal correct" style={{ marginBottom: 24 }}>✅ Success: {resetSuccess}</div>}

                {/* Celebratory Podium */}
                <div className="glass-card" style={{ padding: 40, marginBottom: 24, border: '1px solid rgba(0, 242, 254, 0.15)' }}>
                    <h2 style={{ fontSize: '1.6rem', textAlign: 'center', marginBottom: 8 }}>🏆 Final Champions Podium 🏆</h2>
                    <p className="subtitle" style={{ fontSize: '0.95rem', marginBottom: 20 }}>Official standings for this ice-breaker session</p>

                    <div className="celebration-podium">
                        {/* 2ND PLACE */}
                        {secondPlace && (
                            <div className="podium-column second">
                                <div className="podium-user-info">
                                    <span className="podium-avatar">🥈</span>
                                    <div className="podium-user-name" title={secondPlace.name}>{secondPlace.name}</div>
                                    <div className="podium-user-usn">{secondPlace.usn}</div>
                                </div>
                                <div className="podium-box">
                                    <div className="podium-number">2</div>
                                    <div className="podium-pts">{secondPlace.score} pts</div>
                                    <div className="podium-correct-badge">{secondPlace.correctCount} correct</div>
                                </div>
                            </div>
                        )}

                        {/* 1ST PLACE */}
                        {firstPlace && (
                            <div className="podium-column first">
                                <div className="podium-user-info">
                                    <span className="podium-avatar">👑</span>
                                    <div className="podium-user-name" style={{ fontSize: '1.25rem', color: '#ffd700' }} title={firstPlace.name}>{firstPlace.name}</div>
                                    <div className="podium-user-usn">{firstPlace.usn}</div>
                                </div>
                                <div className="podium-box">
                                    <div className="podium-number">1</div>
                                    <div className="podium-pts" style={{ color: '#ffd700', fontSize: '1.1rem' }}>{firstPlace.score} pts</div>
                                    <div className="podium-correct-badge" style={{ borderColor: 'rgba(255,215,0,0.3)', color: '#ffd700' }}>{firstPlace.correctCount} correct</div>
                                </div>
                            </div>
                        )}

                        {/* 3RD PLACE */}
                        {thirdPlace && (
                            <div className="podium-column third">
                                <div className="podium-user-info">
                                    <span className="podium-avatar">🥉</span>
                                    <div className="podium-user-name" title={thirdPlace.name}>{thirdPlace.name}</div>
                                    <div className="podium-user-usn">{thirdPlace.usn}</div>
                                </div>
                                <div className="podium-box">
                                    <div className="podium-number">3</div>
                                    <div className="podium-pts">{thirdPlace.score} pts</div>
                                    <div className="podium-correct-badge">{thirdPlace.correctCount} correct</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="admin-grid">
                    {/* Full Final Rankings */}
                    <div className="glass-card" style={{ padding: 24, margin: 0 }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: 16, borderBottom: '1px solid var(--glass-border)', paddingBottom: 8 }}>
                            All Standings & Scores ({players.length} players)
                        </h2>
                        <div className="leaderboard-container" style={{ maxHeight: 350, overflowY: 'auto' }}>
                            <div className="leaderboard-row header" style={{ padding: '10px 16px' }}>
                                <div className="rank-col" style={{ width: 70 }}>Rank</div>
                                <div className="name-col">Player</div>
                                <div className="score-col">Score</div>
                            </div>
                            {players.length === 0 ? (
                                <div className="empty-leaderboard">No registrations logged.</div>
                            ) : (
                                players.map((p, idx) => (
                                    <div key={p.usn} className="leaderboard-row" style={{ padding: '12px 16px' }}>
                                        <div className="rank-col" style={{ width: 70, fontSize: '0.85rem' }}>#{idx + 1}</div>
                                        <div className="name-col">
                                            <span className="name-text" style={{ fontSize: '0.85rem', fontWeight: idx < 3 ? 700 : 500 }}>{p.name}</span>
                                            <span className="usn-text" style={{ fontSize: '0.7rem' }}>{p.usn}</span>
                                        </div>
                                        <div className="score-col" style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>{p.score} pts ({p.correctCount} correct)</span>
                                            <button 
                                                onClick={() => removePlayer(p.usn)} 
                                                style={{ background: 'rgba(255,50,50,0.2)', color: '#ff5050', border: '1px solid rgba(255,50,50,0.3)', borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer' }}
                                                title="Remove player"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Reset Panel */}
                    <div className="glass-card" style={{ padding: 24, border: '1px solid rgba(255, 42, 95, 0.25)', height: 'fit-content' }}>
                        <h2 style={{ fontSize: '1.2rem', color: 'var(--danger)', marginBottom: 16, borderBottom: '1px solid rgba(255, 42, 95, 0.15)', paddingBottom: 8 }}>
                            Game Master Controls
                        </h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                            To reset the game back to question 1 and wipe all registrations, answers, and scores, type <strong>RESET</strong> below:
                        </p>
                        <form onSubmit={handleReset}>
                            <input 
                                type="text" 
                                className="form-control" 
                                style={{ padding: 12, marginBottom: 12, borderColor: 'rgba(255, 42, 95, 0.2)' }}
                                placeholder="Type RESET"
                                value={resetConfirm}
                                onChange={(e) => setResetConfirm(e.target.value)}
                                required
                            />
                            <button type="submit" className="btn btn-danger" style={{ padding: 12, fontSize: '0.95rem' }} disabled={resetConfirm !== 'RESET'}>
                                ⚠️ Reset & Start New Session
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ textAlign: 'left', marginBottom: 4 }}>Live Admin Dashboard</h1>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        <span className={`status-indicator ${pollingActive ? 'active' : 'inactive'}`}></span>
                        {pollingActive ? 'Real-time synchronization active' : 'Sync paused'}
                        <button 
                            onClick={() => setPollingActive(!pollingActive)} 
                            className="badge" 
                            style={{ marginLeft: 12, cursor: 'pointer', background: 'transparent' }}
                        >
                            {pollingActive ? 'Pause' : 'Resume'}
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button 
                        onClick={async () => {
                            await sendControl('reveal-leaderboard');
                            setShowProjector(true);
                        }}
                        className="btn"
                        style={{ 
                            background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', 
                            color: '#000', 
                            fontWeight: 800, 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 8,
                            cursor: 'pointer',
                            border: 'none',
                            padding: '10px 22px',
                            fontSize: '0.9rem',
                            letterSpacing: '0.05em',
                            boxShadow: '0 0 20px rgba(0, 242, 254, 0.4), 0 4px 12px rgba(0,0,0,0.3)',
                            borderRadius: '8px'
                        }}
                    >
                        🖥️ OPEN PROJECTOR VIEW ↗
                    </button>
                    <button onClick={handleLogout} className="badge" style={{ cursor: 'pointer', padding: '10px 16px' }}>Log Out</button>
                </div>
            </div>

            {actionError && <div className="answer-reveal wrong" style={{ marginBottom: 24 }}>⚠️ Error: {actionError}</div>}
            {resetSuccess && <div className="answer-reveal correct" style={{ marginBottom: 24 }}>✅ Success: {resetSuccess}</div>}

            <div className="admin-grid">
                
                {/* Left Side: Game Controls & Preview */}
                <div>
                    {/* State info */}
                    <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                        {/* Quiz Progress Bar */}
                        <div className="progress-container" style={{ marginBottom: 16 }}>
                            <div className="progress-bar" style={{ width: `${(currentIdx / questions.length) * 100}%` }}></div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--glass-border)', paddingBottom: 8 }}>
                            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Quiz Status</h2>
                            {!!sessionState.timerStartTime && !sessionState.isEnded && (
                                <div className={`timer-wrapper ${timerVal <= 3 && timerVal > 0 ? 'danger' : ''}`} style={{ width: 48, height: 48 }}>
                                    <svg className="timer-svg" viewBox="0 0 100 100">
                                        <circle className="timer-track" cx="50" cy="50" r="45" style={{ strokeWidth: 8 }}></circle>
                                        <circle 
                                            className="timer-fill" 
                                            cx="50" 
                                            cy="50" 
                                            r="45"
                                            style={{ 
                                                strokeWidth: 8,
                                                strokeDasharray: 282.7,
                                                strokeDashoffset: 282.7 * (1 - Math.min(1, timerVal / (sessionState.timerDuration || 10)))
                                            }}
                                        ></circle>
                                    </svg>
                                    <div className="timer-text" style={{ fontSize: '0.9rem' }}>{Math.ceil(timerVal)}</div>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>QUIZ STATUS</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                    {sessionState.isEnded ? (
                                        <span style={{ color: 'var(--danger)' }}>SESSION ENDED</span>
                                    ) : isCompleted ? (
                                        'Completed'
                                    ) : (
                                        `Question ${currentIdx + 1} / ${questions.length}`
                                    )}
                                </div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>TIMER STATE</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                    {sessionState.isEnded ? (
                                        <span style={{ color: 'var(--text-muted)' }}>Stopped</span>
                                    ) : !sessionState.timerStartTime ? (
                                        <span style={{ color: 'var(--text-muted)' }}>Waiting to start</span>
                                    ) : timerVal <= 0 || sessionState.isLocked ? (
                                        <span style={{ color: 'var(--danger)' }}>LOCKED</span>
                                    ) : (
                                        <span style={{ color: 'var(--primary)' }}>RUNNING ({Math.ceil(timerVal)}s)</span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ANSWER STATUS</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                    {sessionState.isEnded ? (
                                        <span style={{ color: 'var(--primary)' }}>REVEALED FINAL</span>
                                    ) : sessionState.showAnswers ? (
                                        <span style={{ color: 'var(--primary)' }}>REVEALED</span>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>HIDDEN</span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>PLAYER SUBMISSIONS</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                    {answeredCount} / {totalPlayers} answered
                                </div>
                            </div>
                        </div>

                        {/* Interactive Buttons */}
                        <div style={{ marginTop: 24, borderTop: '1px solid var(--glass-border)', paddingTop: 20 }}>
                            <span className="form-label">Control Panel</span>
                            
                            <div className="admin-btn-group">
                                <button 
                                    onClick={() => sendControl('prev')} 
                                    className="btn btn-secondary"
                                    disabled={currentIdx === 0 || sessionState.isEnded}
                                >
                                    ◀ Previous Question
                                </button>
                                <button 
                                    onClick={() => sendControl('next')} 
                                    className="btn btn-secondary"
                                    disabled={isCompleted || currentIdx >= questions.length - 1 || sessionState.isEnded}
                                >
                                    Next Question ▶
                                </button>
                            </div>

                            <div style={{ marginTop: 12 }}>
                                <button 
                                    onClick={() => {
                                        if (confirm('Are you sure you want to end the session? This will immediately stop the quiz, calculate final scores, and release leaderboard standings to all player devices.')) {
                                            sendControl('end');
                                        }
                                    }} 
                                    className="btn btn-danger"
                                    style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                                    disabled={sessionState.isEnded}
                                >
                                    🛑 End Active Session
                                </button>
                            </div>

                            {!isCompleted && (
                                <>
                                    <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'flex-end' }}>
                                        <div style={{ flexGrow: 1 }}>
                                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Release timer duration (seconds)</label>
                                            <input 
                                                type="number" 
                                                className="form-control" 
                                                style={{ padding: 12 }}
                                                placeholder={`Default: ${q?.timer}s`}
                                                value={customDuration}
                                                onChange={(e) => setCustomDuration(e.target.value)}
                                            />
                                        </div>
                                        <button 
                                            onClick={handleRelease} 
                                            className="btn" 
                                            style={{ width: 'auto', padding: '14px 24px', flexShrink: 0 }}
                                            disabled={!!sessionState.timerStartTime && !sessionState.isLocked && timerVal > 0}
                                        >
                                            🚀 Start/Release Timer
                                        </button>
                                    </div>

                                    <div className="admin-btn-group" style={{ marginTop: 16 }}>
                                        <button 
                                            onClick={() => sendControl('lock')} 
                                            className="btn btn-danger"
                                            disabled={!sessionState.timerStartTime || sessionState.isLocked}
                                        >
                                            🔒 Lock Answers
                                        </button>
                                        <button 
                                            onClick={() => sendControl('reveal')} 
                                            className="btn" 
                                            style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--secondary) 100%)', boxShadow: 'none', color: '#fff' }}
                                            disabled={!sessionState.isLocked && timerVal > 0}
                                        >
                                            👁️ Reveal Analytics
                                        </button>
                                        <button 
                                            onClick={() => sendControl('award-badges')} 
                                            className="btn" 
                                            style={{ 
                                                background: sessionState.badgesAwarded ? 'linear-gradient(135deg, #20c997 0%, #00f2fe 100%)' : 'linear-gradient(135deg, #00f2fe 0%, #4cc9f0 100%)', 
                                                color: '#000',
                                                fontWeight: 800,
                                                boxShadow: sessionState.badgesAwarded ? '0 0 16px rgba(32, 201, 151, 0.4)' : 'none'
                                            }}
                                            disabled={!sessionState.showAnswers}
                                        >
                                            {sessionState.badgesAwarded ? '🏅 Badges Awarded! (Click to Toggle Analytics)' : '🏅 Award Mascot Badges'}
                                        </button>
                                    </div>

                                    <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                                        <button 
                                            onClick={async () => {
                                                await sendControl('reveal-leaderboard');
                                                setShowProjector(true);
                                            }}
                                            className="btn"
                                            style={{ 
                                                flex: 1,
                                                background: 'linear-gradient(135deg, #4cc9f0 0%, #4361ee 100%)', 
                                                color: '#fff', 
                                                fontWeight: 800, 
                                                padding: '12px 18px',
                                                fontSize: '0.95rem',
                                                boxShadow: '0 0 18px rgba(67, 97, 238, 0.4)',
                                                border: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            🖥️ OPEN PROJECTOR / STANDINGS VIEW ↗
                                        </button>
                                        <a
                                            href="/leaderboard"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn"
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.08)',
                                                border: '1px solid var(--glass-border)',
                                                color: '#fff',
                                                fontWeight: 700,
                                                padding: '12px 18px',
                                                fontSize: '0.9rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 6,
                                                textDecoration: 'none',
                                                borderRadius: '8px'
                                            }}
                                        >
                                            🔗 Standalone Window ↗
                                        </a>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Question Details Preview */}
                    {q && (
                        <div className="glass-card" style={{ padding: 24 }}>
                            <h2 style={{ fontSize: '1.2rem', marginBottom: 16, borderBottom: '1px solid var(--glass-border)', paddingBottom: 8 }}>Question Preview</h2>
                            
                            {/* Giant Synced Timer Preview for Coordinator during quiz */}
                            {!!sessionState.timerStartTime && !sessionState.isLocked && timerVal > 0 && (
                                <div style={{ 
                                    background: 'rgba(0,0,0,0.2)', 
                                    border: '1px solid rgba(0, 242, 254, 0.12)', 
                                    borderRadius: 14, 
                                    padding: '12px 20px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    marginBottom: 16,
                                    boxShadow: '0 0 15px rgba(0, 242, 254, 0.05)'
                                }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                                        ⏳ Active Countdown:
                                    </span>
                                    <span className={timerVal <= 3 ? 'timer-wrapper danger' : ''} style={{ 
                                        fontSize: '1.8rem', 
                                        fontWeight: 900, 
                                        color: timerVal <= 3 ? 'var(--danger)' : '#fff',
                                        fontFamily: 'monospace'
                                    }}>
                                        {Math.ceil(timerVal).toString().padStart(2, '0')}s
                                    </span>
                                </div>
                            )}

                            <div style={{ marginBottom: 12 }}>
                                <span className="badge">{q.section}</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, margin: '8px 0' }}>{q.question}</div>
                            </div>

                            {/* Images displays for MCQ-Image / Emoji */}
                            {(q.type === 'mcq-image' || q.type === 'emoji') && q.images && (
                                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                    {q.images.map((img, imgIdx) => (
                                        <div key={imgIdx} style={{ height: 100, border: '1px solid var(--glass-border)', padding: 6, borderRadius: 8, background: '#000' }}>
                                            <img src={img} alt="preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Options listing */}
                            {q.options && (
                                <ul style={{ listStyle: 'none', paddingLeft: 0, marginBottom: 16 }}>
                                    {q.options.map((opt, optIdx) => {
                                        const isCorrect = optIdx === q.answer;
                                        return (
                                            <li 
                                                key={optIdx} 
                                                style={{ 
                                                    padding: 10, 
                                                    border: '1px solid var(--glass-border)', 
                                                    borderRadius: 8, 
                                                    marginBottom: 8,
                                                    background: isCorrect ? 'rgba(0, 242, 254, 0.08)' : 'transparent',
                                                    borderColor: isCorrect ? 'var(--primary)' : 'var(--glass-border)',
                                                    fontWeight: isCorrect ? 700 : 500
                                                }}
                                            >
                                                {optIdx + 1}. {opt} {isCorrect ? '✅ (Correct Answer)' : ''}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {/* Emoji Answer */}
                            {q.type === 'emoji' && (
                                <div style={{ padding: 12, border: '1px solid var(--primary)', background: 'rgba(0, 242, 254, 0.08)', borderRadius: 8, fontWeight: 700 }}>
                                    🔑 Correct Answer String: &quot;{q.answer}&quot;
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Side: Participant List */}
                <div>
                    {/* Live Players check status */}
                    <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: 16, borderBottom: '1px solid var(--glass-border)', paddingBottom: 8 }}>
                            Connected Players ({totalPlayers})
                        </h2>
                        
                        {totalPlayers === 0 ? (
                            <div className="waiting-message" style={{ padding: 20 }}>No players registered yet.</div>
                        ) : (
                            <>
                                <div style={{ marginBottom: 12, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Checklist showing who has submitted answers for the active question:
                                </div>
                                <div className="players-check-grid">
                                    {players.map((p) => (
                                        <div 
                                            key={p.usn} 
                                            className={`player-status-badge ${p.answered ? 'answered' : 'waiting'}`}
                                            title={`${p.name} (${p.usn})`}
                                        >
                                            {p.answered ? '✅ ' : '⏳ '}
                                            {p.name}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Standings Table */}
                    <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: 16, borderBottom: '1px solid var(--glass-border)', paddingBottom: 8 }}>
                            Live Standings
                        </h2>
                        <div className="leaderboard-container" style={{ maxHeight: 300, overflowY: 'auto' }}>
                            <div className="leaderboard-row header" style={{ padding: '10px 16px' }}>
                                <div className="rank-col" style={{ width: 70 }}>Rank</div>
                                <div className="name-col">Player</div>
                                <div className="score-col">Score</div>
                            </div>
                            {players.length === 0 ? (
                                <div className="empty-leaderboard">No registrations yet.</div>
                            ) : (
                                players.map((p, idx) => (
                                    <div key={p.usn} className="leaderboard-row" style={{ padding: '10px 16px' }}>
                                        <div className="rank-col" style={{ width: 70, fontSize: '0.85rem' }}>#{idx + 1}</div>
                                        <div className="name-col">
                                            <span className="name-text" style={{ fontSize: '0.85rem' }}>{p.name}</span>
                                            <span className="usn-text" style={{ fontSize: '0.7rem' }}>{p.usn}</span>
                                        </div>
                                        <div className="score-col" style={{ fontSize: '0.85rem' }}>
                                            {p.score} pts ({p.correctCount} correct)
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Dangerous Wiping Area */}
                    <div className="glass-card" style={{ padding: 24, border: '1px solid rgba(255, 42, 95, 0.25)' }}>
                        <h2 style={{ fontSize: '1.2rem', color: 'var(--danger)', marginBottom: 16, borderBottom: '1px solid rgba(255, 42, 95, 0.15)', paddingBottom: 8 }}>
                            Danger Zone
                        </h2>
                        <form onSubmit={handleReset}>
                            <label className="form-label" style={{ color: 'var(--text-muted)' }}>
                                To completely wipe all player registrations, scores, and resets back to question 1, type <strong style={{ color: '#fff' }}>RESET</strong> below:
                            </label>
                            <input 
                                type="text" 
                                className="form-control" 
                                style={{ padding: 12, marginBottom: 12, borderColor: 'rgba(255, 42, 95, 0.2)' }}
                                placeholder="Type RESET"
                                value={resetConfirm}
                                onChange={(e) => setResetConfirm(e.target.value)}
                                required
                            />
                            <button type="submit" className="btn btn-danger" style={{ padding: 12, fontSize: '0.95rem' }} disabled={resetConfirm !== 'RESET'}>
                                ⚠️ Reset Entire Session
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}
