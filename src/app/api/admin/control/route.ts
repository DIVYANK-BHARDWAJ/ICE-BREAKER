import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { questions } from '@/lib/questions';
import { invalidateCacheByPrefix } from '@/lib/cache';
import { checkRateLimit } from '@/lib/rate-limiter';

const DEFAULT_ADMIN_PASSWORD = 'divyank';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, duration, password } = body;

        const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
        if (password !== adminPassword) {
            return NextResponse.json({ success: false, error: 'Unauthorized: Invalid admin password' }, { status: 401 });
        }

        const ip = request.headers.get('x-forwarded-for') || 'admin';
        if (!checkRateLimit(`admin:${ip}`)) {
            return NextResponse.json({ success: false, error: 'Too many requests. Slow down.' }, { status: 429 });
        }

        // Get current state
        const stateRes = await query('SELECT current_question_index FROM quiz_session_state WHERE id = 1');
        if (stateRes.rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Session state not found' }, { status: 500 });
        }

        let currentIndex = stateRes.rows[0].current_question_index;
        let didMutate = true;
        const now = new Date().toISOString();

        if (action === 'release') {
            const q = questions[currentIndex];
            const timerDuration = duration || q.timer || 10;
            await query(`
                UPDATE quiz_session_state 
                SET 
                    timer_start_time = $1, 
                    timer_duration = $2, 
                    is_locked = FALSE, 
                    show_answers = FALSE
                WHERE id = 1
            `, [now, timerDuration]);
        } else if (action === 'lock') {
            await query(`UPDATE quiz_session_state SET is_locked = TRUE WHERE id = 1`);
        } else if (action === 'reveal') {
            await query(`UPDATE quiz_session_state SET show_answers = TRUE WHERE id = 1`);
        } else if (action === 'next') {
            if (currentIndex < questions.length - 1) {
                currentIndex += 1;
                await query(`
                    UPDATE quiz_session_state 
                    SET current_question_index = $1, timer_start_time = NULL, is_locked = FALSE, show_answers = FALSE
                    WHERE id = 1
                `, [currentIndex]);
            }
        } else if (action === 'prev') {
            if (currentIndex > 0) {
                currentIndex -= 1;
                await query(`
                    UPDATE quiz_session_state 
                    SET current_question_index = $1, timer_start_time = NULL, is_locked = FALSE, show_answers = FALSE
                    WHERE id = 1
                `, [currentIndex]);
            }
        } else if (action === 'end') {
            await query(`UPDATE quiz_session_state SET is_ended = TRUE WHERE id = 1`);
        } else if (action === 'remove-player') {
            const { usn } = body;
            if (!usn) return NextResponse.json({ success: false, error: 'USN is required' }, { status: 400 });
            await query('DELETE FROM player_answers WHERE player_usn = $1', [usn]);
            await query('DELETE FROM players WHERE usn = $1', [usn]);
            invalidateCacheByPrefix('leaderboard');
        } else if (action === 'reveal-leaderboard') {
            await query(`UPDATE quiz_session_state SET leaderboard_revealed = TRUE WHERE id = 1`);
        } else if (action === 'status') {
            didMutate = false;
        } else {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        if (didMutate) {
            invalidateCacheByPrefix('session-state');
            invalidateCacheByPrefix('leaderboard');
        }

        // Fetch updated state
        const [updatedRes, playersRes] = await Promise.all([
            query(`
                SELECT 
                    current_question_index, 
                    timer_start_time, 
                    timer_duration, 
                    show_answers, 
                    is_locked,
                    is_ended,
                    leaderboard_revealed
                FROM quiz_session_state 
                WHERE id = 1
            `),
            query(`
                SELECT 
                    p.name, p.usn, p.score, p.correct_count,
                    (SELECT COUNT(*) FROM player_answers pa WHERE pa.player_usn = p.usn AND pa.question_index = $1) > 0 as answered
                FROM players p
                ORDER BY p.score DESC, p.correct_count DESC, p.id ASC
            `, [currentIndex])
        ]);

        const updatedState = updatedRes.rows[0];

        return NextResponse.json({
            success: true,
            sessionState: {
                currentQuestionIndex: updatedState.current_question_index,
                timerStartTime: updatedState.timer_start_time,
                timerDuration: updatedState.timer_duration,
                showAnswers: updatedState.show_answers,
                isLocked: updatedState.is_locked,
                isEnded: updatedState.is_ended,
                serverTime: new Date().toISOString(),
                leaderboardRevealed: updatedState.leaderboard_revealed
            },
            playersStatus: playersRes.rows.map(row => ({
                name: row.name,
                usn: row.usn,
                score: row.score,
                correctCount: row.correct_count,
                answered: row.answered
            }))
        });

    } catch (error: any) {
        console.error('Error in admin control route:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
