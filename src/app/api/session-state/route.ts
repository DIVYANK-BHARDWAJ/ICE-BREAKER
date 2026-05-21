import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withDedup, invalidateCacheByPrefix } from '@/lib/cache';

const CACHE_KEY = 'session-state';
const CACHE_TTL = 2000;

export async function GET(request: Request) {
    try {
        const data = await withDedup(CACHE_KEY, CACHE_TTL, async () => {
            const res = await query(`
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
            `);

            if (res.rows.length === 0) {
                return null;
            }

            const state = res.rows[0];

            return {
                success: true,
                currentQuestionIndex: state.current_question_index,
                timerStartTime: state.timer_start_time,
                timerDuration: state.timer_duration,
                showAnswers: state.show_answers,
                isLocked: state.is_locked,
                isEnded: state.is_ended,
                leaderboardRevealed: state.leaderboard_revealed,
            };
        });

        if (!data) {
            return NextResponse.json({ success: false, error: 'Session state not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const usn = searchParams.get('usn');

        let playerExists: boolean | undefined = undefined;
        if (usn) {
            const playerRes = await query('SELECT 1 FROM players WHERE usn = $1', [usn]);
            playerExists = playerRes.rows.length > 0;
        }

        // serverTime is always fresh (never cached) for accurate clock sync
        return NextResponse.json({
            ...data,
            playerExists,
            serverTime: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Error fetching session state:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export function invalidateSessionCache() {
    invalidateCacheByPrefix('session-state');
}
