import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { invalidateCacheByPrefix } from '@/lib/cache';

const DEFAULT_ADMIN_PASSWORD = 'divyank';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { password, roomCode } = body;

        if (!roomCode) {
            return NextResponse.json({ success: false, error: 'Room Code is required' }, { status: 400 });
        }

        const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
        if (password !== adminPassword) {
            return NextResponse.json({ success: false, error: 'Unauthorized: Invalid admin password' }, { status: 401 });
        }

        // Wipe tables for this room only
        await query('DELETE FROM player_answers WHERE room_code = $1', [roomCode]);
        await query('DELETE FROM players WHERE room_code = $1', [roomCode]);
        
        // Reset session state
        await query(`
            UPDATE quiz_session_state 
            SET 
                current_question_index = 0,
                timer_start_time = NULL,
                timer_duration = 10,
                show_answers = FALSE,
                is_locked = FALSE,
                is_ended = FALSE,
                badges_awarded = FALSE,
                leaderboard_revealed = FALSE
            WHERE room_code = $1
        `, [roomCode]);

        invalidateCacheByPrefix(`session-state-${roomCode}`);
        invalidateCacheByPrefix(`leaderboard-${roomCode}`);

        return NextResponse.json({
            success: true,
            message: `Quiz session ${roomCode} reset successfully. All players and answers wiped.`
        });

    } catch (error: any) {
        console.error('Error resetting database:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
