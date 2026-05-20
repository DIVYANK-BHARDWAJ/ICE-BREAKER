import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { questions } from '@/lib/questions';
import { invalidateCacheByPrefix } from '@/lib/cache';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { usn, questionIndex, selectedAnswer } = body;

        if (!usn) {
            return NextResponse.json({ success: false, error: 'USN is required' }, { status: 400 });
        }

        if (questionIndex === undefined || questionIndex < 0 || questionIndex >= questions.length) {
            return NextResponse.json({ success: false, error: 'Invalid question index' }, { status: 400 });
        }

        const q = questions[questionIndex];

        // ─── Fetch session state + player in parallel ────────────────────────
        const [sessionRes, playerRes] = await Promise.all([
            query(`
                SELECT 
                    current_question_index, 
                    timer_start_time, 
                    timer_duration, 
                    is_locked,
                    is_ended,
                    NOW() as server_time
                FROM quiz_session_state 
                WHERE id = 1
            `),
            query('SELECT name FROM players WHERE usn = $1', [usn])
        ]);

        if (sessionRes.rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Quiz session not found' }, { status: 500 });
        }

        // ─── GATE 1: Player must be registered ──────────────────────────────
        if (playerRes.rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Player is not registered.' }, { status: 400 });
        }

        const session = sessionRes.rows[0];

        // ─── GATE 2: Session must not be ended ──────────────────────────────
        if (session.is_ended) {
            return NextResponse.json({
                success: false,
                error: 'The quiz session has been ended by the coordinator. No more answers are accepted.'
            }, { status: 403 });
        }

        // ─── GATE 3: Must answer the CURRENT active question ────────────────
        if (questionIndex !== session.current_question_index) {
            return NextResponse.json({
                success: false,
                error: 'This question is not currently active. Only the live question can be answered.'
            }, { status: 400 });
        }

        // ─── GATE 4: Timer must have been released ──────────────────────────
        if (!session.timer_start_time) {
            return NextResponse.json({
                success: false,
                error: 'This question has not been released by the coordinator yet.'
            }, { status: 403 });
        }

        // ─── GATE 5: Must not be locked ─────────────────────────────────────
        if (session.is_locked) {
            return NextResponse.json({
                success: false,
                error: 'Answers are locked. The coordinator has closed submissions for this question.'
            }, { status: 403 });
        }

        // ─── GATE 6: Timer must not have expired ────────────────────────────
        const startTime = new Date(session.timer_start_time).getTime();
        const serverTime = new Date(session.server_time).getTime();
        const elapsedSeconds = (serverTime - startTime) / 1000;

        if (elapsedSeconds > session.timer_duration + 1.5) {
            return NextResponse.json({
                success: false,
                error: `Time is up! You had ${session.timer_duration}s to answer. Your answer was not recorded.`
            }, { status: 403 });
        }

        // ─── Gate 7 + Grade + Save in one atomic CTE transaction ───────────
        // Combines duplicate check, INSERT, and UPDATE into a single query
        let points = 0;
        let isCorrect = false;

        if (selectedAnswer !== null && selectedAnswer !== undefined && selectedAnswer !== '') {
            if (q.type === 'mcq' || q.type === 'mcq-image') {
                const selectedIdx = parseInt(selectedAnswer, 10);
                if (selectedIdx === q.answer) {
                    points = 10;
                    isCorrect = true;
                }
            } else if (q.type === 'emoji') {
                points = 5;
                const userClean = selectedAnswer.toString().trim().toLowerCase().replace(/\s+/g, '');
                const correctClean = q.answer.toString().trim().toLowerCase().replace(/\s+/g, '');
                if (userClean === correctClean) {
                    isCorrect = true;
                }
            }
        }

        const result = await query(`
            WITH duplicate_check AS (
                SELECT id FROM player_answers 
                WHERE player_usn = $1 AND question_index = $2
            ),
            insert_answer AS (
                INSERT INTO player_answers (player_usn, question_index, selected_answer, is_correct, points_earned)
                SELECT $1, $2, $3, $4, $5
                WHERE NOT EXISTS (SELECT 1 FROM duplicate_check)
                RETURNING id
            ),
            update_score AS (
                UPDATE players 
                SET 
                    score = score + $5,
                    correct_count = correct_count + $6
                WHERE usn = $1
                AND EXISTS (SELECT 1 FROM insert_answer)
                RETURNING score, correct_count
            )
            SELECT 
                (SELECT COUNT(*) FROM duplicate_check)::int as was_duplicate,
                (SELECT score FROM update_score) as new_score,
                (SELECT correct_count FROM update_score) as new_correct_count
        `, [
            usn,
            questionIndex,
            selectedAnswer?.toString() || null,
            isCorrect,
            points,
            isCorrect ? 1 : 0
        ]);

        const row = result.rows[0];
        if (row.was_duplicate > 0) {
            return NextResponse.json({
                success: false,
                error: 'You have already submitted an answer for this question.'
            }, { status: 400 });
        }

        invalidateCacheByPrefix('leaderboard');

        const correctOption = (q.type === 'emoji')
            ? q.answer
            : q.options?.[q.answer as number] || '';

        return NextResponse.json({
            success: true,
            isCorrect,
            correctOption,
            pointsEarned: points
        });

    } catch (error: any) {
        console.error('Error in submit-answer:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
