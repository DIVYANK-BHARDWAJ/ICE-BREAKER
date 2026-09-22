import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withDedup, invalidateCacheByPrefix } from '@/lib/cache';

const CACHE_KEY = 'leaderboard';
const CACHE_TTL = 2000;

export async function GET() {
    try {
        const data = await withDedup(CACHE_KEY, CACHE_TTL, async () => {
            const res = await query(`
                SELECT 
                    p.name, p.usn, p.score, p.correct_count,
                    COALESCE(
                        (SELECT ARRAY_AGG(pa.mascot_badge) 
                         FROM player_answers pa 
                         WHERE pa.player_usn = p.usn AND pa.mascot_badge IS NOT NULL),
                        ARRAY[]::INT[]
                    ) as earned_badges
                FROM players p 
                ORDER BY p.score DESC, p.correct_count DESC, p.id ASC
            `);

            return {
                success: true,
                leaderboard: res.rows.map((row, idx) => ({
                    rank: idx + 1,
                    name: row.name,
                    usn: row.usn,
                    score: row.score,
                    correctCount: row.correct_count,
                    earnedBadges: row.earned_badges || []
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
