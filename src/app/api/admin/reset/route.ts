import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { invalidateCacheByPrefix } from '@/lib/cache';

const DEFAULT_ADMIN_PASSWORD = 'divyank';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { password } = body;

        const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
        if (password !== adminPassword) {
            return NextResponse.json({ success: false, error: 'Unauthorized: Invalid admin password' }, { status: 401 });
        }

        // Wipe tables
        await query('TRUNCATE TABLE player_answers CASCADE');
        await query('TRUNCATE TABLE players CASCADE');
        
        // Reset session state
        await query(`
            UPDATE quiz_session_state 
            SET 
                current_question_index = 0,
                timer_start_time = NULL,
                timer_duration = 10,
                show_answers = FALSE,
                is_locked = FALSE,
                is_ended = FALSE
            WHERE id = 1
        `);

        invalidateCacheByPrefix('session-state');
        invalidateCacheByPrefix('leaderboard');

        return NextResponse.json({
            success: true,
            message: 'Quiz session reset successfully. All players and answers wiped.'
        });

    } catch (error: any) {
        console.error('Error resetting database:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
