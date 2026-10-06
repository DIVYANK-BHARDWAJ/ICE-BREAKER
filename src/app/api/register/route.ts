import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { invalidateCacheByPrefix } from '@/lib/cache';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, usn, roomCode } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
        }

        if (!usn || !usn.trim()) {
            return NextResponse.json({ success: false, error: 'USN is required' }, { status: 400 });
        }

        if (!roomCode || !roomCode.trim()) {
            return NextResponse.json({ success: false, error: 'Room Code is required' }, { status: 400 });
        }

        const formattedUsn = usn.trim().toUpperCase();
        const formattedRoomCode = roomCode.trim().toUpperCase();

        // Regex to validate alphanumeric USN format (e.g. 1BY25CS094)
        // Accepts 8-12 characters of letters and numbers to be safe, but checks for basic alphanumeric validity.
        const usnRegex = /^[A-Z0-9]{5,15}$/;
        if (!usnRegex.test(formattedUsn)) {
            return NextResponse.json({ 
                success: false, 
                error: 'Invalid USN format. Please enter an alphanumeric USN (e.g., 1BY25CS094).' 
            }, { status: 400 });
        }

        const trimmedName = name.trim();

        // Try to insert the player. If they already exist, we fetch their current details
        // to allow resuming/reconnecting from a page refresh.
        const insertRes = await query(`
            INSERT INTO players (name, usn, room_code, score, correct_count, completed)
            VALUES ($1, $2, $3, 0, 0, FALSE)
            ON CONFLICT (usn, room_code) DO UPDATE 
            SET name = EXCLUDED.name -- Update name in case they spelled it differently
            RETURNING name, usn, room_code, score, correct_count, completed
        `, [trimmedName, formattedUsn, formattedRoomCode]);

        const player = insertRes.rows[0];

        invalidateCacheByPrefix('leaderboard');

        return NextResponse.json({
            success: true,
            player: {
                name: player.name,
                usn: player.usn,
                roomCode: player.room_code,
                score: player.score,
                correctCount: player.correct_count,
                completed: player.completed
            }
        });
    } catch (error: any) {
        console.error('Error during player registration:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
