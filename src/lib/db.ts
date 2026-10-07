import { Pool } from 'pg';

let pool: Pool;

const globalAny = global as any;
const POOL_CONFIG = {
    connectionString: process.env.DATABASE_URL,
    max: 40, // Reduced from 100 to prevent DB connection limits on free tiers
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

if (process.env.NODE_ENV === 'production') {
    pool = new Pool(POOL_CONFIG);
} else {
    if (!globalAny.pgPool) {
        globalAny.pgPool = new Pool({ ...POOL_CONFIG, max: 20 });
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
                usn VARCHAR(50) NOT NULL,
                room_code VARCHAR(50) NOT NULL,
                score INT DEFAULT 0,
                correct_count INT DEFAULT 0,
                completed BOOLEAN DEFAULT FALSE,
                UNIQUE(usn, room_code)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS player_answers (
                id SERIAL PRIMARY KEY,
                player_usn VARCHAR(50) NOT NULL,
                room_code VARCHAR(50) NOT NULL,
                question_index INT NOT NULL,
                selected_answer TEXT,
                is_correct BOOLEAN DEFAULT FALSE,
                points_earned INT DEFAULT 0,
                mascot_badge INT DEFAULT NULL,
                submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS quiz_session_state (
                room_code VARCHAR(50) PRIMARY KEY,
                current_question_index INT DEFAULT 0,
                timer_start_time TIMESTAMP WITH TIME ZONE,
                timer_duration INT DEFAULT 10,
                show_answers BOOLEAN DEFAULT FALSE,
                is_locked BOOLEAN DEFAULT FALSE,
                is_ended BOOLEAN DEFAULT FALSE,
                leaderboard_revealed BOOLEAN DEFAULT FALSE,
                badges_awarded BOOLEAN DEFAULT FALSE
            );
        `);

        // Indexes for high-concurrency lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_usn_room ON players (usn, room_code);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_player_answers_lookup 
            ON player_answers (player_usn, room_code, question_index);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_score_room 
            ON players (room_code, score DESC, correct_count DESC, id ASC);
        `);

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
