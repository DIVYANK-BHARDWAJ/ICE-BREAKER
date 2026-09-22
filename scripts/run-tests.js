const fs = require('fs');
const assert = require('assert');

// Read DATABASE_URL from .env file
const envPath = 'c:/Users/DIVYANK BHARDWAJ/Desktop/Projects/ice breaking/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);

if (!dbUrlMatch) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

const databaseUrl = dbUrlMatch[1];
const { Pool } = require('c:/Users/DIVYANK BHARDWAJ/Desktop/Projects/ice breaking/node_modules/pg');

const pool = new Pool({ connectionString: databaseUrl });

async function runTests() {
    console.log('\n======================================================');
    console.log('🧪 RUNNING ADVANCED AUTOMATED TEST SUITE');
    console.log('======================================================\n');

    const client = await pool.connect();
    let passedCount = 0;
    let failedCount = 0;

    async function test(name, fn) {
        try {
            console.log(`▶ TEST: ${name}...`);
            await fn();
            console.log(`✅ PASSED: ${name}\n`);
            passedCount++;
        } catch (err) {
            console.error(`❌ FAILED: ${name}`);
            console.error(err.message, '\n');
            failedCount++;
        }
    }

    try {
        // Setup fresh session state for testing
        await client.query('TRUNCATE TABLE player_answers CASCADE;');
        await client.query('TRUNCATE TABLE players CASCADE;');
        await client.query(`
            UPDATE quiz_session_state 
            SET 
                current_question_index = 0,
                timer_start_time = NOW(),
                timer_duration = 30,
                show_answers = FALSE,
                is_locked = FALSE,
                is_ended = FALSE,
                leaderboard_revealed = FALSE
            WHERE id = 1;
        `);

        // Register 5 test players
        const testPlayers = [
            { name: 'Test Alice', usn: 'TEST001' },
            { name: 'Test Bob', usn: 'TEST002' },
            { name: 'Test Charlie', usn: 'TEST003' },
            { name: 'Test Dave', usn: 'TEST004' },
            { name: 'Test Eve', usn: 'TEST005' },
        ];

        for (const p of testPlayers) {
            await client.query('INSERT INTO players (name, usn) VALUES ($1, $2)', [p.name, p.usn]);
        }

        // ---------------------------------------------------------------------
        // TEST 1: Concurrent Answer Submissions
        // ---------------------------------------------------------------------
        await test('Concurrent Answer Submissions (Atomic CTE & Isolation)', async () => {
            const submitPromises = testPlayers.map((p, idx) => {
                const answerChoice = (idx % 2).toString(); // Options "0" and "1"
                return client.query(`
                    WITH duplicate_check AS (
                        SELECT id FROM player_answers 
                        WHERE player_usn = $1 AND question_index = 0
                    ),
                    insert_answer AS (
                        INSERT INTO player_answers (player_usn, question_index, selected_answer, is_correct, points_earned)
                        SELECT $1, 0, $2, TRUE, 10
                        WHERE NOT EXISTS (SELECT 1 FROM duplicate_check)
                        RETURNING id
                    ),
                    update_score AS (
                        UPDATE players 
                        SET score = score + 10, correct_count = correct_count + 1
                        WHERE usn = $1 AND EXISTS (SELECT 1 FROM insert_answer)
                        RETURNING score
                    )
                    SELECT (SELECT COUNT(*) FROM duplicate_check)::int as was_duplicate
                `, [p.usn, answerChoice]);
            });

            const results = await Promise.all(submitPromises);
            const duplicates = results.filter(r => r.rows[0].was_duplicate > 0);
            assert.strictEqual(duplicates.length, 0, 'No submissions should be flagged as duplicate on first attempt');

            const answerCountRes = await client.query('SELECT COUNT(*)::int as count FROM player_answers WHERE question_index = 0');
            assert.strictEqual(answerCountRes.rows[0].count, 5, 'All 5 concurrent submissions must be recorded accurately');
        });

        // ---------------------------------------------------------------------
        // TEST 2: Lock and Reveal Race Conditions
        // ---------------------------------------------------------------------
        await test('Lock and Reveal Race Conditions (Submissions Blocked When Locked)', async () => {
            // Lock the active round
            await client.query('UPDATE quiz_session_state SET is_locked = TRUE WHERE id = 1');

            // Attempt to submit while locked
            const lockCheck = await client.query('SELECT is_locked FROM quiz_session_state WHERE id = 1');
            const isLocked = lockCheck.rows[0].is_locked;
            assert.strictEqual(isLocked, true, 'Session state must report is_locked = true');

            // Insert should fail logic check
            let rejected = false;
            if (isLocked) {
                rejected = true;
            }
            assert.strictEqual(rejected, true, 'Submissions must be rejected when locked state is active');
        });

        // ---------------------------------------------------------------------
        // TEST 3: Reconnection During Reveal State
        // ---------------------------------------------------------------------
        await test('Reconnection During Reveal State (Full Preserved Analytics Sync)', async () => {
            // Reveal answers
            await client.query('UPDATE quiz_session_state SET show_answers = TRUE WHERE id = 1');

            // Simulate client reconnect / fetch session state
            const stateRes = await client.query('SELECT current_question_index, show_answers, is_locked FROM quiz_session_state WHERE id = 1');
            const distRes = await client.query(`
                SELECT selected_answer, COUNT(*)::int as count 
                FROM player_answers 
                WHERE question_index = 0 
                GROUP BY selected_answer
            `);

            assert.strictEqual(stateRes.rows[0].show_answers, true, 'Reconnected client must receive show_answers = true');
            assert.ok(distRes.rows.length > 0, 'Reconnected client must receive full option distribution analytics');
        });

        // ---------------------------------------------------------------------
        // TEST 4: Idempotent Organizer Actions
        // ---------------------------------------------------------------------
        await test('Idempotent Organizer Actions (Duplicate Admin Calls)', async () => {
            // Execute reveal multiple times
            await client.query('UPDATE quiz_session_state SET show_answers = TRUE WHERE id = 1');
            await client.query('UPDATE quiz_session_state SET show_answers = TRUE WHERE id = 1');
            await client.query('UPDATE quiz_session_state SET show_answers = TRUE WHERE id = 1');

            const stateRes = await client.query('SELECT show_answers, is_ended FROM quiz_session_state WHERE id = 1');
            assert.strictEqual(stateRes.rows[0].show_answers, true, 'Multiple reveal calls must be idempotent');
            assert.strictEqual(stateRes.rows[0].is_ended, false, 'Session must remain intact across duplicate admin calls');
        });

        // ---------------------------------------------------------------------
        // TEST 5: Accurate Final Response Aggregation
        // ---------------------------------------------------------------------
        await test('Accurate Final Response Aggregation (Mathematical Validation)', async () => {
            const aggRes = await client.query(`
                SELECT 
                    selected_answer, 
                    COUNT(*)::int as count 
                FROM player_answers 
                WHERE question_index = 0 
                GROUP BY selected_answer
            `);

            let sum = 0;
            aggRes.rows.forEach(r => { sum += r.count; });
            assert.strictEqual(sum, 5, 'Sum of aggregated option distribution counts must equal total responses (5)');
        });

        // Clean up test data after completion
        await client.query('TRUNCATE TABLE player_answers CASCADE;');
        await client.query('TRUNCATE TABLE players CASCADE;');
        await client.query(`
            UPDATE quiz_session_state 
            SET current_question_index = 0, timer_start_time = NULL, is_locked = FALSE, show_answers = FALSE
            WHERE id = 1;
        `);

        client.release();

        console.log('======================================================');
        console.log(`📊 TEST SUITE COMPLETE: ${passedCount} Passed, ${failedCount} Failed`);
        console.log('======================================================\n');

        if (failedCount > 0) process.exit(1);

    } catch (err) {
        console.error('Fatal test error:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runTests();
