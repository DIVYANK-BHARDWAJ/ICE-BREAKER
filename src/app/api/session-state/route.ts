import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withDedup, invalidateCacheByPrefix } from '@/lib/cache';

const CACHE_KEY = 'session-state';
const CACHE_TTL = 400;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const usn = searchParams.get('usn');
        const roomCode = searchParams.get('roomCode');

        if (!roomCode) {
            return NextResponse.json({ success: false, error: 'Room Code is required' }, { status: 400 });
        }

        const cacheKey = `${CACHE_KEY}-${roomCode}`;

        const data = await withDedup(cacheKey, CACHE_TTL, async () => {
            const [res, statsRes, distRes] = await Promise.all([
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
                    WHERE room_code = $1
                `, [roomCode]),
                query(`
                    SELECT 
                        (SELECT COUNT(*) FROM players WHERE room_code = $1)::int as total_players,
                        (SELECT COUNT(DISTINCT player_usn) FROM player_answers WHERE room_code = $1 AND question_index = (SELECT current_question_index FROM quiz_session_state WHERE room_code = $1))::int as total_responses
                `, [roomCode]),
                query(`
                    SELECT selected_answer, COUNT(*)::int as count
                    FROM player_answers
                    WHERE room_code = $1 AND question_index = (SELECT current_question_index FROM quiz_session_state WHERE room_code = $1)
                    AND selected_answer IS NOT NULL
                    GROUP BY selected_answer
                `, [roomCode])
            ]);

            if (res.rows.length === 0) {
                return null;
            }

            const state = res.rows[0];
            const stats = statsRes.rows[0] || { total_players: 0, total_responses: 0 };

            const optionDistribution: Record<string, number> = {};
            if (state.show_answers) {
                distRes.rows.forEach(r => {
                    if (r.selected_answer !== null) {
                        optionDistribution[r.selected_answer] = r.count;
                    }
                });
            }

            return {
                success: true,
                currentQuestionIndex: state.current_question_index,
                timerStartTime: state.timer_start_time,
                timerDuration: state.timer_duration,
                showAnswers: state.show_answers,
                isLocked: state.is_locked,
                isEnded: state.is_ended,
                leaderboardRevealed: state.leaderboard_revealed,
                badgesAwarded: !!state.badges_awarded,
                totalPlayers: stats.total_players,
                totalResponses: stats.total_responses,
                optionDistribution: state.show_answers ? optionDistribution : undefined,
            };
        });

        if (!data) {
            return NextResponse.json({ success: false, error: 'Session state not found' }, { status: 404 });
        }

        let playerExists: boolean | undefined = undefined;
        let playerScore: number | undefined = undefined;
        let playerCorrectCount: number | undefined = undefined;
        let playerCurrentAnswer: any = null;
        let playerBadges: number[] = [];

        if (usn) {
            const [pRes, paRes, badgesRes] = await Promise.all([
                query('SELECT score, correct_count FROM players WHERE usn = $1 AND room_code = $2', [usn, roomCode]),
                query(
                    'SELECT selected_answer, is_correct, points_earned, mascot_badge FROM player_answers WHERE player_usn = $1 AND room_code = $2 AND question_index = $3', 
                    [usn, roomCode, data.currentQuestionIndex]
                ),
                query(
                    'SELECT mascot_badge FROM player_answers WHERE player_usn = $1 AND room_code = $2 AND mascot_badge IS NOT NULL ORDER BY question_index ASC',
                    [usn, roomCode]
                )
            ]);

            playerExists = pRes.rows.length > 0;
            if (playerExists) {
                playerScore = pRes.rows[0].score;
                playerCorrectCount = pRes.rows[0].correct_count;
            }
            if (paRes.rows.length > 0) {
                playerCurrentAnswer = paRes.rows[0];
            }
            playerBadges = badgesRes.rows.map(r => r.mascot_badge);
        }

        return NextResponse.json({
            ...data,
            playerExists,
            playerScore,
            playerCorrectCount,
            playerCurrentAnswer,
            playerBadges,
            serverTime: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Error fetching session state:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export function invalidateSessionCache(roomCode?: string) {
    if (roomCode) {
        invalidateCacheByPrefix(`${CACHE_KEY}-${roomCode}`);
    } else {
        invalidateCacheByPrefix(CACHE_KEY);
    }
}
