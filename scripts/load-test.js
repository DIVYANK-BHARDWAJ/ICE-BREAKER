const fs = require('fs');
const assert = require('assert');

const envPath = 'c:/Users/DIVYANK BHARDWAJ/Desktop/Projects/ice breaking/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);

if (!dbUrlMatch) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

const databaseUrl = dbUrlMatch[1];
const { Pool } = require('pg');

const pool = new Pool({ 
    connectionString: databaseUrl,
    max: 150 // Allow enough concurrent connections in pool
});

async function runTests() {
    console.log('\n======================================================');
    console.log('🧪 RUNNING 300 USER LOAD TEST');
    console.log('======================================================\n');

    const client = await pool.connect();
    
    try {
        await client.query('TRUNCATE TABLE player_answers CASCADE;');
        await client.query('TRUNCATE TABLE players CASCADE;');
        await client.query('TRUNCATE TABLE quiz_session_state CASCADE;');
        
        await client.query(`
            INSERT INTO quiz_session_state (room_code, current_question_index, timer_start_time, timer_duration, show_answers, is_locked, is_ended, leaderboard_revealed, badges_awarded)
            VALUES ('admin', 0, NOW(), 30, FALSE, FALSE, FALSE, FALSE, FALSE)
            ON CONFLICT (room_code) DO UPDATE 
            SET current_question_index = 0, timer_start_time = NOW(), timer_duration = 30, show_answers = FALSE, is_locked = FALSE, is_ended = FALSE, leaderboard_revealed = FALSE;
        `);

        // Register 300 test players
        const testPlayers = [];
        for (let i = 1; i <= 300; i++) {
            testPlayers.push({ name: `Test User ${i}`, usn: `TEST${i.toString().padStart(3, '0')}`, room_code: 'admin' });
        }

        console.log('Inserting 300 users...');
        const insertPromises = testPlayers.map(p => 
            pool.query('INSERT INTO players (name, usn, room_code) VALUES ($1, $2, $3)', [p.name, p.usn, p.room_code])
        );
        await Promise.all(insertPromises);
        console.log('300 users inserted.\n');

        console.log('▶ TEST: 300 Concurrent Answer Submissions...');
        
        const startTime = Date.now();

        // 300 concurrent requests!
        const submitPromises = testPlayers.map((p, idx) => {
            const answerChoice = (idx % 2).toString();
            return pool.query(`
                WITH duplicate_check AS (
                    SELECT id FROM player_answers 
                    WHERE player_usn = $1 AND room_code = $3 AND question_index = 0
                ),
                insert_answer AS (
                    INSERT INTO player_answers (player_usn, room_code, question_index, selected_answer, is_correct, points_earned)
                    SELECT $1, $3, 0, $2, TRUE, 10
                    WHERE NOT EXISTS (SELECT 1 FROM duplicate_check)
                    RETURNING id
                ),
                update_score AS (
                    UPDATE players 
                    SET score = score + 10, correct_count = correct_count + 1
                    WHERE usn = $1 AND room_code = $3 AND EXISTS (SELECT 1 FROM insert_answer)
                    RETURNING score
                )
                SELECT (SELECT COUNT(*) FROM duplicate_check)::int as was_duplicate
            `, [p.usn, answerChoice, p.room_code]);
        });

        const results = await Promise.all(submitPromises);
        const endTime = Date.now();

        const duplicates = results.filter(r => r.rows[0].was_duplicate > 0);
        assert.strictEqual(duplicates.length, 0, 'No submissions should be flagged as duplicate on first attempt');

        const answerCountRes = await client.query('SELECT COUNT(*)::int as count FROM player_answers WHERE question_index = 0 AND room_code = $1', ['admin']);
        assert.strictEqual(answerCountRes.rows[0].count, 300, 'All 300 concurrent submissions must be recorded accurately');

        console.log(`✅ PASSED: 300 Concurrent Answer Submissions`);
        console.log(`⏱️ Time taken: ${endTime - startTime}ms\n`);

        // Clean up test data after completion
        await client.query('TRUNCATE TABLE player_answers CASCADE;');
        await client.query('TRUNCATE TABLE players CASCADE;');

        console.log('======================================================');
        console.log(`📊 LOAD TEST COMPLETE: Successfully handled 300 users`);
        console.log('======================================================\n');

    } catch (err) {
        console.error('Fatal test error:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runTests();
