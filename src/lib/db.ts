import { Pool } from 'pg';

let pool: Pool;

const globalAny = global as any;
const POOL_CONFIG = {
    connectionString: process.env.DATABASE_URL,
    max: 100,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
};

if (process.env.NODE_ENV === 'production') {
    pool = new Pool(POOL_CONFIG);
} else {
    if (!globalAny.pgPool) {
        globalAny.pgPool = new Pool({ ...POOL_CONFIG, max: 50 });
    }
    pool = globalAny.pgPool;
}

pool.on('error', (err) => {
    console.error('Unexpected pool error:', err);
});

let isDbInitialized = false;

export async function initDb() {
    if (isDbInitialized) return;

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set in environment variables.");
    }

    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                usn VARCHAR(50) NOT NULL UNIQUE,
                score INT DEFAULT 0,
                correct_count INT DEFAULT 0,
                completed BOOLEAN DEFAULT FALSE
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS player_answers (
                id SERIAL PRIMARY KEY,
                player_usn VARCHAR(50) NOT NULL,
                question_index INT NOT NULL,
                selected_answer TEXT,
                is_correct BOOLEAN DEFAULT FALSE,
                points_earned INT DEFAULT 0,
                submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS quiz_session_state (
                id INT PRIMARY KEY,
                current_question_index INT DEFAULT 0,
                timer_start_time TIMESTAMP WITH TIME ZONE,
                timer_duration INT DEFAULT 10,
                show_answers BOOLEAN DEFAULT FALSE,
                is_locked BOOLEAN DEFAULT FALSE,
                is_ended BOOLEAN DEFAULT FALSE
            );
        `);

        // Indexes for high-concurrency lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_usn ON players (usn);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_player_answers_lookup 
            ON player_answers (player_usn, question_index);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_player_answers_question 
            ON player_answers (question_index);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_score 
            ON players (score DESC, correct_count DESC, id ASC);
        `);

        await client.query(`
            ALTER TABLE quiz_session_state 
            ADD COLUMN IF NOT EXISTS is_ended BOOLEAN DEFAULT FALSE;
        `);

        const res = await client.query('SELECT COUNT(*) FROM quiz_session_state');
        if (parseInt(res.rows[0].count, 10) === 0) {
            await client.query(`
                INSERT INTO quiz_session_state (id, current_question_index, timer_start_time, timer_duration, show_answers, is_locked, is_ended)
                VALUES (1, 0, NULL, 10, FALSE, FALSE, FALSE)
            `);
        }
        isDbInitialized = true;
        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Error during database initialization:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function query(text: string, params?: any[]) {
    await initDb();
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (err: any) {
        if (err.code === 'ECONNRESET' || err.code === '57P01') {
            console.warn('DB connection lost, retrying once...');
            await new Promise((r) => setTimeout(r, 200));
            return pool.query(text, params);
        }
        throw err;
    } finally {
        const duration = Date.now() - start;
        if (duration > 500) {
            console.warn(`Slow query (${duration}ms):`, text.slice(0, 120));
        }
    }
}

export { pool };
