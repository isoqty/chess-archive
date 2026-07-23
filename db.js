const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false
});

async function init() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        title VARCHAR(10) DEFAULT '',
        rating INTEGER DEFAULT 0,
        rating_rapid INTEGER DEFAULT 0,
        rating_blitz INTEGER DEFAULT 0,
        rating_classical INTEGER DEFAULT 0,
        rating_bullet INTEGER DEFAULT 0,
        rating_chess960 INTEGER DEFAULT 0,
        country VARCHAR(10) DEFAULT '',
        birth_year INTEGER DEFAULT 0,
        photo VARCHAR(500) DEFAULT '',
        status VARCHAR(50) DEFAULT 'active',
        role VARCHAR(50) DEFAULT 'player',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        event VARCHAR(500) DEFAULT '',
        date VARCHAR(50) DEFAULT '',
        white_name VARCHAR(255) DEFAULT '',
        black_name VARCHAR(255) DEFAULT '',
        result VARCHAR(10) DEFAULT '',
        eco VARCHAR(10) DEFAULT '',
        opening VARCHAR(500) DEFAULT '',
        moves_pgn TEXT DEFAULT '',
        white_elo INTEGER DEFAULT 0,
        black_elo INTEGER DEFAULT 0,
        time_control VARCHAR(50) DEFAULT '',
        round VARCHAR(50) DEFAULT '',
        site VARCHAR(255) DEFAULT '',
        termination VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255) DEFAULT '',
        date_start VARCHAR(50) DEFAULT '',
        date_end VARCHAR(50) DEFAULT '',
        format VARCHAR(50) DEFAULT 'swiss',
        time_control VARCHAR(50) DEFAULT '',
        current_round INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'upcoming',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_participants (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        seed_order INTEGER DEFAULT 0,
        manual_score DOUBLE PRECISION,
        manual_buc1 DOUBLE PRECISION,
        manual_berger DOUBLE PRECISION,
        manual_de DOUBLE PRECISION,
        UNIQUE(tournament_id, player_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_pairings (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        round_number INTEGER NOT NULL,
        board_number INTEGER DEFAULT 1,
        white_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        black_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        result VARCHAR(10) DEFAULT '*',
        UNIQUE(tournament_id, round_number, board_number)
      );
    `);

    const res = await client.query(`SELECT id FROM admins WHERE username = 'admin'`);
    if (res.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('admin123', 10);
      await client.query(`INSERT INTO admins (username, password_hash) VALUES ($1, $2)`, ['admin', hash]);
    }

    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_event ON games(event)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_date ON games(date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_eco ON games(eco)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_games_time_control ON games(time_control)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_players_name ON players(name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_players_status ON players(status)`);
  } finally {
    client.release();
  }
}

async function getAdmin(username) {
  const res = await pool.query(`SELECT * FROM admins WHERE username = $1`, [username]);
  return res.rows[0] || null;
}

async function getAllPlayers() {
  const res = await pool.query(`SELECT * FROM players ORDER BY name ASC`);
  return res.rows;
}

async function searchPlayers(query) {
  const res = await pool.query(`SELECT * FROM players WHERE name ILIKE '%' || $1 || '%' ORDER BY name ASC`, [query]);
  return res.rows;
}

async function getPlayersByStatus(status) {
  const res = await pool.query(`SELECT * FROM players WHERE status = $1 ORDER BY name ASC`, [status]);
  return res.rows;
}

async function searchPlayersByStatus(query, status) {
  const res = await pool.query(`SELECT * FROM players WHERE name ILIKE '%' || $1 || '%' AND status = $2 ORDER BY name ASC`, [query, status]);
  return res.rows;
}

async function getPlayer(id) {
  const res = await pool.query(`SELECT * FROM players WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function getPlayerByName(name) {
  const res = await pool.query(`SELECT * FROM players WHERE name = $1`, [name]);
  return res.rows[0] || null;
}

async function createPlayer(data) {
  const res = await pool.query(`INSERT INTO players (name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status, role)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [data.name, data.title || '', data.rating || 0, data.rating_rapid || 0, data.rating_blitz || 0, data.rating_classical || 0, data.rating_bullet || 0, data.rating_chess960 || 0, data.country || '', data.birth_year || 0, data.photo || null, data.status || 'active', data.role || 'player']
  );
  return res.rows[0].id;
}

