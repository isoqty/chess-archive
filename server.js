const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
let adminLastSeen = 0;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});
app.use(session({
    secret: 'chess-archive-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false, lastModified: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `player-${Date.now()}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    res.status(401).json({ error: 'Admin login required' });
}

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const admin = db.getAdmin(username);
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.isAdmin = true;
    req.session.adminUser = username;
    res.json({ success: true, username });
});

app.post('/api/auth/logout', (req, res) => {
    adminLastSeen = 0;
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
    res.json({ isAdmin: !!(req.session && req.session.isAdmin), username: req.session?.adminUser });
});

app.post('/api/admin/heartbeat', (req, res) => {
    if (req.session && req.session.isAdmin) {
        adminLastSeen = Date.now();
    }
    res.json({ ok: true });
});

app.get('/api/admin/online', (req, res) => {
    const isOnline = (Date.now() - adminLastSeen) < 120000;
    res.json({ online: isOnline });
});

// --- PLAYERS ---
app.get('/api/players', (req, res) => {
    const { search, status } = req.query;
    let players;
    if (search && status) {
        players = db.searchPlayersByStatus(search, status);
    } else if (status) {
        players = db.getPlayersByStatus(status);
    } else if (search) {
        players = db.searchPlayers(search);
    } else {
        players = db.getAllPlayers();
    }
    res.json(players);
});

app.get('/api/players/:id', (req, res) => {
    const player = db.getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const games = db.getGamesByPlayer(req.params.id);
    res.json({ ...player, games });
});

app.post('/api/players', requireAdmin, upload.single('photo'), (req, res) => {
    const { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, status, role } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : null;
    const id = db.createPlayer({ name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status, role });
    res.json({ id, name, photo });
});

app.put('/api/players/:id', requireAdmin, upload.single('photo'), (req, res) => {
    const { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, status, role } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : undefined;
    const player = db.getPlayer(req.params.id);
    db.updatePlayer(req.params.id, { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status, role });
    if (status === 'banned' && player && player.status !== 'banned') {
        db.banPlayerGames(player.name);
    }
    res.json({ success: true });
});

app.delete('/api/players/:id', requireAdmin, (req, res) => {
    db.deletePlayer(req.params.id);
    res.json({ success: true });
});

