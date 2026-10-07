'use client';

import { useState, useEffect, useRef } from 'react';
import { questions } from '@/lib/questions';
import { useSSE } from '@/lib/useSSE';
import { getMascotSplits, OPTION_GRADIENTS, OPTION_BORDER_COLORS, OPTION_GLOW_COLORS, MASCOT_DETAILS } from '@/lib/mascots';

interface Player {
    name: string;
    usn: string;
    score: number;
    correctCount: number;
    completed: boolean;
    roomCode: string;
}

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
    totalPlayers?: number;
    totalResponses?: number;
    optionDistribution?: Record<string, number>;
}

export default function PlayerPage() {
    // Player identity states
    const [player, setPlayer] = useState<Player | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [usnInput, setUsnInput] = useState('');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [regError, setRegError] = useState('');

    const [playerCurrentAnswer, setPlayerCurrentAnswer] = useState<{ selected_answer: string; is_correct: boolean; points_earned: number; mascot_badge: number | null } | null>(null);
    const [playerBadges, setPlayerBadges] = useState<number[]>([]);

    // Game states
    const [sessionState, setSessionState] = useState<SessionState | null>(null);
    const [clientServerOffset, setClientServerOffset] = useState<number | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [userAnswer, setUserAnswer] = useState<string | null>(null);
    const [submittedAnswerIndex, setSubmittedAnswerIndex] = useState<number | null>(null); // To lock local UI for current question
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<{
        isCorrect: boolean;
        correctOption: string;
        pointsEarned: number;
        isLate: boolean;
    } | null>(null);

    // Leaderboard state
    const [leaderboard, setLeaderboard] = useState<{ rank: number; name: string; usn: string; score: number; correctCount: number; earnedBadges?: number[] }[]>([]);

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
                                width: 24, 
                                height: 24, 
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

    // Written round text state
    const [emojiTextGuess, setEmojiTextGuess] = useState('');

    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const currentIdx = sessionState ? sessionState.currentQuestionIndex : 0;
    const q = currentIdx < questions.length ? questions[currentIdx] : questions[0];

    const stateRef = useRef({
        emojiTextGuess,
        currentIdx,
        submittedAnswerIndex,
        isSubmitting,
        player,
        sessionState,
        userAnswer,
        q
    });

    useEffect(() => {
        stateRef.current = {
            emojiTextGuess,
            currentIdx,
            submittedAnswerIndex,
            isSubmitting,
            player,
            sessionState,
            userAnswer,
            q
        };
    }, [emojiTextGuess, currentIdx, submittedAnswerIndex, isSubmitting, player, sessionState, userAnswer, q]);

    // 1. Load player from sessionStorage on mount
    useEffect(() => {
        const storedPlayer = sessionStorage.getItem('quiz_player');
        if (storedPlayer) {
            try {
                setPlayer(JSON.parse(storedPlayer));
            } catch (e) {
                sessionStorage.removeItem('quiz_player');
            }
        }
    }, []);

    // 2. Poll session state every 1.5 seconds (SSE provides instant push updates)
    useEffect(() => {
        // Fetch session state immediately
        fetchSessionState();

        const sessionInterval = setInterval(fetchSessionState, 4000);

        return () => {
            clearInterval(sessionInterval);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [player]);

    // 3. SSE listener for instant updates — bypasses polling interval lag
    useSSE({
        'session-update': () => fetchSessionState(),
        'response-update': () => fetchSessionState(),
    });

    const autoSubmitAnswer = async (answerVal: string, timeLeftAtCall: number = 0) => {
        const latest = stateRef.current;
        if (!latest.player || !latest.sessionState) return;
        if (latest.sessionState.isEnded) return;
        if (latest.submittedAnswerIndex === latest.currentIdx) return;
        if (latest.isSubmitting) return;

        // Set state to locked/submitted locally
        setUserAnswer(answerVal);
        setSubmittedAnswerIndex(latest.currentIdx);

        // Record submission locally in sessionStorage
        const storedAnswersStr = sessionStorage.getItem('submitted_answers');
        let storedAnswers: Record<number, string> = {};
        if (storedAnswersStr) {
            try { storedAnswers = JSON.parse(storedAnswersStr); } catch (e) {}
        }
        storedAnswers[latest.currentIdx] = answerVal;
        sessionStorage.setItem('submitted_answers', JSON.stringify(storedAnswers));

        setIsSubmitting(true);

        // Spread out submissions when timer expires to avoid DB burst
        if (timeLeftAtCall <= 0) {
            const jitter = Math.random() * 400;
            await new Promise(r => setTimeout(r, jitter));
        }

        try {
            const res = await fetch('/api/submit-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: latest.player.usn,
                    roomCode: latest.player.roomCode,
                    questionIndex: latest.currentIdx,
                    selectedAnswer: answerVal
                })
            });
            const data = await res.json();
            if (data.success) {
                console.log('Auto-submitted answer successfully recorded:', data);
            } else {
                console.error('Auto-submitted answer error:', data.error);
                if (data.error === 'Player is not registered.') {
                    logout();
                }
            }
        } catch (e) {
            console.error('Error auto-submitting answer:', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Stable refs for timer to avoid restarting on every sessionState poll
    const timerParamsRef = useRef({ startTime: 0, duration: 10 });
    const offsetRef = useRef<number>(0);

    useEffect(() => {
        if (clientServerOffset !== null) offsetRef.current = clientServerOffset;
    }, [clientServerOffset]);

    // 3. Keep local countdown updated based on server time offset
    useEffect(() => {
        if (clientServerOffset === null) return;

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
            
            const latest = stateRef.current;
            if (remaining <= 0 && latest.q && latest.submittedAnswerIndex !== latest.currentIdx && !latest.isSubmitting) {
                let answerToSubmit = '';
                if (latest.q.type === 'emoji') {
                    answerToSubmit = latest.emojiTextGuess.trim();
                } else {
                    answerToSubmit = latest.userAnswer || '';
                }
                autoSubmitAnswer(answerToSubmit, remaining);
            }
        };

        updateTimer();
        timerIntervalRef.current = setInterval(updateTimer, 200);

        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [sessionState?.timerStartTime, sessionState?.timerDuration, clientServerOffset === null, player]);

    // Poll leaderboard when session ends OR admin reveals leaderboard.
    // We fetch even before leaderboard is revealed so the player can see their own real score
    // on the waiting screen (player.score in sessionStorage is always stale 0).
    useEffect(() => {
        if (!sessionState?.isEnded && !sessionState?.leaderboardRevealed) return;
        const fetchLb = async () => {
            if (!player?.roomCode) return;
            try {
                const res = await fetch(`/api/leaderboard?roomCode=${encodeURIComponent(player.roomCode)}`);
                const data = await res.json();
                if (data.success) setLeaderboard(data.leaderboard);
            } catch (e) {
                console.error('Failed to fetch leaderboard', e);
            }
        };
        fetchLb();
        const interval = setInterval(fetchLb, 3000);
        return () => clearInterval(interval);
    }, [sessionState?.isEnded, sessionState?.leaderboardRevealed]);

    // 4. Handle new question index or reset
    useEffect(() => {
        if (!sessionState) return;

        const activeIndex = sessionState.currentQuestionIndex;
        const storedAnswersStr = sessionStorage.getItem('submitted_answers');
        let storedAnswers: Record<number, string> = {};
        if (storedAnswersStr) {
            try {
                storedAnswers = JSON.parse(storedAnswersStr);
            } catch (e) {}
        }

        // If the current question index has changed, reset question-specific state
        if (submittedAnswerIndex !== activeIndex) {
            if (storedAnswers[activeIndex] !== undefined) {
                // User already submitted before refresh
                setUserAnswer(storedAnswers[activeIndex]);
                setSubmittedAnswerIndex(activeIndex);
                
                // Show standard submitted state
                setSubmitResult(null);
            } else {
                // Brand new question
                setUserAnswer(null);
                setSubmittedAnswerIndex(null);
                setSubmitResult(null);
                setEmojiTextGuess('');
            }
        }
    }, [sessionState?.currentQuestionIndex]);

    const fetchLeaderboardData = async () => {
        if (!player?.roomCode) return;
        try {
            const res = await fetch(`/api/leaderboard?roomCode=${encodeURIComponent(player.roomCode)}`);
            const data = await res.json();
            if (data.success) setLeaderboard(data.leaderboard);
        } catch (e) {
            console.error('Failed to fetch leaderboard', e);
        }
    };

    const fetchSessionState = async () => {
        try {
            const currentPlayer = stateRef.current.player;
            if (!currentPlayer || !currentPlayer.roomCode) return; // Wait until player registers with roomCode

            const url = `/api/session-state?usn=${encodeURIComponent(currentPlayer.usn)}&roomCode=${encodeURIComponent(currentPlayer.roomCode)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                if (currentPlayer?.usn && data.playerExists === false) {
                    console.warn('Player no longer exists in database (session reset). Logging out...');
                    logout();
                    return;
                }

                const serverTimeMs = new Date(data.serverTime).getTime();
                const offset = serverTimeMs - Date.now();
                setClientServerOffset(offset);

                const wasEnded = stateRef.current.sessionState?.isEnded;
                
                setSessionState({
                    currentQuestionIndex: data.currentQuestionIndex,
                    timerStartTime: data.timerStartTime,
                    timerDuration: data.timerDuration,
                    showAnswers: data.showAnswers,
                    isLocked: data.isLocked,
                    isEnded: data.isEnded,
                    serverTime: data.serverTime,
                    leaderboardRevealed: data.leaderboardRevealed,
                    badgesAwarded: data.badgesAwarded,
                    totalPlayers: data.totalPlayers,
                    totalResponses: data.totalResponses,
                    optionDistribution: data.optionDistribution
                });

                if (data.playerCurrentAnswer) setPlayerCurrentAnswer(data.playerCurrentAnswer);
                if (data.playerBadges) setPlayerBadges(data.playerBadges);

                if (data.playerScore !== undefined && data.playerScore !== null) {
                    setPlayer(prev => {
                        if (!prev) return prev;
                        if (prev.score === data.playerScore && prev.correctCount === data.playerCorrectCount) return prev;
                        const updated = { ...prev, score: data.playerScore, correctCount: data.playerCorrectCount ?? prev.correctCount };
                        sessionStorage.setItem('quiz_player', JSON.stringify(updated));
                        return updated;
                    });
                }

                // Immediately fetch leaderboard when admin reveals it
                if (data.leaderboardRevealed && !stateRef.current.sessionState?.leaderboardRevealed) {
                    fetchLeaderboardData();
                }
            }
        } catch (e) {
            console.error('Failed to fetch session state', e);
        }
    };

    const handleRegistration = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegError('');

        if (!nameInput.trim() || !usnInput.trim() || !roomCodeInput.trim()) {
            setRegError('Please fill in all fields.');
            return;
        }

        const formattedUsn = usnInput.trim().toUpperCase();
        const formattedRoomCode = roomCodeInput.trim().toUpperCase();

        // Alphanumeric USN validation
        const usnRegex = /^[A-Z0-9]{5,15}$/;
        if (!usnRegex.test(formattedUsn)) {
            setRegError('Invalid USN format. Please enter an alphanumeric USN (e.g. 1BY25CS094).');
            return;
        }

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nameInput.trim(), usn: formattedUsn, roomCode: formattedRoomCode })
            });

            const data = await res.json();
            if (data.success) {
                sessionStorage.removeItem('submitted_answers'); // clear stale answers
                setPlayer(data.player);
                sessionStorage.setItem('quiz_player', JSON.stringify(data.player));
            } else {
                setRegError(data.error || 'Registration failed.');
            }
        } catch (e) {
            setRegError('Failed to connect to server.');
        }
    };

    const handleAnswerSelect = async (answerVal: string) => {
        // Client-side guard: also block if session ended or timer ran out
        if (!player || sessionState === null) return;
        if (sessionState.isEnded) return;
        if (submittedAnswerIndex === sessionState.currentQuestionIndex) return;
        if (timeLeft <= 0 || sessionState.isLocked) return;

        setUserAnswer(answerVal);
        setSubmittedAnswerIndex(sessionState.currentQuestionIndex);

        // Record submission locally in sessionStorage to persist across page reloads
        const storedAnswersStr = sessionStorage.getItem('submitted_answers');
        let storedAnswers: Record<number, string> = {};
        if (storedAnswersStr) {
            try { storedAnswers = JSON.parse(storedAnswersStr); } catch (e) {}
        }
        storedAnswers[sessionState.currentQuestionIndex] = answerVal;
        sessionStorage.setItem('submitted_answers', JSON.stringify(storedAnswers));

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/submit-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: player.usn,
                    roomCode: player.roomCode,
                    questionIndex: sessionState.currentQuestionIndex,
                    selectedAnswer: answerVal
                })
            });
            const data = await res.json();
            if (data.success) {
                // Answer accepted, but we do NOT display correctness until coordinator reveals it
                console.log('Answer recorded successfully:', data);
            } else {
                console.error('Answer submission error:', data.error);
                if (data.error === 'Player is not registered.') {
                    logout();
                }
            }
        } catch (e) {
            console.error('Error submitting answer:', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEmojiSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!emojiTextGuess.trim()) return;
        handleAnswerSelect(emojiTextGuess.trim());
    };

    // Auto-timeout blank submissions are intentionally removed.
    // The server (submit-answer/route.ts) uses database NOW() to hard-reject
    // any submission received after timer_duration seconds — no client workaround possible.

    // 5. Fetch score details when showAnswers becomes true
    useEffect(() => {
        if (sessionState?.showAnswers && player && submittedAnswerIndex === sessionState.currentQuestionIndex) {
            fetchSubmissionResult();
        }
    }, [sessionState?.showAnswers, sessionState?.currentQuestionIndex]);

    const fetchSubmissionResult = async () => {
        if (!player || !sessionState) return;
        try {
            // Re-submitting the same answer checks validity and gets result safely from server
            const res = await fetch('/api/submit-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: player.usn,
                    roomCode: player.roomCode,
                    questionIndex: sessionState.currentQuestionIndex,
                    selectedAnswer: userAnswer // Server will ignore write because they already answered, and return results
                })
            });
            const data = await res.json();
            // If the server rejected it due to duplicate, that's fine, but if it returned success, it means it's grading details
            // Wait, we designed the server to reject duplicate inserts. Let's make sure we handle that.
            // Oh, we can fetch it, or wait! Our /api/submit-answer returns the correctOption and isCorrect even if they query it,
            // or we can implement a custom result fetching. Let's look at how our submit-answer was coded.
            // In our route.ts, it returns error if duplicate!
            // Let's check how to fetch the grading details safely:
            // Since we know the questions database array is available on the client in questions.ts, we can actually grade the answer locally on showAnswers,
            // because the server already scored it! This prevents making another backend API request.
            // Let's grade locally just for display purposes!
            const q = questions[sessionState.currentQuestionIndex];
            let localIsCorrect = false;
            let localPoints = 0;

            if (userAnswer) {
                if (q.type === 'mcq' || q.type === 'mcq-image') {
                    const selectedIdx = parseInt(userAnswer, 10);
                    if (selectedIdx === q.answer) {
                        localIsCorrect = true;
                        localPoints = 10;
                    }
                } else if (q.type === 'emoji') {
                    const userClean = userAnswer.toLowerCase().trim().replace(/\s+/g, '');
                    const correctClean = q.answer.toString().toLowerCase().trim().replace(/\s+/g, '');
                    localPoints = 5; // participation pts
                    if (userClean === correctClean) {
                        localIsCorrect = true;
                    }
                }
            }

            const correctOptionText = q.type === 'emoji' ? q.answer.toString() : q.options?.[q.answer as number] || '';

            setSubmitResult({
                isCorrect: localIsCorrect,
                correctOption: correctOptionText,
                pointsEarned: localPoints,
                isLate: false // client already submitted on time
            });

        } catch (e) {
            console.error('Failed to grade results locally', e);
        }
    };

    const logout = () => {
        sessionStorage.removeItem('quiz_player');
        sessionStorage.removeItem('submitted_answers');
        setPlayer(null);
        setUserAnswer(null);
        setSubmittedAnswerIndex(null);
        setSubmitResult(null);
        setNameInput('');
        setUsnInput('');
        setRoomCodeInput('');
    };

    // 1. REGISTRATION SCREEN
    if (!player) {
        return (
            <div className="glass-container">
                <div className="glass-card">
                    <h1>ICE BREAKING</h1>
                    <div className="subtitle" style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                        ProtocolX Participant Registration
                    </div>

                    <form onSubmit={handleRegistration}>
                        <div className="form-group">
                            <label className="form-label">Participant Name</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                placeholder="e.g. Alex Mercer"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">University USN</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                placeholder="e.g. 1BY25CS094"
                                value={usnInput}
                                onChange={(e) => setUsnInput(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Room Code</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                placeholder="e.g. ROOM-A"
                                value={roomCodeInput}
                                onChange={(e) => setRoomCodeInput(e.target.value)}
                                required
                            />
                        </div>

                        {regError && <div className="answer-reveal wrong" style={{ marginTop: 0, marginBottom: 20 }}>❌ {regError}</div>}

                        <button type="submit" className="btn">ENTER PROTOCOLX</button>
                    </form>
                </div>
            </div>
        );
    }

    // Loading View
    if (!sessionState) {
        return (
            <div className="glass-container">
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <div className="pulsing-loader"></div>
                    <div className="waiting-message">Connecting to Room {player.roomCode}...</div>
                </div>
            </div>
        );
    }

    const isCompleted = currentIdx >= questions.length || sessionState.isEnded;

    // 2. LIVE PROJECTOR STANDINGS INTERCEPT (AT ANY POINT WHEN ADMIN OPENS PROJECTOR VIEW)
    if (sessionState?.leaderboardRevealed && leaderboard.length > 0) {
        const myEntry = leaderboard.find(p => p.usn === player.usn);
        const myRank = myEntry ? myEntry.rank : 0;
        const top3 = leaderboard.slice(0, 3);
        const firstPlace = top3[0] || null;
        const secondPlace = top3[1] || null;
        const thirdPlace = top3[2] || null;

        return (
            <div className="glass-container" style={{ maxWidth: 680 }}>
                <div className="glass-card" style={{ padding: '32px 24px', borderRadius: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span className="badge" style={{ background: 'var(--surface-raised)', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 }}>
                            LIVE PROJECTOR STANDINGS
                        </span>
                        <span className="badge">
                            Question {currentIdx + 1} of {questions.length}
                        </span>
                    </div>

                    <h1 style={{ textAlign: 'center', marginBottom: 16 }}>
                        <span style={{ display: 'block', fontSize: '1.4rem', lineHeight: 1.2, letterSpacing: '0.05em' }}>
                            PROTOCOLX
                        </span>
                        <span style={{ display: 'block', fontSize: '1.9rem', lineHeight: 1.2, marginTop: '4px', letterSpacing: '0.05em' }}>
                            STANDINGS
                        </span>
                    </h1>
                    <p className="subtitle" style={{ fontSize: '0.9rem', marginBottom: 20 }}>
                        {isCompleted 
                            ? 'The challenge has concluded. Official final ranking results:' 
                            : `Standings & Mascot Badges Earned Till Question ${currentIdx + 1}:`}
                    </p>

                    {/* Participant's Personal Standing Banner */}
                    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--accent)', borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4), 0 0 8px rgba(232, 38, 44, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: '1.5rem' }}>
                                {myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎯'}
                            </span>
                            <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Standing</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{player.name} · {myEntry ? myEntry.correctCount : 0} correct</div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: '#FFFFFF' }}>{myEntry ? myEntry.score : 0} PTS</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{myRank > 0 ? `RANK #${myRank}` : 'UNRANKED'}</div>
                        </div>
                    </div>

                    {/* Celebration Podium */}
                    <div className="celebration-podium">
                        {/* 2ND PLACE */}
                        {secondPlace && (
                            <div className={`podium-column second ${secondPlace.usn === player.usn ? 'podium-me' : ''}`}>
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
                            <div className={`podium-column first ${firstPlace.usn === player.usn ? 'podium-me' : ''}`}>
                                <div className="podium-user-info">
                                    <span className="podium-avatar">👑</span>
                                    <div className="podium-user-name" style={{ fontSize: '1.1rem', color: 'var(--metal-light)' }} title={firstPlace.name}>{firstPlace.name}</div>
                                    <div className="podium-user-usn">{firstPlace.usn}</div>
                                    {renderBadges(firstPlace.earnedBadges)}
                                </div>
                                <div className="podium-box">
                                    <div className="podium-number">1</div>
                                    <div className="podium-pts" style={{ color: 'var(--accent)', fontSize: '1.05rem' }}>{firstPlace.score} pts</div>
                                    <div className="podium-correct-badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>{firstPlace.correctCount} correct</div>
                                </div>
                            </div>
                        )}

                        {/* 3RD PLACE */}
                        {thirdPlace && (
                            <div className={`podium-column third ${thirdPlace.usn === player.usn ? 'podium-me' : ''}`}>
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

                    {/* Full Rankings & Badges */}
                    <div style={{ marginTop: 28 }}>
                        <h2 style={{ fontSize: '1rem', marginBottom: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center' }}>
                            Full Standings &amp; Mascot Badges Earned
                        </h2>
                        <div className="leaderboard-container">
                            <div className="leaderboard-row header" style={{ padding: '12px 18px' }}>
                                <div className="rank-col" style={{ fontSize: '0.8rem' }}>Rank</div>
                                <div className="name-col" style={{ fontSize: '0.8rem' }}>Participant</div>
                                <div className="score-col" style={{ fontSize: '0.8rem' }}>Score &amp; Badges</div>
                            </div>
                            {leaderboard.map((entry) => {
                                const isMe = entry.usn === player.usn;
                                return (
                                    <div
                                        key={entry.usn}
                                        className={`leaderboard-row ${isMe ? 'current-user' : ''}`}
                                        style={{ padding: '12px 18px', alignItems: 'center' }}
                                    >
                                        <div className="rank-col" style={{ fontWeight: entry.rank <= 3 ? 700 : 500 }}>
                                            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                                        </div>
                                        <div className="name-col">
                                            <span className="name-text" style={{ fontSize: '0.9rem', fontWeight: entry.rank <= 3 || isMe ? 700 : 500 }}>
                                                {entry.name}{isMe ? ' ◄ YOU' : ''}
                                            </span>
                                            <span className="usn-text" style={{ fontSize: '0.75rem' }}>{entry.usn}</span>
                                        </div>
                                        <div className="score-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                            <span style={{ fontWeight: 700, color: entry.rank === 1 ? 'var(--accent)' : isMe ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                {entry.score} pts ({entry.correctCount} correct)
                                            </span>
                                            {renderBadges(entry.earnedBadges)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 3. RESULTS END SCREEN (WHEN QUIZ FINISHES BUT LEADERBOARD NOT YET REVEALED)
    if (isCompleted) {
        const myEntry = leaderboard.find(p => p.usn === player.usn);

        // Default waiting screen (leaderboard not yet revealed by admin)
        return (
            <div className="glass-container">
                <div className="glass-card">
                    <h1>PROTOCOLX COMPLETED</h1>
                    <div className="emoji-feedback">⚡</div>
                    
                    <div className="result-score-circle">
                        <div className="result-score-val">{myEntry ? myEntry.score : player.score}</div>
                        <div className="result-score-label">Points</div>
                    </div>

                    <div className="result-summary-grid" style={{ marginBottom: 24 }}>
                        <div className="result-summary-card">
                            <div className="result-card-val">{myEntry ? myEntry.correctCount : player.correctCount}/{questions.length}</div>
                            <div className="result-card-lbl">Correct Submissions</div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
                        <span className="pulsing-loader" style={{ width: 18, height: 18, borderWidth: 2, margin: 0 }}></span>
                        Awaiting coordinator leaderboard reveal...
                    </div>
                </div>
            </div>
        );
    }

    // Only treat timeLeft <= 0 as a lock condition once we've received the first server time sync.
    // Before sync, clientServerOffset is null and timeLeft defaults to 0, which would falsely lock the UI.
    const isLocked = sessionState.isLocked || (clientServerOffset !== null && timeLeft <= 0);
    const hasSubmitted = submittedAnswerIndex === currentIdx;

    // SVG Circular timer progress calculation
    const svgCircumference = 282.7;
    const progressPercent = Math.min(1, timeLeft / (q?.timer || 10));
    const strokeDashoffset = svgCircumference * (1 - progressPercent);
    const isTimerDanger = timeLeft <= 3 && timeLeft > 0;

    // 3. MAIN GAME SCREEN
    return (
        <div className="glass-container">
            {/* Top Score Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20 }}>
                <div>
                    <div className="micro-label" style={{ fontSize: '0.7rem' }}>PARTICIPANT</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{player.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="micro-label" style={{ fontSize: '0.7rem' }}>TOTAL SCORE</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>{player.score} PTS</div>
                </div>
            </div>

            {/* Waiting for Timer to Start */}
            {!sessionState.timerStartTime ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
                    <span className="badge">{q.section}</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '24px 0 12px 0' }}>Question {currentIdx + 1}</div>
                    <div className="pulsing-loader"></div>
                    <div className="waiting-message">
                        Get ready! The coordinator will release this question shortly...
                    </div>
                </div>
            ) : sessionState.showAnswers && sessionState.badgesAwarded ? (
                /* DEDICATED MASCOT BADGE UNLOCK SCREEN */
                (() => {
                    const isCorrect = playerCurrentAnswer ? playerCurrentAnswer.is_correct : (submitResult ? submitResult.isCorrect : false);
                    const badgeId = playerCurrentAnswer?.mascot_badge || (isCorrect ? ((currentIdx % 10) + 1) : null);
                    const mascotInfo = badgeId ? MASCOT_DETAILS[badgeId] : null;

                    if (isCorrect && mascotInfo) {
                        return (
                            <div className="glass-card" style={{ padding: '40px 28px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-display)', letterSpacing: '0.15em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 8 }}>
                                    ⚡ PROTOCOLX BADGE AWARD
                                </div>
                                <h1 style={{ fontSize: '1.8rem', marginBottom: 12, color: '#FFFFFF', textShadow: '0 0 20px var(--accent-glow)' }}>
                                    🏆 MASCOT BADGE UNLOCKED!
                                </h1>

                                {/* Glowing Mascot Badge Frame */}
                                <div style={{ margin: '24px auto', width: 140, height: 140, position: 'relative' }}>
                                    <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', animation: 'pulse 2s infinite' }}></div>
                                    <img 
                                        src={mascotInfo.image} 
                                        alt={mascotInfo.name} 
                                        style={{ 
                                            width: '100%', height: '100%', 
                                            borderRadius: '50%', objectFit: 'cover', 
                                            border: '3px solid var(--accent)',
                                            boxShadow: '0 0 30px var(--accent-glow)',
                                            position: 'relative',
                                            zIndex: 2
                                        }} 
                                    />
                                </div>

                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--metal-light)', marginBottom: 4 }}>
                                    {mascotInfo.name} #{mascotInfo.id.toString().padStart(2, '0')}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 16 }}>
                                    {mascotInfo.title}
                                </div>

                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto 24px auto', lineHeight: 1.5 }}>
                                    {mascotInfo.summary || "Outstanding accuracy! You correctly solved the question and unlocked this collectible cybernetic mascot badge for your trophy showcase."}
                                </p>

                                <div className="answer-reveal correct" style={{ margin: 0 }}>
                                    ✅ Badge Saved to Leaderboard Portfolio (+10 PTS)
                                </div>
                            </div>
                        );
                    } else {
                        return (
                            <div className="glass-card" style={{ padding: '40px 28px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-display)', letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                                    PROTOCOLX BADGE STATUS
                                </div>
                                <h1 style={{ fontSize: '1.6rem', marginBottom: 12, color: 'var(--text-primary)' }}>
                                    ❌ NO BADGE EARNED THIS ROUND
                                </h1>
                                <div style={{ fontSize: '3rem', margin: '16px 0' }}>🔒</div>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto 24px auto', lineHeight: 1.5 }}>
                                    Sorry, no mascot badge was awarded for Question {currentIdx + 1} because your submitted answer was incorrect. Stay sharp and aim for precision on the next question!
                                </p>
                                <div className="answer-reveal wrong" style={{ margin: '16px 0 0 0', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '1.1rem' }}>
                                    Correct Answer was: <strong style={{ color: '#f87171' }}>&quot;{q.type === 'emoji' ? q.answer : q.options?.[q.answer as number]}&quot;</strong>
                                </div>
                            </div>
                        );
                    }
                })()
            ) : sessionState.showAnswers ? (
                /* DEDICATED CLEAN PERCENTAGE ANALYTICS REVEAL SCREEN (NO MASCOTS INSIDE BAR) */
                (() => {
                    const totalResp = sessionState.totalResponses || 0;

                    return (
                        <div className="glass-card" style={{ padding: '32px 24px' }}>
                            {/* Quiz Progress */}
                            <div className="progress-container" style={{ marginBottom: 16 }}>
                                <div className="progress-bar" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}></div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <span className="badge">{q.section}</span>
                                <span className="badge" style={{ background: 'var(--surface-raised)', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 }}>
                                    REVEAL STATE
                                </span>
                            </div>

                            <h1 style={{ 
                                fontSize: 'clamp(1.1rem, 3.2vw, 1.5rem)', 
                                marginBottom: 6,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                letterSpacing: '0.04em'
                            }}>
                                QUESTION {String(currentIdx + 1).padStart(2, '0')} REVEAL ANALYTICS
                            </h1>
                            <div className="question-text" style={{ fontSize: '1.2rem', margin: '12px 0 20px 0', color: '#F5F5F7' }}>
                                {q.question}
                            </div>

                            {/* Puzzle image if available */}
                            {q.type !== 'mcq-image' && q.images && q.images[0] && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                                    <img 
                                        src={q.images[0]} 
                                        alt="Puzzle" 
                                        style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 12, border: '1px solid var(--border)' }}
                                    />
                                </div>
                            )}

                            {/* Options Analytics Breakdown with Smooth Multi-Color Bars */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                                {q.options?.map((optText, optIdx) => {
                                    const isCorrect = optIdx === q.answer;
                                    const isUserWrongSelection = userAnswer === optIdx.toString() && !isCorrect;
                                    const count = sessionState.optionDistribution?.[optIdx.toString()] || 0;
                                    const percent = totalResp > 0 ? Math.round((count / totalResp) * 100) : 0;
                                    
                                    const gradient = isCorrect
                                        ? 'linear-gradient(90deg, #15803D 0%, #22C55E 100%)'
                                        : isUserWrongSelection
                                        ? 'linear-gradient(90deg, #5A0A0E 0%, #E8262C 100%)'
                                        : OPTION_GRADIENTS[optIdx % OPTION_GRADIENTS.length];
                                    const borderColor = isCorrect
                                        ? '#22C55E'
                                        : isUserWrongSelection
                                        ? 'var(--accent)'
                                        : OPTION_BORDER_COLORS[optIdx % OPTION_BORDER_COLORS.length];
                                    const glowColor = isCorrect
                                        ? 'rgba(34, 197, 94, 0.25)'
                                        : isUserWrongSelection
                                        ? 'rgba(232, 38, 44, 0.25)'
                                        : OPTION_GLOW_COLORS[optIdx % OPTION_GLOW_COLORS.length];

                                    return (
                                        <div 
                                            key={optIdx} 
                                            className={`analytics-option-card ${isCorrect ? 'correct-winner' : isUserWrongSelection ? 'wrong-user-choice' : ''}`}
                                            style={{
                                                '--card-border-color': borderColor,
                                                '--card-glow-color': glowColor,
                                                animationDelay: `${optIdx * 0.12}s`
                                            } as React.CSSProperties}
                                        >
                                            {/* Option Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ 
                                                        fontFamily: 'var(--font-display)', 
                                                        fontWeight: 800, 
                                                        fontSize: '0.85rem', 
                                                        color: '#fff',
                                                        background: isCorrect ? '#16A34A' : isUserWrongSelection ? 'var(--accent)' : 'var(--surface-raised)',
                                                        padding: '4px 10px',
                                                        borderRadius: 6,
                                                        border: isCorrect ? '1px solid #22C55E' : isUserWrongSelection ? '1px solid var(--accent)' : '1px solid var(--border-rim)'
                                                    }}>
                                                        OPTION {String.fromCharCode(65 + optIdx)}
                                                    </span>
                                                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: isCorrect ? '#FFFFFF' : isUserWrongSelection ? '#FF5A5F' : 'var(--text-primary)' }}>
                                                        {optText}
                                                    </span>
                                                    {isCorrect && (
                                                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-display)', fontWeight: 800, background: '#16A34A', color: '#fff', border: '1px solid #22C55E', padding: '2px 8px', borderRadius: 4 }}>
                                                            ✓ CORRECT
                                                        </span>
                                                    )}
                                                    {isUserWrongSelection && (
                                                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-display)', fontWeight: 800, background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', padding: '2px 8px', borderRadius: 4 }}>
                                                            ❌ YOUR CHOICE
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: isCorrect ? '#4ADE80' : isUserWrongSelection ? '#FF5A5F' : 'var(--metal-light)' }}>
                                                    {percent}% ({count} {count === 1 ? 'user' : 'users'})
                                                </div>
                                            </div>

                                            {/* Smooth Fluid Multi-Color Fill Bar */}
                                            <div className="analytics-bar-container" style={{ margin: 0, height: 28, borderRadius: 8 }}>
                                                <div 
                                                    className="analytics-bar-fill" 
                                                    style={{ 
                                                        '--target-width': `${percent}%`,
                                                        width: `${percent}%`, 
                                                        background: gradient,
                                                        animationDelay: `${optIdx * 0.12 + 0.15}s`,
                                                        borderRadius: 6
                                                    } as React.CSSProperties}
                                                ></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Personal Player Result Feedback */}
                            {submitResult ? (
                                <div className={`answer-reveal ${submitResult.isCorrect ? 'correct' : 'wrong'}`} style={{ margin: 0, textAlign: 'center' }}>
                                    {submitResult.isCorrect ? (
                                        <div>🎉 Correct! +{submitResult.pointsEarned} Points earned.</div>
                                    ) : (
                                        <div>
                                            ❌ Wrong! Correct answer: <strong>&quot;{submitResult.correctOption}&quot;</strong>.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="answer-reveal wrong" style={{ margin: 0, textAlign: 'center' }}>
                                    ⏰ Time expired! Correct answer was: <strong>&quot;{
                                        q.type === 'emoji' ? q.answer : q.options?.[q.answer as number]
                                    }&quot;</strong>.
                                </div>
                            )}
                        </div>
                    );
                })()
            ) : (
                <div className="glass-card">
                    {/* Quiz Progress */}
                    <div className="progress-container">
                        <div className="progress-bar" style={{ width: `${(currentIdx / questions.length) * 100}%` }}></div>
                    </div>

                    <div className="quiz-header">
                        <div>
                            <span className="badge">{q.section}</span>
                            <div className="question-number">Question {currentIdx + 1} of {questions.length}</div>
                        </div>
                        
                        {/* Circular Timer */}
                        <div className={`timer-wrapper ${isTimerDanger ? 'danger' : ''}`}>
                            <svg className="timer-svg" viewBox="0 0 100 100">
                                <circle className="timer-track" cx="50" cy="50" r="45"></circle>
                                <circle 
                                    className="timer-fill" 
                                    cx="50" 
                                    cy="50" 
                                    r="45"
                                    style={{ strokeDashoffset }}
                                ></circle>
                            </svg>
                            <div className="timer-text">{Math.ceil(timeLeft)}</div>
                        </div>
                    </div>

                    <div className="question-content">
                        <div className="question-text">{q.question}</div>

                        {/* Image displays for game round */}
                        {q.type !== 'mcq-image' && q.images && q.images[0] && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                                <img 
                                    src={q.images[0]} 
                                    alt="Quiz puzzle" 
                                    style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 16, border: '1px solid var(--glass-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
                                />
                            </div>
                        )}

                        {/* QUESTION INTERFACES */}
                        
                        {/* 1. MCQ Standard */}
                        {q.type === 'mcq' && (
                            <div className="options-list">
                                {q.options?.map((opt, optIdx) => {
                                    const isOptSelected = userAnswer === optIdx.toString();

                                    let cardClass = 'option-card';
                                    if (isOptSelected) cardClass += ' selected';
                                    if (isLocked || hasSubmitted) cardClass += ' disabled';

                                    return (
                                        <div key={optIdx} style={{ width: '100%' }}>
                                            <button
                                                onClick={() => handleAnswerSelect(optIdx.toString())}
                                                disabled={isLocked || hasSubmitted}
                                                className={cardClass}
                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            >
                                                <span>{opt}</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 2. MCQ Image */}
                        {q.type === 'mcq-image' && (
                            <div className="image-options-grid">
                                {q.options?.map((opt, optIdx) => {
                                    const isOptSelected = userAnswer === optIdx.toString();

                                    let cardClass = 'image-option-card';
                                    if (isOptSelected) cardClass += ' selected';
                                    if (isLocked || hasSubmitted) cardClass += ' disabled';

                                    return (
                                        <div
                                            key={optIdx}
                                            onClick={() => {
                                                if (!isLocked && !hasSubmitted) {
                                                    handleAnswerSelect(optIdx.toString());
                                                }
                                            }}
                                            className={cardClass}
                                        >
                                            <div className="image-wrapper">
                                                <img src={q.images?.[optIdx] || ''} alt={opt} />
                                            </div>
                                            <div className="image-label">{opt}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 3. Emoji Guess Input */}
                        {q.type === 'emoji' && (
                            <div>
                                {hasSubmitted ? (
                                    <div className="option-card disabled" style={{ justifyContent: 'center' }}>
                                        My Guess: &quot;{userAnswer}&quot;
                                    </div>
                                ) : (
                                    <form onSubmit={handleEmojiSubmit} className="emoji-input-wrapper">
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            placeholder="Type your movie or song guess..."
                                            value={emojiTextGuess}
                                            onChange={(e) => setEmojiTextGuess(e.target.value)}
                                            disabled={isLocked}
                                            required
                                            autoFocus
                                        />
                                        <button 
                                            type="submit" 
                                            className="btn"
                                            disabled={isLocked || !emojiTextGuess.trim()}
                                        >
                                            Submit
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>

                    {/* SUBMISSION FEEDBACK STATES */}
                    {hasSubmitted && !sessionState.showAnswers && (
                        <div className="answer-reveal correct">
                            👍 Answer Submitted! Waiting for coordinator to reveal correct answer...
                        </div>
                    )}

                    {isLocked && !hasSubmitted && !sessionState.showAnswers && (
                        <div className="answer-reveal wrong">
                            ⏰ Time is up! You didn&apos;t submit an answer in time.
                        </div>
                    )}
                </div>
            )}


        </div>
    );
}