async function updatePlayer(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE players SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

async function deletePlayer(id) {
  await pool.query(`DELETE FROM players WHERE id = $1`, [id]);
}

async function banPlayerGames(playerName) {
  await pool.query(`UPDATE games SET result = CASE WHEN result = '1-0' THEN '0-1' WHEN result = '0-1' THEN '1-0' ELSE result END WHERE white_name = $1 AND result IN ('1-0', '0-1')`, [playerName]);
  await pool.query(`UPDATE games SET result = CASE WHEN result = '1-0' THEN '0-1' WHEN result = '0-1' THEN '1-0' ELSE result END WHERE black_name = $1 AND result IN ('1-0', '0-1')`, [playerName]);
}

async function saveGame(game) {
  const res = await pool.query(`INSERT INTO games (event, date, white_name, black_name, result, eco, opening, moves_pgn, white_elo, black_elo, time_control, round, site, termination)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [game.event || 'Unknown Event', game.date || '', game.white || 'Unknown', game.black || 'Unknown', game.result || '*', game.eco || '', game.opening || '', game.moves_pgn || '', game.white_elo || 0, game.black_elo || 0, game.time_control || '', game.round || '', game.site || '', game.termination || '']
  );
  return res.rows[0].id;
}

async function updateGame(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  const dbMap = {
    white_name: 'white_name', black_name: 'black_name',
    white_elo: 'white_elo', black_elo: 'black_elo',
    time_control: 'time_control', date: 'date',
    event_name: 'event', result: 'result',
    eco: 'eco', opening: 'opening'
  };
  for (const [key, value] of Object.entries(data)) {
    const col = dbMap[key] || key;
    if (value !== undefined) {
      fields.push(`${col} = $${idx++}`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE games SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

async function deleteGame(id) {
  await pool.query(`DELETE FROM games WHERE id = $1`, [id]);
}

async function getGame(id) {
  const res = await pool.query(`SELECT * FROM games WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function searchGames({ search, player, event, opening, year, eco, time_control, page = 1, limit = 20 }) {
  let where = [];
  let params = [];
  let idx = 1;

  if (search) {
    where.push(`(white_name ILIKE '%' || $${idx} || '%' OR black_name ILIKE '%' || $${idx} || '%' OR event ILIKE '%' || $${idx} || '%' OR eco ILIKE '%' || $${idx} || '%' OR opening ILIKE '%' || $${idx} || '%')`);
    params.push(search);
    idx++;
  }
  if (player) {
    where.push(`(white_name ILIKE '%' || $${idx} || '%' OR black_name ILIKE '%' || $${idx} || '%')`);
    params.push(player);
    idx++;
  }
  if (event) {
    where.push(`event ILIKE '%' || $${idx} || '%'`);
    params.push(event);
    idx++;
  }
  if (opening) {
    where.push(`opening ILIKE '%' || $${idx} || '%'`);
    params.push(opening);
    idx++;
  }
  if (eco) {
    where.push(`eco = $${idx}`);
    params.push(eco);
    idx++;
  }
  if (year) {
    where.push(`(
      (date ~ '^[0-9]{4}\\.' AND SUBSTRING(date FROM 1 FOR 4) = $${idx}) OR
      (date ~ '/' AND SUBSTRING(date FROM length(date)-3 FOR 4) = $${idx})
    )`);
    params.push(year);
    idx++;
  }
  if (time_control) {
    where.push(`time_control = $${idx}`);
    params.push(time_control);
    idx++;
  }

  const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const countRes = await pool.query(`SELECT COUNT(*) as total FROM games ${whereStr}`, params);
  const total = parseInt(countRes.rows[0].total);

  const dataParams = [...params, limit, offset];
  const dataRes = await pool.query(`SELECT * FROM games ${whereStr} ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx}`, dataParams);

  return { games: dataRes.rows, total, page, limit };
}

async function getGamesByPlayer(playerId) {
  const player = await getPlayer(playerId);
  if (!player) return [];
  const res = await pool.query(`SELECT * FROM games WHERE white_name = $1 OR black_name = $1 ORDER BY id DESC`, [player.name]);
  return res.rows;
}

async function getStats() {
  const totalGames = (await pool.query(`SELECT COUNT(*) as c FROM games`)).rows[0].c;
  const totalPlayers = (await pool.query(`SELECT COUNT(*) as c FROM players`)).rows[0].c;

  const topEvents = (await pool.query(`SELECT event as name, COUNT(*) as count FROM games WHERE event != '' AND event != 'Unknown Event' GROUP BY event ORDER BY count DESC LIMIT 5`)).rows;

  const topOpenings = (await pool.query(`SELECT opening as name, eco, COUNT(*) as count FROM games WHERE (eco != '' OR opening != '') GROUP BY opening, eco ORDER BY count DESC LIMIT 5`)).rows;

  const gamesByYear = (await pool.query(`SELECT
    CASE
      WHEN date ~ '^[0-9]{4}\\.' THEN SUBSTRING(date FROM 1 FOR 4)
      WHEN date ~ '/' THEN SUBSTRING(date FROM length(date)-3 FOR 4)
      ELSE SUBSTRING(date FROM 1 FOR 4)
    END as year,
    COUNT(*) as count
  FROM games WHERE date != '' AND date != '--' GROUP BY year ORDER BY year DESC`)).rows;

  const recentGames = (await pool.query(`SELECT * FROM games ORDER BY id DESC LIMIT 5`)).rows;

  const timeControls = (await pool.query(`SELECT time_control as name, COUNT(*) as count FROM games WHERE time_control != '' GROUP BY time_control ORDER BY count DESC LIMIT 5`)).rows;

  return { totalGames, totalPlayers, topEvents, topOpenings, gamesByYear, recentGames, timeControls };
}

async function getLeaderboard() {
  const res = await pool.query(`SELECT name, title, photo, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960 FROM players ORDER BY rating DESC`);
  return res.rows;
}

async function getOpenings() {
  const res = await pool.query(`SELECT DISTINCT eco, opening FROM games WHERE eco != '' ORDER BY eco`);
  return res.rows;
}

async function getEvents() {
  const res = await pool.query(`SELECT DISTINCT event FROM games WHERE event != '' ORDER BY event`);
  return res.rows;
}

// --- TOURNAMENTS ---

async function getTournaments() {
  const res = await pool.query(`SELECT * FROM tournaments ORDER BY id DESC`);
  return res.rows;
}

async function getTournament(id) {
  const res = await pool.query(`SELECT * FROM tournaments WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function createTournament(data) {
  const res = await pool.query(`INSERT INTO tournaments (name, location, date_start, date_end, format, time_control, current_round, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [data.name, data.location || '', data.date_start || '', data.date_end || '', data.format || 'swiss', data.time_control || '', data.current_round || 0, data.status || 'upcoming']
  );
  return res.rows[0].id;
}

async function updateTournament(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE tournaments SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

async function deleteTournament(id) {
  await pool.query(`DELETE FROM tournaments WHERE id = $1`, [id]);
}

async function addTournamentParticipant(tournamentId, playerId, seedOrder = 0) {
  const res = await pool.query(`INSERT INTO tournament_participants (tournament_id, player_id, seed_order) VALUES ($1,$2,$3) RETURNING id`, [tournamentId, playerId, seedOrder]);
  return res.rows[0].id;
}

async function removeTournamentParticipant(tournamentId, playerId) {
  await pool.query(`DELETE FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2`, [tournamentId, playerId]);
}

async function updateTournamentParticipant(tournamentId, playerId, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  if (data.manual_score !== undefined) { fields.push(`manual_score = $${idx++}`); values.push(data.manual_score); }
  if (data.manual_buc1 !== undefined) { fields.push(`manual_buc1 = $${idx++}`); values.push(data.manual_buc1); }
  if (data.manual_berger !== undefined) { fields.push(`manual_berger = $${idx++}`); values.push(data.manual_berger); }
  if (data.manual_de !== undefined) { fields.push(`manual_de = $${idx++}`); values.push(data.manual_de); }
  if (fields.length === 0) return;
  values.push(tournamentId, playerId);
  await pool.query(`UPDATE tournament_participants SET ${fields.join(', ')} WHERE tournament_id = $${idx++} AND player_id = $${idx}`, values);
}

async function getTournamentParticipants(tournamentId) {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;

  const participants = (await pool.query(`
    SELECT p.id, p.name, p.title, p.photo, p.rating, p.rating_rapid, p.rating_blitz, p.rating_classical, p.rating_bullet,
           tp.seed_order, tp.manual_score, tp.manual_buc1, tp.manual_berger, tp.manual_de
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = $1
    ORDER BY p.name
  `, [tournamentId])).rows;

  const pairings = await getTournamentPairings(tournamentId);

  for (const p of participants) {
    if (p.manual_score !== null && p.manual_score !== undefined) {
      p.score = p.manual_score;
    } else {
      p.score = 0;
    }
    if (p.manual_buc1 !== null && p.manual_buc1 !== undefined) {
      p.buc1 = p.manual_buc1;
    }
    if (p.manual_berger !== null && p.manual_berger !== undefined) {
      p.berger = p.manual_berger;
    }
    if (p.manual_de !== null && p.manual_de !== undefined) {
      p.de = p.manual_de;
    }
  }

  for (const pairing of pairings) {
    if (!pairing.result || pairing.result === '*' || pairing.result === '-') continue;
    const result = pairing.result.replace(/\s/g, '');
    const whiteP = participants.find(p => p.id === pairing.white_player_id);
    const blackP = participants.find(p => p.id === pairing.black_player_id);

    if (result === '1-0') {
      if (whiteP && whiteP.manual_score === null) whiteP.score = (whiteP.score || 0) + 1;
      if (blackP && blackP.manual_score === null) blackP.score = (blackP.score || 0) + 0;
    } else if (result === '0-1') {
      if (whiteP && whiteP.manual_score === null) whiteP.score = (whiteP.score || 0) + 0;
      if (blackP && blackP.manual_score === null) blackP.score = (blackP.score || 0) + 1;
    } else if (result === '1/2-1/2' || result === '½-½' || result === '0.5-0.5') {
      if (whiteP && whiteP.manual_score === null) whiteP.score = (whiteP.score || 0) + 0.5;
      if (blackP && blackP.manual_score === null) blackP.score = (blackP.score || 0) + 0.5;
    }
  }

  participants.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.de || 0) !== (a.de || 0)) return (b.de || 0) - (a.de || 0);
    if (tournament.format === 'swiss') {
      return (b.buc1 || 0) - (a.buc1 || 0);
    }
    return (b.berger || 0) - (a.berger || 0);
  });

  return { ...tournament, participants };
}

// --- TOURNAMENT PAIRINGS ---

async function getTournamentPairings(tournamentId, round) {
  let sql = `
    SELECT tp.*, 
           pw.name as white_name, pw.photo as white_photo, pw.title as white_title,
           pb.name as black_name, pb.photo as black_photo, pb.title as black_title
    FROM tournament_pairings tp
    LEFT JOIN players pw ON pw.id = tp.white_player_id
    LEFT JOIN players pb ON pb.id = tp.black_player_id
    WHERE tp.tournament_id = $1
  `;
  const params = [tournamentId];
  let idx = 2;
  if (round !== null && round !== undefined) {
    sql += ` AND tp.round_number = $${idx++}`;
    params.push(round);
  }
  sql += ` ORDER BY tp.round_number, tp.board_number`;
  const res = await pool.query(sql, params);
  return res.rows;
}

async function addTournamentPairing(tournamentId, data) {
  const res = await pool.query(
    `INSERT INTO tournament_pairings (tournament_id, round_number, board_number, white_player_id, black_player_id, result)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [tournamentId, data.round_number || 1, data.board_number || 1, data.white_player_id || null, data.black_player_id || null, data.result || '*']
  );
  return res.rows[0].id;
}

async function updateTournamentPairing(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE tournament_pairings SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

async function deleteTournamentPairing(id) {
  await pool.query(`DELETE FROM tournament_pairings WHERE id = $1`, [id]);
}

async function deleteTournamentPairingsByRound(tournamentId, round) {
  await pool.query(`DELETE FROM tournament_pairings WHERE tournament_id = $1 AND round_number = $2`, [tournamentId, round]);
}

module.exports = {
  init, getAdmin,
  getAllPlayers, searchPlayers, getPlayersByStatus, searchPlayersByStatus,
  getPlayer, getPlayerByName, createPlayer, updatePlayer, deletePlayer, banPlayerGames,
  saveGame, updateGame, deleteGame, getGame, searchGames, getGamesByPlayer,
  getStats, getLeaderboard, getOpenings, getEvents,
  getTournaments, getTournament, createTournament, updateTournament, deleteTournament,
  addTournamentParticipant, removeTournamentParticipant, updateTournamentParticipant, getTournamentParticipants,
  getTournamentPairings, addTournamentPairing, updateTournamentPairing, deleteTournamentPairing, deleteTournamentPairingsByRound
};