// --- GAMES ---
app.get('/api/games', (req, res) => {
    const { search, player, event, opening, year, eco, time_control, page = 1, limit = 20 } = req.query;
    const result = db.searchGames({ search, player, event, opening, year, eco, time_control, page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
});

app.get('/api/games/:id', (req, res) => {
    const game = db.getGame(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const whitePlayer = db.getPlayerByName(game.white_name);
    const blackPlayer = db.getPlayerByName(game.black_name);
    game.white_title = whitePlayer?.title || '';
    game.black_title = blackPlayer?.title || '';
    game.white_photo = whitePlayer?.photo || '';
    game.black_photo = blackPlayer?.photo || '';
    game.white_status = whitePlayer?.status || '';
    game.black_status = blackPlayer?.status || '';
    res.json(game);
});

app.delete('/api/games/:id', requireAdmin, (req, res) => {
    db.deleteGame(req.params.id);
    res.json({ success: true });
});

app.put('/api/games/:id', requireAdmin, (req, res) => {
    try {
        const { white_name, black_name, white_elo, black_elo, time_control, date, event_name, result, eco, opening } = req.body;
        db.updateGame(req.params.id, { white_name, black_name, white_elo, black_elo, time_control, date, event_name, result, eco, opening });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- UPLOAD PGN ---
const pgnUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, file.originalname.endsWith('.pgn') || file.mimetype === 'text/plain')
});

app.post('/api/games/upload-pgn', requireAdmin, pgnUpload.single('pgn'), (req, res) => {
    try {
        let pgnText;
        if (req.file) {
            pgnText = req.file.buffer.toString('utf-8');
        } else if (req.body.pgn) {
            pgnText = req.body.pgn;
        } else {
            return res.status(400).json({ error: 'No PGN data provided' });
        }

        const defaultTC = req.body.time_control || '';
        const games = parsePGNText(pgnText, defaultTC);
        const saved = [];
        for (const game of games) {
            const id = db.saveGame(game);
            saved.push(id);
        }
        res.json({ success: true, count: saved.length, ids: saved });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/games/save', requireAdmin, (req, res) => {
    try {
        const id = db.saveGame(req.body);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- STATS ---
app.get('/api/stats', (req, res) => {
    const stats = db.getStats();
    res.json(stats);
});

// --- LEADERBOARD ---
app.get('/api/leaderboard', (req, res) => {
    const leaderboard = db.getLeaderboard();
    res.json(leaderboard);
});

// --- OPENINGS ---
app.get('/api/openings', (req, res) => {
    const openings = db.getOpenings();
    res.json(openings);
});

// --- EVENTS ---
app.get('/api/events', (req, res) => {
    const events = db.getEvents();
    res.json(events);
});

// --- TOURNAMENTS ---
app.get('/api/tournaments', (req, res) => {
    res.json(db.getTournaments());
});

app.get('/api/tournaments/:id', (req, res) => {
    const t = db.getTournamentParticipants(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    res.json(t);
});

app.post('/api/tournaments', requireAdmin, (req, res) => {
    try {
        const id = db.createTournament(req.body);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tournaments/:id', requireAdmin, (req, res) => {
    try {
        db.updateTournament(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tournaments/:id', requireAdmin, (req, res) => {
    db.deleteTournament(req.params.id);
    res.json({ success: true });
});

app.post('/api/tournaments/:id/players', requireAdmin, (req, res) => {
    try {
        const { player_id, seed_order } = req.body;
        if (!player_id) return res.status(400).json({ error: 'player_id required' });
        const id = db.addTournamentParticipant(req.params.id, parseInt(player_id), seed_order || 0);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tournaments/:id/players/:playerId', requireAdmin, (req, res) => {
    db.removeTournamentParticipant(req.params.id, parseInt(req.params.playerId));
    res.json({ success: true });
});

app.put('/api/tournaments/:id/players/:playerId', requireAdmin, (req, res) => {
    try {
        const { manual_score, manual_buc1, manual_berger, manual_de } = req.body;
        db.updateTournamentParticipant(req.params.id, parseInt(req.params.playerId), { manual_score, manual_buc1, manual_berger, manual_de });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PGN Parser (server-side) ---
function parsePGNText(pgnText, defaultTC = '') {
    const games = [];

    const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
    let match;
    let allHeaders = [];
    while ((match = headerRegex.exec(pgnText)) !== null) {
        allHeaders.push({ key: match[1], value: match[2] });
    }

    const stripped = pgnText.replace(/\[\w+\s+"[^"]*"\]/g, '').replace(/;.*$/gm, '').trim();
    const moveChunks = stripped.split(/\n\s*\n/).filter(c => c.trim());

    if (moveChunks.length === 0 && allHeaders.length > 0) {
        moveChunks.push('');
    }

    if (allHeaders.length > 0 && moveChunks.length <= 1) {
        const headers = {};
        for (const h of allHeaders) {
            headers[h.key] = h.value;
        }
        const moveText = (moveChunks[0] || '').trim();
        if (moveText || Object.keys(headers).length > 0) {
            games.push(buildGame(headers, moveText, defaultTC));
        }
    } else {
        let headerIdx = 0;
        const perGameHeaders = [];
        for (let i = 0; i < allHeaders.length; i++) {
            if (allHeaders[i].key === 'Event' && perGameHeaders.length > 0) {
                headerIdx++;
            }
            if (!perGameHeaders[headerIdx]) perGameHeaders[headerIdx] = {};
            perGameHeaders[headerIdx][allHeaders[i].key] = allHeaders[i].value;
        }
        if (perGameHeaders.length === 0) perGameHeaders.push({});

        for (let i = 0; i < Math.max(perGameHeaders.length, moveChunks.length); i++) {
            const headers = perGameHeaders[i] || {};
            const moveText = (moveChunks[i] || '').trim();
            if (moveText || Object.keys(headers).length > 0) {
                games.push(buildGame(headers, moveText, defaultTC));
            }
        }
    }

    return games;
}

function buildGame(headers, moveText, defaultTC = '') {
    moveText = moveText.replace(/\{[^}]*\}/g, '').replace(/;.*$/gm, '').trim();
    const eco = headers.ECO || '';
    const tc = parseTimeControl(headers.TimeControl || '') || defaultTC;
    return {
        event: headers.Event || 'Unknown Event',
        date: headers.Date || '',
        white: headers.White || 'Unknown',
        black: headers.Black || 'Unknown',
        result: headers.Result || '*',
        eco: eco,
        opening: headers.Opening || eco,
        round: headers.Round || '',
        site: headers.Site || '',
        moves_pgn: moveText,
        white_elo: parseInt(headers.WhiteElo) || null,
        black_elo: parseInt(headers.BlackElo) || null,
        time_control: tc,
        termination: headers.Termination || ''
    };
}

function parseTimeControl(tc) {
    if (!tc) return '';
    if (tc === '-' || tc === ' instantaneous') return '';
    if (tc.includes('/')) {
        const [moves, time] = tc.split('/');
        const seconds = parseInt(time);
        if (seconds < 60) return 'bullet';
        if (seconds < 600) return 'blitz';
        return 'standard';
    }
    const seconds = parseInt(tc);
    if (isNaN(seconds)) return '';
    if (seconds < 60) return 'bullet';
    if (seconds < 600) return 'blitz';
    if (seconds < 3600) return 'rapid';
    return 'standard';
}

// --- Tournament Pairings ---
app.get('/api/tournaments/:id/pairings', (req, res) => {
    const round = req.query.round ? parseInt(req.query.round) : null;
    res.json(db.getTournamentPairings(req.params.id, round));
});

app.post('/api/tournaments/:id/pairings', requireAdmin, (req, res) => {
    try {
        const id = db.addTournamentPairing(req.params.id, req.body);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tournaments/:id/pairings/:pid', requireAdmin, (req, res) => {
    try {
        db.updateTournamentPairing(req.params.pid, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tournaments/:id/pairings/:pid', requireAdmin, (req, res) => {
    db.deleteTournamentPairing(req.params.pid);
    res.json({ success: true });
});

app.delete('/api/tournaments/:id/pairings/round/:round', requireAdmin, (req, res) => {
    db.deleteTournamentPairingsByRound(req.params.id, parseInt(req.params.round));
    res.json({ success: true });
});

// --- Start server ---
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

db.init();
app.listen(PORT, () => {
    console.log(`Chess Archive running at http://localhost:${PORT}`);
});
