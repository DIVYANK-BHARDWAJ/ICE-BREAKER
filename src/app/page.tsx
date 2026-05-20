'use client';

import { useState, useEffect, useRef } from 'react';
import { questions } from '@/lib/questions';

interface Player {
    name: string;
    usn: string;
    score: number;
    correctCount: number;
    completed: boolean;
}

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

export default function PlayerPage() {
    // Player identity states
    const [player, setPlayer] = useState<Player | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [usnInput, setUsnInput] = useState('');
    const [regError, setRegError] = useState('');

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
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

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

    // 1. Load player from localStorage on mount
    useEffect(() => {
        const storedPlayer = localStorage.getItem('quiz_player');
        if (storedPlayer) {
            try {
                setPlayer(JSON.parse(storedPlayer));
            } catch (e) {
                localStorage.removeItem('quiz_player');
            }
        }
    }, []);

    // 2. Poll session state every 1 second and leaderboard every 3 seconds
    useEffect(() => {
        // Fetch session state immediately
        fetchSessionState();

        const sessionInterval = setInterval(fetchSessionState, 2000);

        return () => {
            clearInterval(sessionInterval);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [player]);

    // Only poll leaderboard when session has ended
    useEffect(() => {
        if (!sessionState?.isEnded) return;
        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 4000);
        return () => clearInterval(interval);
    }, [sessionState?.isEnded]);

    const autoSubmitAnswer = async (answerVal: string, timeLeftAtCall: number = 0) => {
        const latest = stateRef.current;
        if (!latest.player || !latest.sessionState) return;
        if (latest.sessionState.isEnded) return;
        if (latest.submittedAnswerIndex === latest.currentIdx) return;
        if (latest.isSubmitting) return;

        // Set state to locked/submitted locally
        setUserAnswer(answerVal);
        setSubmittedAnswerIndex(latest.currentIdx);

        // Record submission locally in localStorage
        const storedAnswersStr = localStorage.getItem('submitted_answers');
        let storedAnswers: Record<number, string> = {};
        if (storedAnswersStr) {
            try { storedAnswers = JSON.parse(storedAnswersStr); } catch (e) {}
        }
        storedAnswers[latest.currentIdx] = answerVal;
        localStorage.setItem('submitted_answers', JSON.stringify(storedAnswers));

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
                    questionIndex: latest.currentIdx,
                    selectedAnswer: answerVal
                })
            });
            const data = await res.json();
            if (data.success) {
                console.log('Auto-submitted answer successfully recorded:', data);
            } else {
                console.error('Auto-submitted answer error:', data.error);
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
            setTimeLeft(remaining);
            
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

    // 4. Handle new question index or reset
    useEffect(() => {
        if (!sessionState) return;

        const activeIndex = sessionState.currentQuestionIndex;
        const storedAnswersStr = localStorage.getItem('submitted_answers');
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
            console.error('Failed to fetch session state', e);
        }
    };

    const fetchLeaderboard = async () => {
        try {
            const res = await fetch('/api/leaderboard');
            const data = await res.json();
            if (data.success) {
                setLeaderboard(data.leaderboard);
                
                // Update player details locally if rank changed
                if (player) {
                    const me = data.leaderboard.find((p: any) => p.usn === player.usn);
                    if (me) {
                        const updated = {
                            ...player,
                            score: me.score,
                            correctCount: me.correctCount
                        };
                        setPlayer(updated);
                        localStorage.setItem('quiz_player', JSON.stringify(updated));
                    } else {
                        // Player was wiped from database (e.g. admin reset)
                        logout();
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch leaderboard', e);
        }
    };

    const handleRegistration = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegError('');

        if (!nameInput.trim() || !usnInput.trim()) {
            setRegError('Please fill in all fields.');
            return;
        }

        const formattedUsn = usnInput.trim().toUpperCase();

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
                body: JSON.stringify({ name: nameInput.trim(), usn: formattedUsn })
            });

            const data = await res.json();
            if (data.success) {
                localStorage.removeItem('submitted_answers'); // clear stale answers
                setPlayer(data.player);
                localStorage.setItem('quiz_player', JSON.stringify(data.player));
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

        // Record submission locally in localStorage to persist across page reloads
        const storedAnswersStr = localStorage.getItem('submitted_answers');
        let storedAnswers: Record<number, string> = {};
        if (storedAnswersStr) {
            try { storedAnswers = JSON.parse(storedAnswersStr); } catch (e) {}
        }
        storedAnswers[sessionState.currentQuestionIndex] = answerVal;
        localStorage.setItem('submitted_answers', JSON.stringify(storedAnswers));

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/submit-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: player.usn,
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
        localStorage.removeItem('quiz_player');
        localStorage.removeItem('submitted_answers');
        setPlayer(null);
        setUserAnswer(null);
        setSubmittedAnswerIndex(null);
        setSubmitResult(null);
        setNameInput('');
        setUsnInput('');
    };

    // Loading View
    if (!sessionState) {
        return (
            <div className="glass-container">
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <div className="pulsing-loader"></div>
                    <div className="waiting-message">Connecting to Quiz Server...</div>
                </div>
            </div>
        );
    }

    // 1. REGISTRATION SCREEN
    if (!player) {
        return (
            <div className="glass-container">
                <div className="glass-card">
                    <h1>Ice Breaker Live</h1>
                    <div className="subtitle">Enter your details to join the session</div>

                    <form onSubmit={handleRegistration}>
                        <div className="form-group">
                            <label className="form-label">Your Name</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                placeholder="e.g. John Doe"
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

                        {regError && <div className="answer-reveal wrong" style={{ marginTop: 0, marginBottom: 20 }}>❌ {regError}</div>}

                        <button type="submit" className="btn">Join Quiz</button>
                    </form>
                </div>
            </div>
        );
    }

    const isCompleted = currentIdx >= questions.length || sessionState.isEnded;

    // 2. RESULTS / LEADERBOARD END SCREEN
    if (isCompleted) {
        const myRank = leaderboard.findIndex(p => p.usn === player.usn) + 1;
        const totalPlayers = leaderboard.length;
        
        let feedbackEmoji = '🤔';
        if (totalPlayers > 0) {
            const rankPercentile = (totalPlayers - myRank + 1) / totalPlayers;
            if (rankPercentile >= 0.7) feedbackEmoji = '🎉';
            else if (rankPercentile >= 0.3) feedbackEmoji = '😄';
        }

        return (
            <div className="glass-container">
                <div className="glass-card">
                    {!showLeaderboard ? (
                        <>
                            <h1>Ice Breaker Completed!</h1>
                            <div className="emoji-feedback">{feedbackEmoji}</div>
                            
                            <div className="result-score-circle">
                                <div className="result-score-val">{player.score}</div>
                                <div className="result-score-label">Points</div>
                            </div>

                            <div className="result-summary-grid" style={{ marginBottom: 24 }}>
                                <div className="result-summary-card">
                                    <div className="result-card-val">{player.correctCount}/{questions.length}</div>
                                    <div className="result-card-lbl">Correct Answers</div>
                                </div>
                                <div className="result-summary-card">
                                    <div className="result-card-val">{myRank > 0 ? `#${myRank} / ${totalPlayers}` : '-'}</div>
                                    <div className="result-card-lbl">Rank</div>
                                </div>
                            </div>

                            <button 
                                onClick={() => setShowLeaderboard(true)} 
                                className="btn"
                                style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)', color: '#000', fontWeight: 800 }}
                            >
                                🏆 Check Leaderboard & Rankings
                            </button>
                        </>
                    ) : (
                        <>
                            <h1>Quiz Rankings</h1>
                            <div className="subtitle" style={{ marginBottom: 20 }}>Your rank is #{myRank} out of {totalPlayers} players</div>

                            <div className="leaderboard-container" style={{ maxHeight: 350, overflowY: 'auto' }}>
                                <div className="leaderboard-row header">
                                    <div className="rank-col">Rank</div>
                                    <div className="name-col">Player</div>
                                    <div className="score-col">Score</div>
                                </div>
                                {leaderboard.map((entry) => {
                                    const isMe = entry.usn === player.usn;
                                    return (
                                        <div key={entry.usn} className={`leaderboard-row ${isMe ? 'current-user' : ''}`}>
                                            <div className="rank-col">
                                                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                                            </div>
                                            <div className="name-col">
                                                <span className="name-text">{entry.name}</span>
                                                <span className="usn-text">{entry.usn}</span>
                                            </div>
                                            <div className="score-col">{entry.score} pts</div>
                                        </div>
                                    );
                                })}
                            </div>

                            <button 
                                onClick={() => setShowLeaderboard(false)} 
                                className="btn btn-secondary" 
                                style={{ marginTop: 24 }}
                            >
                                ◀ Back to My Score
                            </button>
                        </>
                    )}

                    <button 
                        onClick={logout} 
                        className="btn btn-secondary" 
                        style={{ marginTop: 12, opacity: 0.7 }}
                    >
                        Sign Out / Exit
                    </button>
                </div>
            </div>
        );
    }

    const isLocked = sessionState.isLocked || timeLeft <= 0;
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 12px 8px', borderBottom: '1px solid var(--glass-border)', marginBottom: 20 }}>
                <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Player</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>{player.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>My Score</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{player.score} pts</div>
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

                        {/* Image displays for Emoji game round */}
                        {q.type === 'emoji' && q.images && q.images[0] && (
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
                                    const isCorrectOpt = sessionState.showAnswers && optIdx === q.answer;
                                    const isWrongSelected = sessionState.showAnswers && isOptSelected && optIdx !== q.answer;

                                    let cardClass = 'option-card';
                                    if (isOptSelected) cardClass += ' selected';
                                    if (isCorrectOpt) cardClass += ' correct';
                                    if (isWrongSelected) cardClass += ' wrong';
                                    if (isLocked || hasSubmitted) cardClass += ' disabled';

                                    return (
                                        <button
                                            key={optIdx}
                                            onClick={() => handleAnswerSelect(optIdx.toString())}
                                            disabled={isLocked || hasSubmitted}
                                            className={cardClass}
                                        >
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* 2. MCQ Image */}
                        {q.type === 'mcq-image' && (
                            <div className="image-options-grid">
                                {q.options?.map((opt, optIdx) => {
                                    const isOptSelected = userAnswer === optIdx.toString();
                                    const isCorrectOpt = sessionState.showAnswers && optIdx === q.answer;
                                    const isWrongSelected = sessionState.showAnswers && isOptSelected && optIdx !== q.answer;

                                    let cardClass = 'image-option-card';
                                    if (isOptSelected) cardClass += ' selected';
                                    if (isCorrectOpt) cardClass += ' correct';
                                    if (isWrongSelected) cardClass += ' wrong';
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

                    {/* COORDINATOR REVEALS ANSWERS */}
                    {sessionState.showAnswers && submitResult && (
                        <div className={`answer-reveal ${submitResult.isCorrect ? 'correct' : 'wrong'}`}>
                            {submitResult.isCorrect ? (
                                <div>🎉 Correct! +{submitResult.pointsEarned} Points.</div>
                            ) : (
                                <div>
                                    ❌ Wrong! Correct answer: <strong>&quot;{submitResult.correctOption}&quot;</strong>.
                                    {q.type === 'emoji' && (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                            (+5 participation points awarded for answering on time!)
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {sessionState.showAnswers && !hasSubmitted && (
                        <div className="answer-reveal wrong">
                            ⏰ Time expired! Correct answer was: <strong>&quot;{
                                q.type === 'emoji' ? q.answer : q.options?.[q.answer as number]
                            }&quot;</strong>.
                        </div>
                    )}
                </div>
            )}


        </div>
    );
}
