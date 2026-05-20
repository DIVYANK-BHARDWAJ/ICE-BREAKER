import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withDedup, invalidateCacheByPrefix } from '@/lib/cache';

const CACHE_KEY = 'session-state';
const CACHE_TTL = 2000;

export async function GET() {
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
                    NOW() as server_time
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
                serverTime: state.server_time
            };
        });

        if (!data) {
            return NextResponse.json({ success: false, error: 'Session state not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching session state:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export function invalidateSessionCache() {
    invalidateCacheByPrefix('session-state');
}
