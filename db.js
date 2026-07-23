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
            role TEXT,
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
            time_control TEXT,
            termination TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_name);
        CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_name);
        CREATE INDEX IF NOT EXISTS idx_games_event ON games(event_name);
        CREATE INDEX IF NOT EXISTS idx_games_eco ON games(eco);
        CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
        CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);

        CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            location TEXT DEFAULT '',
            date_start TEXT DEFAULT '',
            date_end TEXT DEFAULT '',
            format TEXT DEFAULT '',
            time_control TEXT DEFAULT '',
            current_round INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            details TEXT DEFAULT '',
            prize TEXT DEFAULT '',
            contact TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tournament_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            seed_order INTEGER DEFAULT 0,
            manual_score REAL,
            manual_buc1 REAL,
            manual_berger REAL,
            manual_de REAL,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tournament_pairings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            round_number INTEGER NOT NULL,
            board_number INTEGER DEFAULT 0,
            white_player_id INTEGER,
            black_player_id INTEGER,
            result TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (white_player_id) REFERENCES players(id) ON DELETE SET NULL,
            FOREIGN KEY (black_player_id) REFERENCES players(id) ON DELETE SET NULL
        );
    `);

    const tournamentCols = database.prepare("PRAGMA table_info(tournaments)").all().map(c => c.name);
    if (!tournamentCols.includes('time_control')) {
        database.exec(`ALTER TABLE tournaments ADD COLUMN time_control TEXT DEFAULT ''`);
    }
    if (!tournamentCols.includes('current_round')) {
        database.exec(`ALTER TABLE tournaments ADD COLUMN current_round INTEGER DEFAULT 0`);
    }

    const tpCols = database.prepare("PRAGMA table_info(tournament_participants)").all().map(c => c.name);
    for (const col of ['manual_score', 'manual_buc1', 'manual_berger', 'manual_de']) {
        if (!tpCols.includes(col)) {
            database.exec(`ALTER TABLE tournament_participants ADD COLUMN ${col} REAL`);
        }
    }

    // Migration: add rating columns if missing
    const cols = database.prepare("PRAGMA table_info(players)").all().map(c => c.name);
    const newCols = ['rating_rapid', 'rating_blitz', 'rating_classical', 'rating_bullet', 'rating_chess960', 'title', 'status', 'role'];
    for (const col of newCols) {
        if (!cols.includes(col)) {
            database.exec(`ALTER TABLE players ADD COLUMN ${col} INTEGER`);
        }
    }

    const gameCols = database.prepare("PRAGMA table_info(games)").all().map(c => c.name);
    if (!gameCols.includes('time_control')) {
        database.exec(`ALTER TABLE games ADD COLUMN time_control TEXT`);
    }
    if (!gameCols.includes('termination')) {
        database.exec(`ALTER TABLE games ADD COLUMN termination TEXT`);
    }

    // Migrate existing games: set time_control based on event name patterns
    const gamesWithoutTC = database.prepare("SELECT id, event_name FROM games WHERE time_control IS NULL OR time_control = ''").all();
    for (const g of gamesWithoutTC) {
        let tc = '';
        const ev = (g.event_name || '').toLowerCase();
        if (ev.includes('bullet')) tc = 'bullet';
        else if (ev.includes('blitz')) tc = 'blitz';
        else if (ev.includes('rapid')) tc = 'rapid';
        else if (ev.includes('classical') || ev.includes('standard')) tc = 'standard';
        if (tc) {
            database.prepare("UPDATE games SET time_control = ? WHERE id = ?").run(tc, g.id);
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

function createPlayer({ name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status, role }) {
    const result = database.prepare(
        'INSERT INTO players (name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, title || null, rating || null, rating_rapid || null, rating_blitz || null, rating_classical || null, rating_bullet || null, rating_chess960 || null, country || null, birth_year || null, photo || null, status || 'active', role || null);
    return result.lastInsertRowid;
}

function updatePlayer(id, { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status, role }) {
    const player = getPlayer(id);
    if (!player) return;
    database.prepare(
        'UPDATE players SET name = ?, title = ?, rating = ?, rating_rapid = ?, rating_blitz = ?, rating_classical = ?, rating_bullet = ?, rating_chess960 = ?, country = ?, birth_year = ?, photo = COALESCE(?, photo), status = ?, role = ? WHERE id = ?'
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
        role != null ? role : player.role,
        id
    );
}

function deletePlayer(id) {
    database.prepare('DELETE FROM players WHERE id = ?').run(id);
}

function banPlayerGames(playerName) {
    database.prepare("UPDATE games SET result = '0-1' WHERE white_name = ? AND result = '1-0'").run(playerName);
    database.prepare("UPDATE games SET result = '1-0' WHERE black_name = ? AND result = '0-1'").run(playerName);
    database.prepare("UPDATE games SET result = '0-1' WHERE white_name = ? AND result = '1/2-1/2'").run(playerName);
    database.prepare("UPDATE games SET result = '1-0' WHERE black_name = ? AND result = '1/2-1/2'").run(playerName);
}

// --- Games ---
function saveGame(game) {
    const result = database.prepare(`
        INSERT INTO games (event_name, date, white_name, black_name, white_id, black_id, white_elo, black_elo, result, eco, opening, round_num, site, moves_pgn, time_control, termination)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        game.moves_pgn || (Array.isArray(game.moves) ? game.moves.join(' ') : ''),
        game.time_control || '',
        game.termination || ''
    );
    return result.lastInsertRowid;
}

