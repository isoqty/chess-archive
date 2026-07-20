const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'chess.db');
let database;

function init() {
    database = new Database(dbPath);
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');

    database.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rating INTEGER,
            rating_rapid INTEGER,
            rating_blitz INTEGER,
            rating_classical INTEGER,
            rating_bullet INTEGER,
            rating_chess960 INTEGER,
            title TEXT,
            country TEXT,
            birth_year INTEGER,
            photo TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name TEXT,
            date TEXT,
            white_name TEXT NOT NULL,
            black_name TEXT NOT NULL,
            white_id INTEGER REFERENCES players(id),
            black_id INTEGER REFERENCES players(id),
            white_elo INTEGER,
            black_elo INTEGER,
            result TEXT,
            eco TEXT,
            opening TEXT,
            round_num TEXT,
            site TEXT,
            moves_pgn TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_name);
        CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_name);
        CREATE INDEX IF NOT EXISTS idx_games_event ON games(event_name);
        CREATE INDEX IF NOT EXISTS idx_games_eco ON games(eco);
        CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
        CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
    `);

    // Migration: add rating columns if missing
    const cols = database.prepare("PRAGMA table_info(players)").all().map(c => c.name);
    const newCols = ['rating_rapid', 'rating_blitz', 'rating_classical', 'rating_bullet', 'rating_chess960', 'title', 'status'];
    for (const col of newCols) {
        if (!cols.includes(col)) {
            database.exec(`ALTER TABLE players ADD COLUMN ${col} INTEGER`);
        }
    }

    const adminExists = database.prepare('SELECT COUNT(*) as count FROM admins').get();
    if (adminExists.count === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        database.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
        console.log('Default admin created - username: admin, password: admin123');
    }
}

// --- Admin ---
function getAdmin(username) {
    return database.prepare('SELECT * FROM admins WHERE username = ?').get(username);
}

// --- Players ---
function getAllPlayers() {
    return database.prepare('SELECT * FROM players ORDER BY name').all();
}

function searchPlayers(search) {
    return database.prepare('SELECT * FROM players WHERE name LIKE ? ORDER BY name').all(`%${search}%`);
}

function getPlayersByStatus(status) {
    return database.prepare('SELECT * FROM players WHERE status = ? ORDER BY name').all(status);
}

function searchPlayersByStatus(search, status) {
    return database.prepare('SELECT * FROM players WHERE name LIKE ? AND status = ? ORDER BY name').all(`%${search}%`, status);
}

function getPlayer(id) {
    return database.prepare('SELECT * FROM players WHERE id = ?').get(id);
}

function createPlayer({ name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status }) {
    const result = database.prepare(
        'INSERT INTO players (name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, title || null, rating || null, rating_rapid || null, rating_blitz || null, rating_classical || null, rating_bullet || null, rating_chess960 || null, country || null, birth_year || null, photo || null, status || 'active');
    return result.lastInsertRowid;
}

function updatePlayer(id, { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status }) {
    const player = getPlayer(id);
    if (!player) return;
    database.prepare(
        'UPDATE players SET name = ?, title = ?, rating = ?, rating_rapid = ?, rating_blitz = ?, rating_classical = ?, rating_bullet = ?, rating_chess960 = ?, country = ?, birth_year = ?, photo = COALESCE(?, photo), status = ? WHERE id = ?'
    ).run(
        name || player.name,
        title != null ? title : player.title,
        rating || player.rating,
        rating_rapid != null ? rating_rapid : player.rating_rapid,
        rating_blitz != null ? rating_blitz : player.rating_blitz,
        rating_classical != null ? rating_classical : player.rating_classical,
        rating_bullet != null ? rating_bullet : player.rating_bullet,
        rating_chess960 != null ? rating_chess960 : player.rating_chess960,
        country || player.country,
        birth_year || player.birth_year,
        photo || null,
        status || player.status || 'active',
        id
    );
}

function deletePlayer(id) {
    database.prepare('DELETE FROM players WHERE id = ?').run(id);
}

// --- Games ---
function saveGame(game) {
    const result = database.prepare(`
        INSERT INTO games (event_name, date, white_name, black_name, white_id, black_id, white_elo, black_elo, result, eco, opening, round_num, site, moves_pgn)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        game.event || game.event_name || '',
        game.date || '',
        game.white || game.white_name || 'Unknown',
        game.black || game.black_name || 'Unknown',
        game.white_id || null,
        game.black_id || null,
        game.white_elo || null,
        game.black_elo || null,
        game.result || '*',
        game.eco || '',
        game.opening || '',
        game.round || game.round_num || '',
        game.site || '',
        game.moves_pgn || (Array.isArray(game.moves) ? game.moves.join(' ') : '')
    );
    return result.lastInsertRowid;
}

