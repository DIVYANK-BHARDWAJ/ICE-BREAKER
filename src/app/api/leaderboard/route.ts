import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withDedup, invalidateCacheByPrefix } from '@/lib/cache';

const CACHE_KEY = 'leaderboard';
const CACHE_TTL = 2000;

export async function GET() {
    try {
        const data = await withDedup(CACHE_KEY, CACHE_TTL, async () => {
            const res = await query(`
                SELECT name, usn, score, correct_count 
                FROM players 
                ORDER BY score DESC, correct_count DESC, id ASC
            `);

            return {
                success: true,
                leaderboard: res.rows.map((row, idx) => ({
                    rank: idx + 1,
                    name: row.name,
                    usn: row.usn,
                    score: row.score,
                    correctCount: row.correct_count
                }))
            };
        });

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching leaderboard:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export function invalidateLeaderboardCache() {
    invalidateCacheByPrefix('leaderboard');
}
