'use client';

import { useState, useEffect, useRef } from 'react';
import { questions } from '@/lib/questions';
import { useSSE } from '@/lib/useSSE';
import { OPTION_GRADIENTS, OPTION_BORDER_COLORS, OPTION_GLOW_COLORS, MASCOT_DETAILS } from '@/lib/mascots';

interface SessionState {
    currentQuestionIndex: number;
    timerStartTime: string | null;
    timerDuration: number;
    showAnswers: boolean;
    isLocked: boolean;
    isEnded: boolean;
    serverTime: string;
    totalResponses?: number;
    optionDistribution?: Record<string, number>;
}

interface LeaderboardEntry {
    rank: number;
    name: string;
    usn: string;
    score: number;
    correctCount: number;
    earnedBadges?: number[];
}

export default function PublicLeaderboardPage() {
    const [sessionState, setSessionState] = useState<SessionState | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [clientServerOffset, setClientServerOffset] = useState<number>(0);
    const [timeLeft, setTimeLeft] = useState<number>(0);

    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Poll session state every 500ms and leaderboard every 3 seconds
    useEffect(() => {
        fetchSessionState();
        fetchLeaderboard();

        const sessionInterval = setInterval(fetchSessionState, 500);
        const leaderboardInterval = setInterval(fetchLeaderboard, 3000);

        return () => {
            clearInterval(sessionInterval);
            clearInterval(leaderboardInterval);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, []);

    // SSE listener for instant updates — bypasses polling interval lag
    useSSE({
        'session-update': () => fetchSessionState(),
        'leaderboard-update': () => fetchLeaderboard(),
    });

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
            
            const rounded = Math.ceil(remaining);
            setTimeLeft((prev) => (prev !== rounded ? rounded : prev));
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
                    serverTime: data.serverTime,
                    totalResponses: data.totalResponses,
                    optionDistribution: data.optionDistribution
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

    const renderBadges = (badges?: number[]) => {
        if (!badges || badges.length === 0) return null;
        return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                {badges.map((bId, idx) => {
                    const mascot = MASCOT_DETAILS[bId];
                    if (!mascot) return null;
                    return (
                        <img 
                            key={idx} 
                            src={mascot.image} 
                            alt={mascot.name} 
                            title={`${mascot.name} (${mascot.title})`}
                            style={{ 
                                width: 26, 
                                height: 26, 
                                borderRadius: '50%', 
                                border: '1.5px solid var(--accent)',
                                boxShadow: '0 0 6px var(--accent-glow)',
                                objectFit: 'cover'
                            }} 
                        />
                    );
                })}
            </div>
        );
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
                <div className="glass-card" style={{ padding: 48, borderRadius: 20 }}>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: 8 }}>
                        PROTOCOL X // CHAMPIONSHIPS
                    </h1>
                    <p className="subtitle" style={{ fontSize: '1.1rem', marginBottom: 16 }}>
                        The challenge has concluded. Official final standings:
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
                                    {renderBadges(secondPlace.earnedBadges)}
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
                                    <div className="podium-user-name" style={{ fontSize: '1.2rem', color: 'var(--metal-light)' }} title={firstPlace.name}>{firstPlace.name}</div>
                                    <div className="podium-user-usn">{firstPlace.usn}</div>
                                    {renderBadges(firstPlace.earnedBadges)}
                                </div>
                                <div className="podium-box">
                                    <div className="podium-number">1</div>
                                    <div className="podium-pts" style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>{firstPlace.score} pts</div>
                                    <div className="podium-correct-badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>{firstPlace.correctCount} correct</div>
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
                                    {renderBadges(thirdPlace.earnedBadges)}
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
                        <h2 style={{ fontSize: '1.1rem', marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center' }}>
                            Full Standings &amp; Mascot Badges Earned
                        </h2>
                        
                        {runnersUp.length === 0 && top3.length === 0 ? (
                            <div className="empty-leaderboard">No registrations logged.</div>
                        ) : (
                            <div className="leaderboard-container">
                                <div className="leaderboard-row header" style={{ padding: '14px 20px' }}>
                                    <div className="rank-col" style={{ fontSize: '0.85rem' }}>Rank</div>
                                    <div className="name-col" style={{ fontSize: '0.85rem' }}>Participant</div>
                                    <div className="score-col" style={{ fontSize: '0.85rem' }}>Total Score &amp; Badges</div>
                                </div>
                                {leaderboard.map((entry) => (
                                    <div key={entry.usn} className="leaderboard-row" style={{ padding: '14px 20px', alignItems: 'center' }}>
                                        <div className="rank-col" style={{ fontWeight: entry.rank <= 3 ? 700 : 500 }}>
                                            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                                        </div>
                                        <div className="name-col">
                                            <span className="name-text" style={{ fontSize: '0.95rem', fontWeight: entry.rank <= 3 ? 700 : 500 }}>{entry.name}</span>
                                            <span className="usn-text" style={{ fontSize: '0.75rem' }}>{entry.usn}</span>
                                        </div>
                                        <div className="score-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                            <span style={{ fontWeight: 700, color: entry.rank === 1 ? 'var(--accent)' : 'var(--text-primary)', fontSize: '0.95rem' }}>
                                                {entry.score} pts ({entry.correctCount} correct)
                                            </span>
                                            {renderBadges(entry.earnedBadges)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* 2. ACTIVE RUNNING GAME SCREEN */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'stretch' }}>
                    
                    {/* Left: Ticking Question Timer / Analytics Reveal Panel */}
                    {sessionState.showAnswers && activeQ ? (
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', padding: 28, margin: 0, justifyContent: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span className="badge">{activeQ.section}</span>
                                <span className="badge" style={{ background: 'var(--surface-raised)', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 }}>
                                    OFFICIAL REVEAL
                                </span>
                            </div>

                            <h3 style={{ fontSize: '1.25rem', margin: '4px 0 16px 0', fontFamily: 'var(--font-display)', color: '#fff' }}>
                                Question {currentIdx + 1}: {activeQ.question}
                            </h3>

                            {/* Clean Percentage Analytics Breakdown with Smooth Fluid Multi-Color Fill Bars */}
                            {(() => {
                                const totalResp = sessionState.totalResponses || 0;

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {activeQ.options?.map((optText, optIdx) => {
                                            const isCorrect = optIdx === activeQ.answer;
                                            const count = sessionState.optionDistribution?.[optIdx.toString()] || 0;
                                            const percent = totalResp > 0 ? Math.round((count / totalResp) * 100) : 0;
                                            
                                            const gradient = OPTION_GRADIENTS[optIdx % OPTION_GRADIENTS.length];
                                            const borderColor = isCorrect ? 'var(--accent)' : OPTION_BORDER_COLORS[optIdx % OPTION_BORDER_COLORS.length];
                                            const glowColor = isCorrect ? 'rgba(232, 38, 44, 0.5)' : OPTION_GLOW_COLORS[optIdx % OPTION_GLOW_COLORS.length];

                                            return (
                                                <div 
                                                    key={optIdx} 
                                                    className={`analytics-option-card ${isCorrect ? 'correct-winner' : ''}`}
                                                    style={{
                                                        '--card-border-color': borderColor,
                                                        '--card-glow-color': glowColor,
                                                        animationDelay: `${optIdx * 0.12}s`,
                                                        padding: '12px 16px'
                                                    } as React.CSSProperties}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ 
                                                                fontFamily: 'var(--font-display)', 
                                                                fontWeight: 800, 
                                                                fontSize: '0.75rem', 
                                                                color: '#fff',
                                                                background: isCorrect ? 'var(--accent)' : 'var(--surface-raised)',
                                                                padding: '2px 7px',
                                                                borderRadius: 4
                                                            }}>
                                                                {String.fromCharCode(65 + optIdx)}
                                                            </span>
                                                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: isCorrect ? '#FFFFFF' : 'var(--text-primary)' }}>
                                                                {optText}
                                                            </span>
                                                            {isCorrect && (
                                                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-display)', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>
                                                                    ✓ CORRECT
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: isCorrect ? 'var(--accent)' : 'var(--metal-light)' }}>
                                                            {percent}% ({count})
                                                        </div>
                                                    </div>

                                                    <div className="analytics-bar-container" style={{ margin: 0, height: 22, borderRadius: 6 }}>
                                                        <div 
                                                            className="analytics-bar-fill" 
                                                            style={{ 
                                                                '--target-width': `${percent}%`,
                                                                width: `${percent}%`, 
                                                                background: gradient,
                                                                animationDelay: `${optIdx * 0.12 + 0.15}s`,
                                                                borderRadius: 5
                                                            } as React.CSSProperties}
                                                        ></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 36, margin: 0 }}>
                            <span className="badge" style={{ alignSelf: 'center', marginBottom: 12, padding: '8px 18px', fontSize: '0.85rem' }}>
                                {activeQ?.section}
                            </span>
                            
                            <h2 style={{ fontSize: '1.6rem', textAlign: 'center', margin: '8px 0 24px 0', fontFamily: 'var(--font-display)' }}>
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
                                    <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '1rem' }}>
                                        <span className="pulsing-loader" style={{ width: 20, height: 20, borderWidth: 2, margin: 0 }}></span>
                                        Waiting for coordinator to launch question...
                                    </div>
                                ) : sessionState.isLocked || timeLeft <= 0 ? (
                                    <div style={{ color: 'var(--accent)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.08em', fontFamily: 'var(--font-display)' }}>
                                        🔒 SUBMISSIONS LOCKED
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.08em', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                        <span className="status-indicator active" style={{ position: 'relative', top: 'auto', left: 'auto' }}></span>
                                        SUBMISSIONS OPEN — PLACE YOUR GUESSES!
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Right: Live Running Standings (Leaderboard preview) */}
                    <div className="glass-card" style={{ padding: 36, margin: 0, display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Standings Leaderboard</span>
                            <span className="badge" style={{ color: 'var(--text-secondary)' }}>{leaderboard.length} participants</span>
                        </h2>

                        {leaderboard.length === 0 ? (
                            <div className="waiting-message" style={{ margin: 'auto' }}>
                                Awaiting participant registrations...
                            </div>
                        ) : (
                            <div className="leaderboard-container" style={{ flexGrow: 1, overflowY: 'auto' }}>
                                <div className="leaderboard-row header" style={{ padding: '12px 16px' }}>
                                    <div className="rank-col" style={{ width: 70 }}>Rank</div>
                                    <div className="name-col">Participant</div>
                                    <div className="score-col">Score &amp; Badges</div>
                                </div>
                                {leaderboard.map((entry) => (
                                    <div 
                                        key={entry.usn} 
                                        className="leaderboard-row" 
                                        style={{ padding: '12px 16px', alignItems: 'center' }}
                                    >
                                        <div className="rank-col" style={{ width: 70, fontWeight: entry.rank <= 3 ? 700 : 500 }}>
                                            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                                        </div>
                                        <div className="name-col">
                                            <span className="name-text" style={{ fontSize: '0.95rem', fontWeight: entry.rank <= 3 ? 700 : 500 }}>{entry.name}</span>
                                            <span className="usn-text" style={{ fontSize: '0.75rem' }}>{entry.usn}</span>
                                        </div>
                                        <div className="score-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: entry.rank === 1 ? 'var(--accent)' : 'var(--text-primary)' }}>
                                                {entry.score} pts
                                            </span>
                                            {renderBadges(entry.earnedBadges)}
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
