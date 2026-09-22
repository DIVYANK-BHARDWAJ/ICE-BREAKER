import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { questions } from '@/lib/questions';
import { invalidateCacheByPrefix } from '@/lib/cache';
import { checkRateLimit } from '@/lib/rate-limiter';
import { broadcast } from '@/lib/events';

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
                    show_answers = FALSE,
                    badges_awarded = FALSE,
                    leaderboard_revealed = FALSE
                WHERE id = 1
            `, [now, timerDuration]);
        } else if (action === 'lock') {
            await query(`UPDATE quiz_session_state SET is_locked = TRUE WHERE id = 1`);
        } else if (action === 'reveal') {
            await query(`UPDATE quiz_session_state SET show_answers = TRUE, badges_awarded = FALSE WHERE id = 1`);
        } else if (action === 'award-badges') {
            // Toggle or set badges_awarded state
            const targetState = body.badgesAwarded !== undefined ? !!body.badgesAwarded : null;
            if (targetState !== null) {
                await query('UPDATE quiz_session_state SET badges_awarded = $1 WHERE id = 1', [targetState]);
            } else {
                await query('UPDATE quiz_session_state SET badges_awarded = NOT badges_awarded WHERE id = 1');
            }
            
            // Assign random badge to any unassigned correct answers on current question
            const correctAnswers = await query(
                'SELECT id FROM player_answers WHERE question_index = $1 AND is_correct = TRUE AND mascot_badge IS NULL', 
                [currentIndex]
            );
            for (const row of correctAnswers.rows) {
                const randomBadge = Math.floor(Math.random() * 10) + 1;
                await query('UPDATE player_answers SET mascot_badge = $1 WHERE id = $2', [randomBadge, row.id]);
            }
        } else if (action === 'next') {
            if (currentIndex < questions.length - 1) {
                currentIndex += 1;
                await query(`
                    UPDATE quiz_session_state 
                    SET current_question_index = $1, timer_start_time = NULL, is_locked = FALSE, show_answers = FALSE, badges_awarded = FALSE, leaderboard_revealed = FALSE
                    WHERE id = 1
                `, [currentIndex]);
            }
        } else if (action === 'prev') {
            if (currentIndex > 0) {
                currentIndex -= 1;
                await query(`
                    UPDATE quiz_session_state 
                    SET current_question_index = $1, timer_start_time = NULL, is_locked = FALSE, show_answers = FALSE, badges_awarded = FALSE, leaderboard_revealed = FALSE
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
        } else if (action === 'hide-leaderboard') {
            await query(`UPDATE quiz_session_state SET leaderboard_revealed = FALSE WHERE id = 1`);
        } else if (action === 'status') {
            didMutate = false;
        } else {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        if (didMutate) {
            invalidateCacheByPrefix('session-state');
            invalidateCacheByPrefix('leaderboard');
            broadcast('session-update');
        }

        // Fetch updated state
        const [updatedRes, playersRes, statsRes, distRes] = await Promise.all([
            query(`
                SELECT 
                    current_question_index, 
                    timer_start_time, 
                    timer_duration, 
                    show_answers, 
                    is_locked,
                    is_ended,
                    leaderboard_revealed,
                    badges_awarded
                FROM quiz_session_state 
                WHERE id = 1
            `),
            query(`
                SELECT 
                    p.name, p.usn, p.score, p.correct_count,
                    (SELECT COUNT(*) FROM player_answers pa WHERE pa.player_usn = p.usn AND pa.question_index = $1) > 0 as answered
                FROM players p
                ORDER BY p.score DESC, p.correct_count DESC, p.id ASC
            `, [currentIndex]),
            query(`
                SELECT 
                    (SELECT COUNT(*) FROM players)::int as total_players,
                    (SELECT COUNT(DISTINCT player_usn) FROM player_answers WHERE question_index = $1)::int as total_responses
            `, [currentIndex]),
            query(`
                SELECT selected_answer, COUNT(*)::int as count
                FROM player_answers
                WHERE question_index = $1
                AND selected_answer IS NOT NULL
                GROUP BY selected_answer
            `, [currentIndex])
        ]);

        const updatedState = updatedRes.rows[0];
        const stats = statsRes.rows[0] || { total_players: 0, total_responses: 0 };
        const optionDistribution: Record<string, number> = {};
        distRes.rows.forEach(r => {
            if (r.selected_answer !== null) {
                optionDistribution[r.selected_answer] = r.count;
            }
        });

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
                leaderboardRevealed: updatedState.leaderboard_revealed,
                badgesAwarded: !!updatedState.badges_awarded,
                totalPlayers: stats.total_players,
                totalResponses: stats.total_responses,
                optionDistribution
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