function getGame(id) {
    return database.prepare('SELECT * FROM games WHERE id = ?').get(id);
}

function deleteGame(id) {
    database.prepare('DELETE FROM games WHERE id = ?').run(id);
}

function getGamesByPlayer(playerId) {
    const player = database.prepare('SELECT name FROM players WHERE id = ?').get(playerId);
    if (!player) return [];
    return database.prepare(
        'SELECT * FROM games WHERE white_id = ? OR black_id = ? OR white_name = ? OR black_name = ? ORDER BY date DESC, id DESC'
    ).all(playerId, playerId, player.name, player.name);
}

function searchGames({ search, player, event, opening, year, eco, page = 1, limit = 20 }) {
    let where = [];
    let params = [];

    if (search) {
        where.push('(white_name LIKE ? OR black_name LIKE ? OR event_name LIKE ? OR eco LIKE ? OR opening LIKE ?)');
        const s = `%${search}%`;
        params.push(s, s, s, s, s);
    }
    if (player) {
        where.push('(white_name LIKE ? OR black_name LIKE ?)');
        params.push(`%${player}%`, `%${player}%`);
    }
    if (event) {
        where.push('event_name LIKE ?');
        params.push(`%${event}%`);
    }
    if (opening) {
        where.push('(opening LIKE ? OR eco LIKE ?)');
        params.push(`%${opening}%`, `%${opening}%`);
    }
    if (year) {
        where.push('date LIKE ?');
        params.push(`${year}%`);
    }
    if (eco) {
        where.push('eco = ?');
        params.push(eco);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const total = database.prepare(`SELECT COUNT(*) as count FROM games ${whereClause}`).get(...params).count;
    const games = database.prepare(`SELECT * FROM games ${whereClause} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    return { games, total, page, limit, totalPages: Math.ceil(total / limit) };
}

function getStats() {
    const totalGames = database.prepare('SELECT COUNT(*) as count FROM games').get().count;
    const totalPlayers = database.prepare('SELECT COUNT(*) as count FROM players').get().count;
    const topOpenings = database.prepare(
        "SELECT eco, opening, COUNT(*) as count FROM games WHERE eco != '' GROUP BY eco ORDER BY count DESC LIMIT 10"
    ).all();
    const recentGames = database.prepare('SELECT * FROM games ORDER BY created_at DESC LIMIT 5').all();
    const gamesPerYear = database.prepare(
        "SELECT substr(date, 1, 4) as year, COUNT(*) as count FROM games WHERE date != '' GROUP BY year ORDER BY year DESC LIMIT 10"
    ).all();

    return { totalGames, totalPlayers, topOpenings, recentGames, gamesPerYear };
}

function getOpenings() {
    return database.prepare(
        "SELECT eco, opening, COUNT(*) as count FROM games WHERE eco != '' GROUP BY eco, opening ORDER BY count DESC"
    ).all();
}

function getEvents() {
    return database.prepare(
        "SELECT event_name, date, COUNT(*) as count FROM games WHERE event_name != '' GROUP BY event_name ORDER BY count DESC"
    ).all();
}

function getPlayerByName(name) {
    return database.prepare('SELECT * FROM players WHERE name = ?').get(name);
}

function getLeaderboard() {
    return database.prepare(`
        SELECT id, name, title, country, photo, birth_year,
            rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960,
            COALESCE(rating, 0) + COALESCE(rating_rapid, 0) + COALESCE(rating_blitz, 0) +
            COALESCE(rating_classical, 0) + COALESCE(rating_bullet, 0) + COALESCE(rating_chess960, 0) AS total_rating
        FROM players
        WHERE status IS NULL OR status NOT IN ('banned', 'non-member')
        ORDER BY total_rating DESC
    `).all();
}

module.exports = { init, getAdmin, getAllPlayers, searchPlayers, getPlayersByStatus, searchPlayersByStatus, getPlayer, getPlayerByName, createPlayer, updatePlayer, deletePlayer, saveGame, getGame, deleteGame, getGamesByPlayer, searchGames, getStats, getOpenings, getEvents, getLeaderboard };
