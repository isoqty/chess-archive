const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'chess-archive-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));
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
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
    res.json({ isAdmin: !!(req.session && req.session.isAdmin), username: req.session?.adminUser });
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
    const { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, status } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : null;
    const id = db.createPlayer({ name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status });
    res.json({ id, name, photo });
});

app.put('/api/players/:id', requireAdmin, upload.single('photo'), (req, res) => {
    const { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, status } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : undefined;
    db.updatePlayer(req.params.id, { name, title, rating, rating_rapid, rating_blitz, rating_classical, rating_bullet, rating_chess960, country, birth_year, photo, status });
    res.json({ success: true });
});

app.delete('/api/players/:id', requireAdmin, (req, res) => {
    db.deletePlayer(req.params.id);
    res.json({ success: true });
});

// --- GAMES ---
app.get('/api/games', (req, res) => {
    const { search, player, event, opening, year, eco, page = 1, limit = 20 } = req.query;
    const result = db.searchGames({ search, player, event, opening, year, eco, page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
});

app.get('/api/games/:id', (req, res) => {
    const game = db.getGame(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const whitePlayer = db.getPlayerByName(game.white_name);
    const blackPlayer = db.getPlayerByName(game.black_name);
    game.white_title = whitePlayer?.title || '';
    game.black_title = blackPlayer?.title || '';
    res.json(game);
});

app.delete('/api/games/:id', requireAdmin, (req, res) => {
    db.deleteGame(req.params.id);
    res.json({ success: true });
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

        const games = parsePGNText(pgnText);
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

// --- PGN Parser (server-side) ---
function parsePGNText(pgnText) {
    const games = [];
    const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;

    let currentHeaders = {};
    let moveLines = [];

    const lines = pgnText.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        const headerMatch = trimmed.match(/^\[(\w+)\s+"([^"]*)"\]\s*$/);
        if (headerMatch) {
            if (moveLines.length > 0 && Object.keys(currentHeaders).length > 0) {
                const moveText = moveLines.join(' ').trim();
                if (moveText) {
                    games.push(buildGame(currentHeaders, moveText));
                }
                currentHeaders = {};
                moveLines = [];
            }
            currentHeaders[headerMatch[1]] = headerMatch[2];
        } else if (trimmed && !trimmed.startsWith(';')) {
            moveLines.push(trimmed);
        }
    }

    if (Object.keys(currentHeaders).length > 0 || moveLines.length > 0) {
        const moveText = moveLines.join(' ').trim();
        if (moveText) {
            games.push(buildGame(currentHeaders, moveText));
        }
    }

    return games;
}

function buildGame(headers, moveText) {
    moveText = moveText.replace(/\{[^}]*\}/g, '').replace(/;.*$/gm, '').trim();
    const eco = headers.ECO || '';
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
        black_elo: parseInt(headers.BlackElo) || null
    };
}

// --- Start server ---
db.init();
app.listen(PORT, () => {
    console.log(`Chess Archive running at http://localhost:${PORT}`);
});
