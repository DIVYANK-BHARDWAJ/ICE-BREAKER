'use client';

import { useState, useEffect, useRef } from 'react';
import { questions } from '@/lib/questions';

interface SessionState {
    currentQuestionIndex: number;
    timerStartTime: string | null;
    timerDuration: number;
    showAnswers: boolean;
    isLocked: boolean;
    isEnded: boolean;
    serverTime: string;
}

interface LeaderboardEntry {
    rank: number;
    name: string;
    usn: string;
    score: number;
    correctCount: number;
}

export default function PublicLeaderboardPage() {
    const [sessionState, setSessionState] = useState<SessionState | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [clientServerOffset, setClientServerOffset] = useState<number>(0);
    const [timeLeft, setTimeLeft] = useState<number>(0);

    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Poll session state every 2 seconds and leaderboard every 3 seconds
    useEffect(() => {
        fetchSessionState();
        fetchLeaderboard();

        const sessionInterval = setInterval(fetchSessionState, 2000);
        const leaderboardInterval = setInterval(fetchLeaderboard, 3000);

        return () => {
            clearInterval(sessionInterval);
            clearInterval(leaderboardInterval);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, []);

    const timerParamsRef = useRef({ startTime: 0, duration: 10 });
    const offsetRef = useRef(0);

    useEffect(() => {
        offsetRef.current = clientServerOffset;
    }, [clientServerOffset]);

    // Sync real-time countdown timer based on client-server time offset
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
            setTimeLeft(remaining);
        };

        updateTimer();
        timerIntervalRef.current = setInterval(updateTimer, 200);

        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [sessionState?.timerStartTime, sessionState?.timerDuration]);

    const fetchSessionState = async () => {
        try {
            const res = await fetch('/api/session-state');
            const data = await res.json();
            if (data.success) {
                const serverTimeMs = new Date(data.serverTime).getTime();
                const offset = serverTimeMs - Date.now();
                setClientServerOffset(offset);

                setSessionState({
                    currentQuestionIndex: data.currentQuestionIndex,
                    timerStartTime: data.timerStartTime,
                    timerDuration: data.timerDuration,
                    showAnswers: data.showAnswers,
                    isLocked: data.isLocked,
                    isEnded: data.isEnded,
                    serverTime: data.serverTime
                });
            }
        } catch (e) {
            console.error('Error fetching session state:', e);
        }
    };

    const fetchLeaderboard = async () => {
        try {
            const res = await fetch('/api/leaderboard');
            const data = await res.json();
            if (data.success) {
                setLeaderboard(data.leaderboard);
            }
        } catch (e) {
            console.error('Error fetching leaderboard:', e);
        }
    };

    if (!sessionState) {
        return (
            <div className="glass-container">
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <div className="pulsing-loader"></div>
                    <div className="waiting-message">Syncing Leaderboard Screen...</div>
                </div>
            </div>
        );
    }

    const currentIdx = sessionState.currentQuestionIndex;
    const isCompleted = currentIdx >= questions.length || sessionState.isEnded;
    const activeQ = !isCompleted ? questions[currentIdx] : null;

    // Podium rankings mapping
    const top3 = leaderboard.slice(0, 3);
    const runnersUp = leaderboard.slice(3);

    // Find the Gold, Silver, Bronze entries
    const firstPlace = top3[0] || null;
    const secondPlace = top3[1] || null;
    const thirdPlace = top3[2] || null;

    // Ticking indicator check
    const isTimerDanger = timeLeft <= 3 && timeLeft > 0;

    return (
        <div className="projector-container">
            {/* 1. END OF QUIZ CELEBRATORY SCREEN */}
            {isCompleted ? (
                <div className="glass-card" style={{ padding: 48, borderRadius: 32, border: '1px solid rgba(0, 242, 254, 0.15)' }}>
                    <h1 style={{ fontSize: '3rem', marginBottom: 8, background: 'linear-gradient(135deg, #fff 30%, var(--primary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Ice Breaker Championships
                    </h1>
                    <p className="subtitle" style={{ fontSize: '1.25rem', marginBottom: 12 }}>
                        ✨ The battle has concluded. Here are your final champions! ✨
                    </p>

                    {/* Celebration Podium */}
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
                                    <div className="podium-user-name" style={{ fontSize: '1.3rem', color: '#ffd700' }} title={firstPlace.name}>{firstPlace.name}</div>
                                    <div className="podium-user-usn">{firstPlace.usn}</div>
                                </div>
                                <div className="podium-box">
                                    <div className="podium-number">1</div>
                                    <div className="podium-pts" style={{ color: '#ffd700', fontSize: '1.15rem' }}>{firstPlace.score} pts</div>
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

                    {/* Rest of the Standings (Ranks 4+) */}
                    <div style={{ marginTop: 40 }}>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center' }}>
                            Full Rankings & Results
                        </h2>
                        
                        {runnersUp.length === 0 && top3.length === 0 ? (
                            <div className="empty-leaderboard">No registrations logged.</div>
                        ) : (
                            <div className="leaderboard-container" style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 16, border: '1px solid var(--glass-border)' }}>
                                <div className="leaderboard-row header" style={{ padding: '16px 24px' }}>
                                    <div className="rank-col" style={{ fontSize: '1rem' }}>Rank</div>
                                    <div className="name-col" style={{ fontSize: '1rem' }}>Player</div>
                                    <div className="score-col" style={{ fontSize: '1rem' }}>Total Score</div>
                                </div>
                                {leaderboard.map((entry) => (
                                    <div key={entry.usn} className="leaderboard-row" style={{ padding: '14px 24px', background: entry.rank <= 3 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                        <div className="rank-col" style={{ fontWeight: entry.rank <= 3 ? 700 : 500 }}>
                                            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                                        </div>
                                        <div className="name-col">
                                            <span className="name-text" style={{ fontSize: '1rem', fontWeight: entry.rank <= 3 ? 700 : 500 }}>{entry.name}</span>
                                            <span className="usn-text" style={{ fontSize: '0.8rem' }}>{entry.usn}</span>
                                        </div>
                                        <div className="score-col" style={{ fontWeight: 700, color: entry.rank === 1 ? '#ffd700' : 'var(--text-main)', fontSize: '1rem' }}>
                                            {entry.score} pts ({entry.correctCount} correct)
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* 2. ACTIVE RUNNING GAME SCREEN */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'stretch' }}>
                    
                    {/* Left: Ticking Question Timer, Current Q Metadata */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 40, margin: 0, borderRadius: 28 }}>
                        <span className="badge" style={{ alignSelf: 'center', marginBottom: 12, padding: '8px 18px', fontSize: '0.85rem' }}>
                            {activeQ?.section}
                        </span>
                        
                        <h2 style={{ fontSize: '1.8rem', textAlign: 'center', margin: '8px 0 24px 0' }}>
                            Question {currentIdx + 1} of {questions.length}
                        </h2>

                        {/* Synced Timer Countdown Panel */}
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

                        {/* Graphic Status indicator */}
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

                    {/* Right: Live Running Standings (Leaderboard preview) */}
                    <div className="glass-card" style={{ padding: 40, margin: 0, borderRadius: 28, display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: 20, borderBottom: '1px solid var(--glass-border)', paddingBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Standings Leaderboard</span>
                            <span className="badge" style={{ color: 'var(--text-muted)' }}>{leaderboard.length} players</span>
                        </h2>

                        {leaderboard.length === 0 ? (
                            <div className="waiting-message" style={{ margin: 'auto' }}>
                                Awaiting player registrations...
                            </div>
                        ) : (
                            <div className="leaderboard-container" style={{ flexGrow: 1, overflowY: 'auto' }}>
                                <div className="leaderboard-row header" style={{ padding: '12px 16px' }}>
                                    <div className="rank-col" style={{ width: 50 }}>Rk</div>
                                    <div className="name-col">Player</div>
                                    <div className="score-col">Score</div>
                                </div>
                                {leaderboard.map((entry) => (
                                    <div 
                                        key={entry.usn} 
                                        className="leaderboard-row" 
                                        style={{ 
                                            padding: '14px 16px',
                                            background: entry.rank <= 3 ? 'rgba(0, 242, 254, 0.02)' : 'transparent',
                                            borderColor: entry.rank <= 3 ? 'rgba(0, 242, 254, 0.08)' : 'var(--glass-border)'
                                        }}
                                    >
                                        <div className="rank-col" style={{ width: 50, fontWeight: entry.rank <= 3 ? 700 : 500 }}>
                                            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                                        </div>
                                        <div className="name-col">
                                            <span className="name-text" style={{ fontSize: '1rem', fontWeight: entry.rank <= 3 ? 700 : 500 }}>{entry.name}</span>
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