function getGame(id) {
    return database.prepare('SELECT * FROM games WHERE id = ?').get(id);
}

function deleteGame(id) {
    database.prepare('DELETE FROM games WHERE id = ?').run(id);
}

function updateGame(id, fields) {
    const game = getGame(id);
    if (!game) return;
    const sets = [];
    const params = [];
    for (const [key, val] of Object.entries(fields)) {
        if (val !== undefined) {
            sets.push(`${key} = ?`);
            params.push(val);
        }
    }
    if (sets.length === 0) return;
    params.push(id);
    database.prepare(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

function getGamesByPlayer(playerId) {
    const player = database.prepare('SELECT name FROM players WHERE id = ?').get(playerId);
    if (!player) return [];
    return database.prepare(
        'SELECT * FROM games WHERE white_id = ? OR black_id = ? OR white_name = ? OR black_name = ? ORDER BY date DESC, id DESC'
    ).all(playerId, playerId, player.name, player.name);
}

function searchGames({ search, player, event, opening, year, eco, time_control, page = 1, limit = 20 }) {
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
        where.push("(CASE WHEN date LIKE '__/__/____' THEN substr(date, 7, 4) ELSE substr(date, 1, 4) END) = ?");
        params.push(year);
    }
    if (eco) {
        where.push('eco = ?');
        params.push(eco);
    }
    if (time_control) {
        where.push('time_control = ?');
        params.push(time_control);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const total = database.prepare(`SELECT COUNT(*) as count FROM games ${whereClause}`).get(...params).count;
    const games = database.prepare(`
        SELECT g.*, wp.status as white_status, bp.status as black_status
        FROM games g
        LEFT JOIN players wp ON g.white_name = wp.name
        LEFT JOIN players bp ON g.black_name = bp.name
        ${whereClause}
        ORDER BY g.date DESC, g.id DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { games, total, page, limit, totalPages: Math.ceil(total / limit) };
}

function getStats() {
    const totalGames = database.prepare('SELECT COUNT(*) as count FROM games').get().count;
    const totalPlayers = database.prepare('SELECT COUNT(*) as count FROM players').get().count;
    const topTimeControls = database.prepare(
        "SELECT time_control, COUNT(*) as count FROM games WHERE time_control != '' GROUP BY time_control ORDER BY count DESC LIMIT 10"
    ).all();
    const topOpenings = database.prepare(
        "SELECT eco, opening, COUNT(*) as count FROM games WHERE (eco != '' OR opening != '') GROUP BY eco, opening ORDER BY count DESC LIMIT 10"
    ).all();
    const recentGames = database.prepare('SELECT * FROM games ORDER BY created_at DESC LIMIT 5').all();
    const gamesPerYear = database.prepare(
        "SELECT (CASE WHEN date LIKE '__/__/____' THEN substr(date, 7, 4) ELSE substr(date, 1, 4) END) as year, COUNT(*) as count FROM games WHERE date != '' AND date NOT LIKE '%??%' AND date NOT LIKE '%--%' GROUP BY year ORDER BY year DESC LIMIT 10"
    ).all();

    return { totalGames, totalPlayers, topTimeControls, topOpenings, recentGames, gamesPerYear };
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

function getTournaments() {
    return database.prepare('SELECT * FROM tournaments ORDER BY CASE WHEN status = \'active\' THEN 0 ELSE 1 END, date_start DESC').all();
}

function getTournament(id) {
    return database.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
}

function createTournament(t) {
    const result = database.prepare(
        'INSERT INTO tournaments (name, location, date_start, date_end, format, time_control, current_round, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(t.name, t.location || '', t.date_start || '', t.date_end || '', t.format || '', t.time_control || '', t.current_round || 0, t.status || 'active');
    return result.lastInsertRowid;
}

function updateTournament(id, t) {
    database.prepare(
        'UPDATE tournaments SET name = ?, location = ?, date_start = ?, date_end = ?, format = ?, time_control = ?, current_round = ?, status = ? WHERE id = ?'
    ).run(t.name, t.location || '', t.date_start || '', t.date_end || '', t.format || '', t.time_control || '', t.current_round || 0, t.status || 'active', id);
}

function deleteTournament(id) {
    database.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
}

function addTournamentParticipant(tournamentId, playerId, seedOrder = 0) {
    const existing = database.prepare('SELECT id FROM tournament_participants WHERE tournament_id = ? AND player_id = ?').get(tournamentId, playerId);
    if (existing) return existing.id;
    const result = database.prepare('INSERT INTO tournament_participants (tournament_id, player_id, seed_order) VALUES (?, ?, ?)').run(tournamentId, playerId, seedOrder);
    return result.lastInsertRowid;
}

function removeTournamentParticipant(tournamentId, playerId) {
    database.prepare('DELETE FROM tournament_participants WHERE tournament_id = ? AND player_id = ?').run(tournamentId, playerId);
}

function updateTournamentParticipant(tournamentId, playerId, fields) {
    const sets = [];
    const params = [];
    for (const [key, val] of Object.entries(fields)) {
        if (['manual_score', 'manual_buc1', 'manual_berger', 'manual_de'].includes(key)) {
            sets.push(`${key} = ?`);
            params.push(val === '' || val === undefined ? null : parseFloat(val));
        }
    }
    if (sets.length === 0) return;
    params.push(tournamentId, playerId);
    database.prepare(`UPDATE tournament_participants SET ${sets.join(', ')} WHERE tournament_id = ? AND player_id = ?`).run(...params);
}

function getTournamentParticipants(tournamentId) {
    const tournament = database.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) return null;

    const participants = database.prepare(`
        SELECT 
            p.id, p.name, p.title, p.photo, p.rating, p.rating_rapid, p.rating_blitz, p.rating_classical, p.rating_bullet,
            tp.seed_order, tp.manual_score, tp.manual_buc1, tp.manual_berger, tp.manual_de,
            COALESCE(SUM(CASE 
                WHEN g.white_name = p.name AND g.result = '1-0' THEN 1
                WHEN g.black_name = p.name AND g.result = '0-1' THEN 1
                WHEN (g.white_name = p.name OR g.black_name = p.name) AND g.result = '1/2-1/2' THEN 0.5
                ELSE 0
            END), 0) as calc_score,
            COUNT(g.id) as games_played,
            COALESCE(SUM(CASE 
                WHEN (g.white_name = p.name AND g.result = '1-0') OR (g.black_name = p.name AND g.result = '0-1') THEN 1
                ELSE 0
            END), 0) as wins,
            COALESCE(SUM(CASE 
                WHEN (g.white_name = p.name OR g.black_name = p.name) AND g.result = '1/2-1/2' THEN 1
                ELSE 0
            END), 0) as draws,
            COALESCE(SUM(CASE 
                WHEN (g.white_name = p.name AND g.result = '0-1') OR (g.black_name = p.name AND g.result = '1-0') THEN 1
                ELSE 0
            END), 0) as losses
        FROM tournament_participants tp
        JOIN players p ON tp.player_id = p.id
        LEFT JOIN games g ON (g.white_name = p.name OR g.black_name = p.name) AND g.event_name = ?
        WHERE tp.tournament_id = ?
        GROUP BY p.id
    `).all(tournament.name, tournamentId);

    // Calculate tiebreaks
    const games = database.prepare(
        'SELECT white_name, black_name, result FROM games WHERE event_name = ?'
    ).all(tournament.name);

    const isSwiss = (tournament.format || '').toLowerCase().includes('swiss');

    // Apply manual score overrides first (needed for Buchholz)
    for (const p of participants) {
        p.score = p.manual_score !== null && p.manual_score !== undefined ? p.manual_score : p.calc_score;
    }

    const scoreMap = {};
    for (const p of participants) scoreMap[p.name] = p.score;

    // Build opponent list per player and per-game results
    const opponents = {};
    const gameResults = {};
    for (const p of participants) {
        opponents[p.name] = [];
        gameResults[p.name] = [];
    }

    for (const g of games) {
        if (scoreMap[g.white_name] === undefined || scoreMap[g.black_name] === undefined) continue;
        opponents[g.white_name].push(g.black_name);
        opponents[g.black_name].push(g.white_name);

        if (g.result === '1-0') {
            gameResults[g.white_name].push({ opponent: g.black_name, myScore: 1 });
            gameResults[g.black_name].push({ opponent: g.white_name, myScore: 0 });
        } else if (g.result === '0-1') {
            gameResults[g.white_name].push({ opponent: g.black_name, myScore: 0 });
            gameResults[g.black_name].push({ opponent: g.white_name, myScore: 1 });
        } else if (g.result === '1/2-1/2') {
            gameResults[g.white_name].push({ opponent: g.black_name, myScore: 0.5 });
            gameResults[g.black_name].push({ opponent: g.white_name, myScore: 0.5 });
        }
    }

    for (const p of participants) {
        const opps = opponents[p.name] || [];
        if (opps.length === 0) {
            p.buchholz = 0;
            p.buc1 = p.manual_buc1 !== null && p.manual_buc1 !== undefined ? p.manual_buc1 : 0;
            p.berger = p.manual_berger !== null && p.manual_berger !== undefined ? p.manual_berger : 0;
            p.de = p.manual_de !== null && p.manual_de !== undefined ? p.manual_de : 0;
            continue;
        }

        const oppScores = opps.map(o => scoreMap[o] || 0);

        p.buchholz = oppScores.reduce((a, b) => a + b, 0);

        if (isSwiss) {
            const sorted = [...oppScores].sort((a, b) => a - b);
            p.buc1 = sorted.length > 1 ? p.buchholz - sorted[0] : p.buchholz;
        }

        const results = gameResults[p.name] || [];
        p.berger = results.reduce((sum, r) => sum + (scoreMap[r.opponent] || 0) * r.myScore, 0);

        const tiedNames = new Set(participants.filter(x => x.score === p.score).map(x => x.name));
        p.de = results.filter(r => tiedNames.has(r.opponent)).reduce((sum, r) => sum + r.myScore, 0);

        // Apply manual tiebreak overrides
        if (p.manual_buc1 !== null && p.manual_buc1 !== undefined) p.buc1 = p.manual_buc1;
        if (p.manual_berger !== null && p.manual_berger !== undefined) p.berger = p.manual_berger;
        if (p.manual_de !== null && p.manual_de !== undefined) p.de = p.manual_de;
    }

    // Re-sort by score, then tiebreaks based on format
    if (isSwiss) {
        participants.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.de !== a.de) return b.de - a.de;
            if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
            if (b.buc1 !== a.buc1) return b.buc1 - a.buc1;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.seed_order - b.seed_order;
        });
    } else {
        participants.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.de !== a.de) return b.de - a.de;
            if (b.berger !== a.berger) return b.berger - a.berger;
            return a.seed_order - b.seed_order;
        });
    }

    return { ...tournament, participants };
}

// --- Tournament Pairings ---
function getTournamentPairings(tournamentId, roundNumber) {
    let sql = `
        SELECT tp.*,
            pw.name as white_name, pw.title as white_title, pw.photo as white_photo,
            pb.name as black_name, pb.title as black_title, pb.photo as black_photo
        FROM tournament_pairings tp
        LEFT JOIN players pw ON tp.white_player_id = pw.id
        LEFT JOIN players pb ON tp.black_player_id = pb.id
        WHERE tp.tournament_id = ?
    `;
    const params = [tournamentId];
    if (roundNumber) {
        sql += ' AND tp.round_number = ?';
        params.push(roundNumber);
    }
    sql += ' ORDER BY tp.round_number, tp.board_number';
    return database.prepare(sql).all(...params);
}

function addTournamentPairing(tournamentId, p) {
    const result = database.prepare(
        'INSERT INTO tournament_pairings (tournament_id, round_number, board_number, white_player_id, black_player_id, result) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(tournamentId, p.round_number || 1, p.board_number || 0, p.white_player_id || null, p.black_player_id || null, p.result || '');
    return result.lastInsertRowid;
}

function updateTournamentPairing(id, p) {
    database.prepare(
        'UPDATE tournament_pairings SET round_number = ?, board_number = ?, white_player_id = ?, black_player_id = ?, result = ? WHERE id = ?'
    ).run(p.round_number || 1, p.board_number || 0, p.white_player_id || null, p.black_player_id || null, p.result || '', id);
}

function deleteTournamentPairing(id) {
    database.prepare('DELETE FROM tournament_pairings WHERE id = ?').run(id);
}

function deleteTournamentPairingsByRound(tournamentId, roundNumber) {
    database.prepare('DELETE FROM tournament_pairings WHERE tournament_id = ? AND round_number = ?').run(tournamentId, roundNumber);
}

module.exports = { init, getAdmin, getAllPlayers, searchPlayers, getPlayersByStatus, searchPlayersByStatus, getPlayer, getPlayerByName, createPlayer, updatePlayer, deletePlayer, banPlayerGames, saveGame, getGame, updateGame, deleteGame, getGamesByPlayer, searchGames, getStats, getOpenings, getEvents, getLeaderboard, getTournaments, getTournament, createTournament, updateTournament, deleteTournament, addTournamentParticipant, removeTournamentParticipant, updateTournamentParticipant, getTournamentParticipants, getTournamentPairings, addTournamentPairing, updateTournamentPairing, deleteTournamentPairing, deleteTournamentPairingsByRound };
