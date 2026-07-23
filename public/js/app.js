class ChessApp {
    constructor() {
        this.chess = new Chess();
        this.board = new ChessBoard('chessboard');
        this.games = [];
        this.currentGameIndex = -1;
        this.currentPlayerStatus = 'active';
        this.currentMoveIndex = -1;
        this.autoPlayInterval = null;
        this.autoPlaySpeed = 1000;
        this.currentPage = 1;
        this.totalPages = 1;
        this.isAdmin = false;
        this.currentGameId = null;
        this.currentGame = null;
        this._pairingRound = 1;
        this._currentTournament = null;

        this.initEventListeners();
        this.checkAuth();
        this.loadGames();
        this.startAdminHeartbeat();
        this.startOnlineStatusPoll();
    }

    formatDate(dateStr) {
        if (!dateStr || dateStr === '????.??.??') return dateStr || '';
        const sep = dateStr.includes('.') ? '.' : dateStr.includes('-') ? '-' : '/';
        const parts = dateStr.split(sep);
        if (parts.length !== 3) return dateStr;
        if (parts[0].length === 4 && parts[0] !== '????') {
            const [y, m, d] = parts;
            return `${m}/${d}/${y}`;
        }
        if (parts[2].length === 4) {
            return dateStr;
        }
        return dateStr;
    }

    startAdminHeartbeat() {
        this.adminHeartbeatInterval = setInterval(async () => {
            if (!this.isAdmin) return;
            try { await fetch('/api/admin/heartbeat', { method: 'POST' }); } catch (e) {}
        }, 30000);
        if (this.isAdmin) {
            fetch('/api/admin/heartbeat', { method: 'POST' }).catch(() => {});
        }
    }

    startOnlineStatusPoll() {
        const poll = async () => {
            try {
                const res = await fetch('/api/admin/online');
                const data = await res.json();
                const el = document.getElementById('admin-online-indicator');
                const txt = el.querySelector('.admin-status-text');
                if (data.online) {
                    el.classList.add('online');
                    txt.textContent = 'Admin Online';
                } else {
                    el.classList.remove('online');
                    txt.textContent = 'Admin Offline';
                }
            } catch (e) {}
        };
        poll();
        setInterval(poll, 15000);
    }

    initEventListeners() {
        document.getElementById('btn-start').addEventListener('click', () => this.goToStart());
        document.getElementById('btn-prev').addEventListener('click', () => this.prevMove());
        document.getElementById('btn-next').addEventListener('click', () => this.nextMove());
        document.getElementById('btn-end').addEventListener('click', () => this.goToEnd());
        document.getElementById('btn-flip').addEventListener('click', () => this.flipBoard());
        document.getElementById('btn-auto').addEventListener('click', () => this.toggleAutoPlay());

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage(e.target.dataset.page);
            });
        });

        // Search / Filters
        let searchTimeout;
        document.getElementById('search-input').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.loadGames(), 300);
        });
        document.getElementById('filter-time-control').addEventListener('change', () => this.loadGames());
        document.getElementById('filter-year').addEventListener('change', () => this.loadGames());

        // Player search
        let playerSearchTimeout;
        document.getElementById('player-search').addEventListener('input', (e) => {
            clearTimeout(playerSearchTimeout);
            playerSearchTimeout = setTimeout(() => this.loadPlayers(e.target.value), 300);
        });

        // Modal close
        document.querySelector('.modal-close').addEventListener('click', () => {
            document.getElementById('player-modal').style.display = 'none';
        });
        document.getElementById('player-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
        });

        // Admin - Login
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        document.getElementById('btn-logout').addEventListener('click', () => this.logout());

        // Admin - Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById('tab-' + e.target.dataset.tab).classList.add('active');
                if (e.target.dataset.tab === 'manage-tournaments') this.loadAdminTournaments();
            });
        });

        // Admin - PGN Upload
        const pgnArea = document.getElementById('pgn-upload-area');
        const pgnInput = document.getElementById('pgn-file-input');
        pgnArea.addEventListener('click', () => pgnInput.click());
        pgnArea.addEventListener('dragover', (e) => { e.preventDefault(); pgnArea.classList.add('dragover'); });
        pgnArea.addEventListener('dragleave', () => pgnArea.classList.remove('dragover'));
        pgnArea.addEventListener('drop', (e) => {
            e.preventDefault();
            pgnArea.classList.remove('dragover');
            this.uploadPGNFiles(e.dataTransfer.files);
        });
        pgnInput.addEventListener('change', (e) => this.uploadPGNFiles(e.target.files));

        document.getElementById('btn-parse-pgn').addEventListener('click', () => this.parsePGNText());

        // Admin - Player search in manage tab
        let adminPlayerSearchTimeout;
        const adminPlayerSearch = document.getElementById('admin-player-search');
        if (adminPlayerSearch) {
            adminPlayerSearch.addEventListener('input', (e) => {
                clearTimeout(adminPlayerSearchTimeout);
                adminPlayerSearchTimeout = setTimeout(() => this.loadAdminPlayers(e.target.value), 300);
            });
        }

        // Admin - Player status tabs
        document.querySelectorAll('.player-status-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.player-status-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentPlayerStatus = tab.dataset.status;
                this.loadAdminPlayers(document.getElementById('admin-player-search')?.value || '');
            });
        });

        // Admin - Edit Player Form
        const editPlayerForm = document.getElementById('edit-player-form');
        if (editPlayerForm) {
            editPlayerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEditPlayer();
            });
        }

        // Admin - Edit Game Form
        const editGameForm = document.getElementById('edit-game-form');
        if (editGameForm) {
            editGameForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEditGame();
            });
        }

        // Admin - Player Form
        document.getElementById('player-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePlayer();
        });

        document.getElementById('player-photo').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    document.getElementById('photo-preview').innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.key === 'ArrowLeft') this.prevMove();
            if (e.key === 'ArrowRight') this.nextMove();
            if (e.key === 'Home') this.goToStart();
            if (e.key === 'End') this.goToEnd();
            if (e.key === ' ') { e.preventDefault(); this.toggleAutoPlay(); }
        });

        document.getElementById('btn-save-tournament').addEventListener('click', () => this.saveTournament());
        document.getElementById('btn-add-tournament-player').addEventListener('click', () => {
            const btn = document.getElementById('btn-save-tournament');
            const editId = btn.dataset.editId;
            if (editId) this.addTournamentPlayer(editId);
        });
    }

    // --- Navigation ---
    switchPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        if (page === 'archive') this.loadGames();
        if (page === 'players') this.loadPlayers();
        if (page === 'stats') this.loadStats();
        if (page === 'leaderboard') this.loadLeaderboard();
        if (page === 'admin') this.checkAuth();
        if (page === 'tournaments') this.loadTournaments();
    }

    // --- Auth ---
    async checkAuth() {
        try {
            const res = await fetch('/api/auth/status');
            const data = await res.json();
            this.isAdmin = data.isAdmin;
            this.updateAdminUI();
        } catch (e) {}
    }

    updateAdminUI() {
        document.getElementById('admin-login').style.display = this.isAdmin ? 'none' : 'block';
        document.getElementById('admin-dashboard').style.display = this.isAdmin ? 'block' : 'none';
        if (this.isAdmin) {
            this.loadAdminGames();
            this.loadAdminPlayers();
        }
    }

    async login() {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                this.isAdmin = true;
                this.updateAdminUI();
                fetch('/api/admin/heartbeat', { method: 'POST' }).catch(() => {});
                this.renderGameList();
                errEl.textContent = '';
            } else {
                errEl.textContent = data.error || 'Login failed';
            }
        } catch (e) {
            errEl.textContent = 'Connection error';
        }
    }

    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.isAdmin = false;
        this.updateAdminUI();
        this.renderGameList();
    }

    // --- Games ---
    async loadGames(page = 1) {
        const search = document.getElementById('search-input').value;
        const timeControl = document.getElementById('filter-time-control').value;
        const year = document.getElementById('filter-year').value;

        const params = new URLSearchParams({ page, limit: 20 });
        if (search) params.set('search', search);
        if (timeControl) params.set('time_control', timeControl);
        if (year) params.set('year', year);

        try {
            const res = await fetch(`/api/games?${params}`);
            const data = await res.json();
            this.games = data.games;
            this.currentPage = data.page;
            this.totalPages = data.totalPages;
            this.renderGameList();
            this.renderPagination();
            this.loadFilters();
        } catch (e) {
            document.getElementById('game-list').innerHTML = '<p class="empty-state">Could not load games. Start the server with: node server.js</p>';
        }
    }

    renderGameList() {
        const list = document.getElementById('game-list');
        if (this.games.length === 0) {
            list.innerHTML = '<p class="empty-state">No games found.</p>';
            return;
        }
        list.innerHTML = this.games.map(g => {
            const tc = g.time_control ? `<span class="time-control-badge">${g.time_control.charAt(0).toUpperCase() + g.time_control.slice(1)}</span>` : '';
            const wBanned = g.white_status === 'banned' ? ' <span class="player-banned-badge">Banned</span>' : '';
            const bBanned = g.black_status === 'banned' ? ' <span class="player-banned-badge">Banned</span>' : '';
            return `
            <div class="game-item" data-id="${g.id}">
                <span class="game-item-result">${g.result || '*'}</span>
                <div class="game-item-players">${g.white_name}${wBanned} vs ${g.black_name}${bBanned}</div>
                <div class="game-item-event">${g.event_name || ''} ${this.formatDate(g.date)} ${tc} ${g.eco ? '(' + g.eco + ')' : ''}</div>
            </div>
            `;
        }).join('');

        list.querySelectorAll('.game-item').forEach(item => {
            item.addEventListener('click', () => this.loadGameById(parseInt(item.dataset.id)));
        });
    }

    renderPagination() {
        const container = document.getElementById('pagination');
        if (this.totalPages <= 1) { container.innerHTML = ''; return; }

        let html = '';
        if (this.currentPage > 1) html += `<button data-page="${this.currentPage - 1}">◀</button>`;
        for (let i = Math.max(1, this.currentPage - 2); i <= Math.min(this.totalPages, this.currentPage + 2); i++) {
            html += `<button class="${i === this.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        if (this.currentPage < this.totalPages) html += `<button data-page="${this.currentPage + 1}">▶</button>`;
        container.innerHTML = html;

        container.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => this.loadGames(parseInt(btn.dataset.page)));
        });
    }

    async loadFilters() {
        try {
            const [openingsRes, eventsRes] = await Promise.all([
                fetch('/api/openings'),
                fetch('/api/events')
            ]);
            const openings = await openingsRes.json();
            const events = await eventsRes.json();

            const extractYear = (d) => {
                if (!d) return '';
                if (d.includes('/') && d.length >= 10) return d.substring(6, 10);
                return d.substring(0, 4);
            };
            const years = [...new Set(events.map(e => extractYear(e.date)).filter(y => y && y !== '????'))].sort().reverse();
            const yearSelect = document.getElementById('filter-year');
            const currentYear = yearSelect.value;
            yearSelect.innerHTML = '<option value="">All Years</option>' +
                years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');
        } catch (e) {}
    }

    async loadGameById(id) {
        try {
            const res = await fetch(`/api/games/${id}`);
            const game = await res.json();
            this.currentGameId = game.id;
            this.loadGameIntoBoard(game);
        } catch (e) {}
    }

    loadGameIntoBoard(game) {
        this.chess.reset();
        this.currentMoveIndex = -1;
        this.currentGame = game;

        let wBadge = '', bBadge = '';
        if (game.result === '1-0') { wBadge = ' <span class="result-badge result-win">1</span>'; bBadge = ' <span class="result-badge result-loss">0</span>'; }
        else if (game.result === '0-1') { wBadge = ' <span class="result-badge result-loss">0</span>'; bBadge = ' <span class="result-badge result-win">1</span>'; }
        else if (game.result === '1/2-1/2') { wBadge = ' <span class="result-badge result-draw">½</span>'; bBadge = ' <span class="result-badge result-draw">½</span>'; }
        const blackTitle = game.black_title ? `<span class="title-badge">${game.black_title}</span> ` : '';
        const whiteTitle = game.white_title ? `<span class="title-badge">${game.white_title}</span> ` : '';
        const wBanned = game.white_status === 'banned' ? ' <span class="player-banned-badge">Banned</span>' : '';
        const bBanned = game.black_status === 'banned' ? ' <span class="player-banned-badge">Banned</span>' : '';
        document.getElementById('player-top').querySelector('.player-name').innerHTML = blackTitle + game.black_name + bBanned + bBadge;
        document.getElementById('player-top').querySelector('.player-rating').textContent = game.black_elo || '';
        const topPhoto = document.getElementById('player-top').querySelector('.player-bar-photo');
        if (game.black_photo) { topPhoto.src = game.black_photo; topPhoto.style.display = 'inline-block'; } else { topPhoto.style.display = 'none'; }
        document.getElementById('player-bottom').querySelector('.player-name').innerHTML = whiteTitle + game.white_name + wBanned + wBadge;
        document.getElementById('player-bottom').querySelector('.player-rating').textContent = game.white_elo || '';
        const botPhoto = document.getElementById('player-bottom').querySelector('.player-bar-photo');
        if (game.white_photo) { botPhoto.src = game.white_photo; botPhoto.style.display = 'inline-block'; } else { botPhoto.style.display = 'none'; }

        document.getElementById('info-event').textContent = game.event_name || '-';
        document.getElementById('info-date').textContent = this.formatDate(game.date) || '-';
        document.getElementById('info-result').textContent = game.result || '-';
        const opening = game.eco ? (game.eco + (game.opening ? ' - ' + game.opening : '')) : (game.opening || '-');
        document.getElementById('info-opening').textContent = opening;
        const tc = game.time_control || '';
        document.getElementById('info-time-control').textContent = tc ? tc.charAt(0).toUpperCase() + tc.slice(1) : '-';

        const pgnMoves = game.moves_pgn || '';
        const moveTokens = pgnMoves.split(/\s+/).filter(t => t && !t.match(/^\d+\.+$/) && t !== '1-0' && t !== '0-1' && t !== '1/2-1/2' && t !== '*');

        this.parsedMoves = [];
        const tempChess = new Chess();
        for (const token of moveTokens) {
            const move = PGNParser.parseSAN(tempChess, token, tempChess.turn);
            if (move && tempChess.makeMove(move)) {
                this.parsedMoves.push({ san: token, move });
            }
        }

        this.board.update(this.chess);
        this.renderMoveList();
        if (typeof evalBar !== 'undefined') evalBar.evaluate(this.chess.toFEN());
        this.highlightGameInList(game.id);
        this.updateGameEndOverlay();
    }

    highlightGameInList(id) {
        document.querySelectorAll('.game-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.id) === id);
        });
    }

    renderMoveList() {
        const container = document.getElementById('move-list-area');
        if (!this.parsedMoves || this.parsedMoves.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '<div class="move-list-container"><div class="move-list">';
        for (let i = 0; i < this.parsedMoves.length; i += 2) {
            const num = Math.floor(i / 2) + 1;
            html += `<span class="move-number">${num}.</span>`;
            html += `<span class="move ${i === this.currentMoveIndex ? 'current' : ''}" data-index="${i}">${this.parsedMoves[i].san}</span>`;
            if (this.parsedMoves[i + 1]) {
                html += `<span class="move ${i + 1 === this.currentMoveIndex ? 'current' : ''}" data-index="${i + 1}">${this.parsedMoves[i + 1].san}</span>`;
            } else {
                html += '<span></span>';
            }
        }
        html += '</div></div>';
        container.innerHTML = html;

        container.querySelectorAll('.move').forEach(el => {
            el.addEventListener('click', () => this.goToMove(parseInt(el.dataset.index)));
        });
    }

    getGameEndInfo() {
        if (!this.currentGame) return null;
        const game = this.currentGame;
        const result = game.result;
        if (!result || result === '*') return null;

        const isDraw = result === '1/2-1/2';
        const termination = (game.termination || '').toLowerCase();
        let loserReason = 'resign';
        if (termination.includes('timeout') || termination.includes('time') || termination.includes('flag') || termination.includes('forfeit')) {
            loserReason = 'timeout';
        } else if (termination.includes('checkmate') || termination === 'normal' || !termination) {
            if (this.chess.gameOver && this.chess.moveHistory.length > 0) {
                const lastMove = this.chess.moveHistory[this.chess.moveHistory.length - 1];
                if (lastMove && lastMove.checkmate) loserReason = 'checkmate';
                else loserReason = 'resign';
            } else {
                loserReason = 'resign';
            }
        } else if (termination.includes('resign')) {
            loserReason = 'resign';
        }

        const loserIsWhite = result === '0-1';
        return { result, loserReason, loserIsWhite, isDraw };
    }

    updateGameEndOverlay() {
        this.board.clearGameEndOverlays();
        const endInfo = this.getGameEndInfo();
        if (!endInfo) return;
        const isAtEnd = this.parsedMoves && this.currentMoveIndex === this.parsedMoves.length - 1;
        if (!isAtEnd) return;

        const { loserReason, loserIsWhite, isDraw } = endInfo;
        const board = this.chess.board;

        let whiteKingFile = -1, whiteKingRank = -1;
        let blackKingFile = -1, blackKingRank = -1;
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = board[r][f];
                if (p && p.type === 'k') {
                    if (p.color === 'w') { whiteKingFile = f; whiteKingRank = r; }
                    else { blackKingFile = f; blackKingRank = r; }
                }
            }
        }

        if (isDraw) {
            if (whiteKingFile >= 0) this.board.showGameEndOverlay(whiteKingFile, whiteKingRank, 'Draw', '\u00BD', 'draw', 'draw');
            if (blackKingFile >= 0) this.board.showGameEndOverlay(blackKingFile, blackKingRank, 'Draw', '\u00BD', 'draw', 'draw');
            return;
        }

        const reasonIcons = { resign: '\u{1F6A9}', timeout: '\u{23F0}\u2716\uFE0F', checkmate: '\u265A' };
        const reasonLabels = { resign: 'Resign', timeout: 'Timeout', checkmate: 'Checkmate' };
        const winnerIcon = '\u{1F451}';

        if (loserIsWhite) {
            if (whiteKingFile >= 0) this.board.showGameEndOverlay(whiteKingFile, whiteKingRank, reasonLabels[loserReason], reasonIcons[loserReason], loserReason === 'checkmate' ? 'checkmate-loser' : '', 'loser');
            if (blackKingFile >= 0) this.board.showGameEndOverlay(blackKingFile, blackKingRank, 'Winner', winnerIcon, 'winner', 'winner');
        } else {
            if (blackKingFile >= 0) this.board.showGameEndOverlay(blackKingFile, blackKingRank, reasonLabels[loserReason], reasonIcons[loserReason], loserReason === 'checkmate' ? 'checkmate-loser' : '', 'loser');
            if (whiteKingFile >= 0) this.board.showGameEndOverlay(whiteKingFile, whiteKingRank, 'Winner', winnerIcon, 'winner', 'winner');
        }
    }

    goToMove(index) {
        if (!this.parsedMoves) return;
        if (index < -1 || index >= this.parsedMoves.length) return;

        this.chess.reset();
        for (let i = 0; i <= index; i++) {
            this.chess.makeMove(this.parsedMoves[i].move);
        }
        this.currentMoveIndex = index;

        const lastMove = index >= 0 ? this.parsedMoves[index] : null;
        const lastMoveCoords = lastMove ? { from: lastMove.move.from, to: lastMove.move.to } : null;
        this.board.update(this.chess, lastMoveCoords);
        this.updateMoveHighlight();
        if (typeof evalBar !== 'undefined') evalBar.evaluate(this.chess.toFEN());
        this.updateGameEndOverlay();
    }

    updateMoveHighlight() {
        document.querySelectorAll('.move').forEach(el => {
            el.classList.toggle('current', parseInt(el.dataset.index) === this.currentMoveIndex);
        });
    }

    nextMove() {
        if (!this.parsedMoves || this.currentMoveIndex >= this.parsedMoves.length - 1) return;
        this.goToMove(this.currentMoveIndex + 1);
    }

    prevMove() {
        if (this.currentMoveIndex < 0) return;
        this.goToMove(this.currentMoveIndex - 1);
    }

    goToStart() {
        this.chess.reset();
        this.currentMoveIndex = -1;
        this.board.update(this.chess);
        this.updateMoveHighlight();
        if (typeof evalBar !== 'undefined') evalBar.evaluate(this.chess.toFEN());
        this.updateGameEndOverlay();
    }

    goToEnd() {
        if (!this.parsedMoves) return;
        this.goToMove(this.parsedMoves.length - 1);
    }

    flipBoard() {
        this.board.flip();
        document.querySelector('.eval-bar-container').classList.toggle('flipped');
        const lastMove = this.currentMoveIndex >= 0 && this.parsedMoves
            ? { from: this.parsedMoves[this.currentMoveIndex].move.from, to: this.parsedMoves[this.currentMoveIndex].move.to }
            : null;
        this.board.update(this.chess, lastMove);
        this.updateGameEndOverlay();
    }

    toggleAutoPlay() {
        const btn = document.getElementById('btn-auto');
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
            btn.classList.remove('active');
        } else {
            btn.classList.add('active');
            this.autoPlayInterval = setInterval(() => {
                if (!this.parsedMoves || this.currentMoveIndex >= this.parsedMoves.length - 1) {
                    this.toggleAutoPlay();
                    return;
                }
                this.nextMove();
            }, this.autoPlaySpeed);
        }
    }

    // --- Tournaments ---
    async loadTournaments() {
        try {
            const res = await fetch('/api/tournaments?t=' + Date.now());
            const tournaments = await res.json();
            this.renderTournaments(tournaments);
        } catch (e) {}
    }

    renderTournaments(tournaments) {
        const list = document.getElementById('tournament-list');
        if (!tournaments.length) {
            list.innerHTML = '<p class="empty-state">No tournaments found.</p>';
            return;
        }
        const statusColors = { active: '#22c55e', upcoming: '#f59e0b', completed: '#6b7280', cancelled: '#ef4444' };
        list.innerHTML = tournaments.map(t => `
            <div class="tournament-card" data-tournament-id="${t.id}" onclick="app.toggleTournament(${t.id})">
                <div class="tournament-card-header">
                    <span class="tournament-status" style="background:${statusColors[t.status] || '#6b7280'}">${(t.status || 'active').charAt(0).toUpperCase() + (t.status || 'active').slice(1)}</span>
                    <h3 class="tournament-name">${t.name}</h3>
                </div>
                <div class="tournament-card-meta">
                    ${t.location ? `<span class="tournament-meta-item">📍 ${t.location}</span>` : ''}
                    ${t.date_start ? `<span class="tournament-meta-item">📅 ${t.date_start}${t.date_end ? ' - ' + t.date_end : ''}</span>` : ''}
                    ${t.format ? `<span class="tournament-meta-item">⚙ ${t.format}</span>` : ''}
                    ${t.time_control ? `<span class="tournament-meta-item">⏱ ${t.time_control.charAt(0).toUpperCase() + t.time_control.slice(1)}</span>` : ''}
                </div>
                <div class="tournament-detail-panel" id="tournament-detail-${t.id}"></div>
            </div>
        `).join('');
    }

    async toggleTournament(id) {
        const panel = document.getElementById(`tournament-detail-${id}`);
        if (!panel) return;
        if (panel.classList.contains('open')) {
            panel.classList.remove('open');
            panel.innerHTML = '';
            return;
        }
        // Close any other open panels first
        document.querySelectorAll('.tournament-detail-panel.open').forEach(p => {
            p.classList.remove('open');
            p.innerHTML = '';
        });
        panel.innerHTML = '<div class="tournament-loading">Loading...</div>';
        panel.classList.add('open');
        panel.onclick = (e) => e.stopPropagation();
        try {
            const res = await fetch(`/api/tournaments/${id}?t=` + Date.now());
            const t = await res.json();
            this.renderTournamentParticipants(panel, t);
        } catch (e) {
            panel.innerHTML = '<div class="tournament-empty">Failed to load participants.</div>';
        }
    }

    renderTournamentParticipants(panel, t) {
        const tcLabel = t.time_control ? t.time_control.charAt(0).toUpperCase() + t.time_control.slice(1) : '';
        const isSwiss = (t.format || '').toLowerCase().includes('swiss');
        const roundLabel = t.current_round ? `Standings after Round ${t.current_round}` : '';
        const infoHtml = `
            <div class="tournament-standings-info">
                ${tcLabel ? `<span class="tournament-standings-tc">Time Control: ${tcLabel}</span>` : ''}
                ${roundLabel ? `<span class="tournament-standings-round">${roundLabel}</span>` : ''}
                <span class="tournament-standings-tabs">
                    <button class="tournament-tab-btn active" onclick="event.stopPropagation();app.showTournamentTab(${t.id}, 'standings', this)">Standings</button>
                    <button class="tournament-tab-btn" onclick="event.stopPropagation();app.showTournamentTab(${t.id}, 'pairings', this)">Pairings</button>
                </span>
            </div>`;
        if (!t.participants || !t.participants.length) {
            panel.innerHTML = `<div class="tournament-standings">${infoHtml}<div class="tournament-tab-content" data-tab="standings"><div class="tournament-empty">No players added yet.</div></div></div>`;
            this._currentTournament = t;
            return;
        }
        const rows = t.participants.map((p, i) => {
            const title = p.title ? `<span class="player-title-badge">${p.title}</span>` : '';
            const rating = p.rating || p.rating_rapid || p.rating_blitz || p.rating_classical || p.rating_bullet || 0;
            const photo = p.photo ? `<img src="${p.photo}" class="participant-photo" alt="">` : `<div class="participant-photo participant-photo-placeholder">${(p.name || '?')[0]}</div>`;
            return `
                <div class="tournament-player-row">
                    <span class="tp-rank">${i + 1}</span>
                    <span class="tp-info">${photo}<span class="tp-name">${title} ${p.name}</span></span>
                    <span class="tp-rating">${rating}</span>
                    <span class="tp-score">${p.score}</span>
                    ${isSwiss ? `<span class="tp-tb">${p.buc1}</span>` : ''}
                    <span class="tp-tb">${p.berger}</span>
                    <span class="tp-tb">${p.de}</span>
                    ${isSwiss ? `<span class="tp-tb">${p.wins}</span>` : ''}
                </div>`;
        }).join('');
        panel.innerHTML = `
            <div class="tournament-standings ${isSwiss ? 'swiss' : 'round-robin'}">
                ${infoHtml}
                <div class="tournament-tab-content" data-tab="standings">
                    <div class="tournament-standings-header">
                        <span class="tp-rank">#</span>
                        <span class="tp-info">Player</span>
                        <span class="tp-rating">Rating</span>
                        <span class="tp-score">Score</span>
                        ${isSwiss ? '<span class="tp-tb">Buc1</span>' : ''}
                        <span class="tp-tb">Ber</span>
                        <span class="tp-tb">DE</span>
                        ${isSwiss ? '<span class="tp-tb">Wins</span>' : ''}
                    </div>
                    ${rows}
                </div>
                <div class="tournament-tab-content" data-tab="pairings" style="display:none"></div>
            </div>`;
        this._currentTournament = t;
    }

    async showTournamentTab(tournamentId, tab, btn) {
        const panel = document.getElementById(`tournament-detail-${tournamentId}`);
        if (!panel) return;
        await this.checkAuth();
        panel.querySelectorAll('.tournament-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panel.querySelectorAll('.tournament-tab-content').forEach(c => c.style.display = 'none');
        const content = panel.querySelector(`.tournament-tab-content[data-tab="${tab}"]`);
        if (content) content.style.display = '';
        if (tab === 'pairings' && content) {
            await this.loadPairings(tournamentId, content);
        }
    }

    async loadPairings(tournamentId, container) {
        const t = this._currentTournament;
        const currentRound = t ? t.current_round || 1 : 1;
        const round = this._pairingRound || currentRound;
        await this.checkAuth();
        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/pairings?round=${round}&t=` + Date.now());
            const pairings = await res.json();
            this.renderPairings(container, tournamentId, pairings, t, round);
        } catch (e) {
            container.innerHTML = '<div class="tournament-empty">Failed to load pairings.</div>';
        }
    }

    renderPairings(container, tournamentId, pairings, t, round) {
        const currentRound = t ? t.current_round || 1 : 1;
        const isAdmin = this.isAdmin;
        let roundSelector = '<div class="pairing-round-selector">';
        for (let r = 1; r <= Math.max(currentRound, round); r++) {
            roundSelector += `<button class="pairing-round-btn ${r === round ? 'active' : ''}" onclick="app._pairingRound=${r};app.loadPairings(${tournamentId},this.closest('.tournament-tab-content').parentElement.querySelector('[data-tab=pairings]'))">R${r}</button>`;
        }
        roundSelector += '</div>';

        let pairingRows = '';
        if (pairings.length === 0) {
            pairingRows = '<div class="tournament-empty">No pairings for this round.</div>';
        } else {
            pairingRows = pairings.map(p => {
                const whiteName = p.white_name || 'Bye';
                const whiteTitle = p.white_title ? `<span class="player-title-badge">${p.white_title}</span>` : '';
                const blackName = p.black_name || 'Bye';
                const blackTitle = p.black_title ? `<span class="player-title-badge">${p.black_title}</span>` : '';
                const resultDisplay = p.result || '-';
                let adminActions = '';
                if (isAdmin) {
                    adminActions = `<span class="pairing-actions">
                        <button class="btn-icon" onclick="app.editPairing(${tournamentId},${p.id})" title="Edit">&#9998;</button>
                        <button class="btn-icon btn-icon-danger" onclick="app.deletePairing(${tournamentId},${p.id})" title="Delete">&times;</button>
                    </span>`;
                }
                return `<div class="pairing-row" data-pairing-id="${p.id}">
                    <span class="pairing-board">${p.board_number}</span>
                    <span class="pairing-white">${whiteTitle} ${whiteName}</span>
                    <span class="pairing-result">${resultDisplay}</span>
                    <span class="pairing-black">${blackTitle} ${blackName}</span>
                    ${adminActions}
                </div>`;
            }).join('');
        }

        let addForm = '';
        if (isAdmin) {
            addForm = this._buildPairingForm(tournamentId, round, t);
        }

        container.innerHTML = `
            ${roundSelector}
            <div class="pairing-list">
                <div class="pairing-list-header">
                    <span class="pairing-board">Bd</span>
                    <span class="pairing-white">White</span>
                    <span class="pairing-result">Res</span>
                    <span class="pairing-black">Black</span>
                    ${isAdmin ? '<span class="pairing-actions"></span>' : ''}
                </div>
                ${pairingRows}
            </div>
            ${addForm}
        `;
    }

    _buildPairingForm(tournamentId, round, t) {
        const players = t ? (t.participants || []).map(p => `<option value="${p.id}">${p.title ? p.title + ' ' : ''}${p.name}</option>`).join('') : '';
        const results = ['', '1-0', '0-1', '1/2-1/2', '*', 'Bye'].map(r => `<option value="${r}">${r || '-'}</option>`).join('');
        return `
            <div class="pairing-add-form" id="pairing-add-form-${tournamentId}">
                <h4>Add Pairing</h4>
                <div class="pairing-form-row">
                    <label>Board <input type="number" id="pairing-board-${tournamentId}" min="1" value="1" style="width:50px"></label>
                    <label>Round <input type="number" id="pairing-round-input-${tournamentId}" min="1" value="${round}" style="width:50px"></label>
                    <label>White <select id="pairing-white-${tournamentId}"><option value="">Bye</option>${players}</select></label>
                    <label>Black <select id="pairing-black-${tournamentId}"><option value="">Bye</option>${players}</select></label>
                    <label>Result <select id="pairing-result-${tournamentId}">${results}</select></label>
                    <button class="btn-primary-sm" onclick="app.savePairing(${tournamentId})">Add</button>
                </div>
            </div>
        `;
    }

    async savePairing(tournamentId, editId) {
        const data = {
            board_number: parseInt(document.getElementById(`pairing-board-${tournamentId}`).value) || 1,
            round_number: parseInt(document.getElementById(`pairing-round-input-${tournamentId}`).value) || 1,
            white_player_id: parseInt(document.getElementById(`pairing-white-${tournamentId}`).value) || null,
            black_player_id: parseInt(document.getElementById(`pairing-black-${tournamentId}`).value) || null,
            result: document.getElementById(`pairing-result-${tournamentId}`).value
        };
        try {
            if (editId) {
                await fetch(`/api/tournaments/${tournamentId}/pairings/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            } else {
                await fetch(`/api/tournaments/${tournamentId}/pairings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            }
            this._pairingRound = data.round_number;
            const container = document.querySelector(`#tournament-detail-${tournamentId} .tournament-tab-content[data-tab="pairings"]`);
            if (container) await this.loadPairings(tournamentId, container);
        } catch (e) {}
    }

    async editPairing(tournamentId, pairingId) {
        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/pairings?t=` + Date.now());
            const pairings = await res.json();
            const p = pairings.find(x => x.id === pairingId);
            if (!p) return;
            const container = document.querySelector(`#tournament-detail-${tournamentId} .tournament-tab-content[data-tab="pairings"]`);
            const form = document.getElementById(`pairing-add-form-${tournamentId}`);
            if (form) {
                document.getElementById(`pairing-board-${tournamentId}`).value = p.board_number || 1;
                document.getElementById(`pairing-round-input-${tournamentId}`).value = p.round_number || 1;
                document.getElementById(`pairing-white-${tournamentId}`).value = p.white_player_id || '';
                document.getElementById(`pairing-black-${tournamentId}`).value = p.black_player_id || '';
                document.getElementById(`pairing-result-${tournamentId}`).value = p.result || '';
                const btn = form.querySelector('.btn-primary-sm');
                if (btn) {
                    btn.textContent = 'Update';
                    btn.onclick = () => { this.savePairing(tournamentId, pairingId); btn.textContent = 'Add'; btn.onclick = () => this.savePairing(tournamentId); };
                }
            }
        } catch (e) {}
    }

    async deletePairing(tournamentId, pairingId) {
        if (!confirm('Delete this pairing?')) return;
        try {
            await fetch(`/api/tournaments/${tournamentId}/pairings/${pairingId}`, { method: 'DELETE' });
            const container = document.querySelector(`#tournament-detail-${tournamentId} .tournament-tab-content[data-tab="pairings"]`);
            if (container) await this.loadPairings(tournamentId, container);
        } catch (e) {}
    }

    async loadAdminTournaments() {
        try {
            const res = await fetch('/api/tournaments?t=' + Date.now());
            const tournaments = await res.json();
            this.renderAdminTournaments(tournaments);
        } catch (e) {}
    }

    renderAdminTournaments(tournaments) {
        const list = document.getElementById('admin-tournament-list');
        if (!tournaments.length) {
            list.innerHTML = '<p class="empty-state">No tournaments yet.</p>';
            return;
        }
        list.innerHTML = tournaments.map(t => `
            <div class="game-item">
                <button class="game-item-delete" onclick="app.deleteTournament(${t.id})">Delete</button>
                <button class="game-edit-btn" onclick="app.editTournament(${t.id})">Edit</button>
                <div class="game-item-players">${t.name}</div>
                <div class="game-item-event">${t.location || ''} ${t.date_start || ''} - ${t.date_end || ''} [${t.status}]${t.current_round ? ' Round ' + t.current_round : ''}</div>
            </div>
        `).join('');
    }

    async editTournament(id) {
        try {
            this._currentEditId = id;
            const res = await fetch(`/api/tournaments/${id}?t=` + Date.now());
            if (this._currentEditId !== id) return;
            const t = await res.json();
            document.getElementById('tournament-name').value = t.name || '';
            document.getElementById('tournament-location').value = t.location || '';
            document.getElementById('tournament-start').value = t.date_start || '';
            document.getElementById('tournament-end').value = t.date_end || '';
            document.getElementById('tournament-format').value = t.format || '';
            document.getElementById('tournament-time-control').value = t.time_control || '';
            document.getElementById('tournament-round').value = t.current_round || '';
            document.getElementById('tournament-status').value = t.status || 'active';
            document.getElementById('btn-save-tournament').dataset.editId = id;
            document.getElementById('btn-save-tournament').textContent = 'Update Tournament';
            document.getElementById('admin-tournament-participants').style.display = '';
            document.getElementById('admin-tournament-player-list').innerHTML = '<p class="empty-state">Loading...</p>';
            document.getElementById('tournament-player-select').innerHTML = '<option value="">Select a player...</option>';
            await this.loadTournamentParticipantDropdown(id);
            if (this._currentEditId !== id) return;
            await this.loadAdminTournamentPlayers(id);
        } catch (e) {}
    }

    async saveTournament() {
        const data = {
            name: document.getElementById('tournament-name').value,
            location: document.getElementById('tournament-location').value,
            date_start: document.getElementById('tournament-start').value,
            date_end: document.getElementById('tournament-end').value,
            format: document.getElementById('tournament-format').value,
            time_control: document.getElementById('tournament-time-control').value,
            current_round: parseInt(document.getElementById('tournament-round').value) || 0,
            status: document.getElementById('tournament-status').value
        };
        if (!data.name) return alert('Tournament name is required');
        const btn = document.getElementById('btn-save-tournament');
        const editId = btn.dataset.editId;
        try {
            if (editId) {
                await fetch(`/api/tournaments/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                delete btn.dataset.editId;
                btn.textContent = 'Save Tournament';
            } else {
                await fetch('/api/tournaments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            }
            ['tournament-name', 'tournament-location', 'tournament-start', 'tournament-end', 'tournament-format', 'tournament-time-control', 'tournament-round'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('tournament-status').value = 'active';
            document.getElementById('admin-tournament-participants').style.display = 'none';
            document.getElementById('admin-tournament-player-list').innerHTML = '';
            document.getElementById('tournament-player-select').innerHTML = '<option value="">Select a player...</option>';
            delete btn.dataset.editId;
            btn.textContent = 'Save Tournament';
            this._currentEditId = null;
            this.loadAdminTournaments();
        } catch (e) {}
    }

    async deleteTournament(id) {
        if (!confirm('Delete this tournament?')) return;
        try {
            await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
            document.getElementById('admin-tournament-participants').style.display = 'none';
            this.loadAdminTournaments();
        } catch (e) {}
    }

    async loadTournamentParticipantDropdown(tournamentId) {
        try {
            const [playersRes, tRes] = await Promise.all([
                fetch('/api/players'),
                fetch(`/api/tournaments/${tournamentId}?t=` + Date.now())
            ]);
            if (this._currentEditId !== tournamentId) return;
            const players = await playersRes.json();
            const t = await tRes.json();
            const existingIds = new Set((t.participants || []).map(p => p.id));
            const sel = document.getElementById('tournament-player-select');
            sel.innerHTML = '<option value="">Select a player...</option>' +
                players.filter(p => !existingIds.has(p.id)).map(p =>
                    `<option value="${p.id}">${p.title ? p.title + ' ' : ''}${p.name} (${p.rating || p.rating_rapid || p.rating_blitz || p.rating_classical || p.rating_bullet || 0})</option>`
                ).join('');
        } catch (e) {}
    }

    async loadAdminTournamentPlayers(tournamentId) {
        try {
            const res = await fetch(`/api/tournaments/${tournamentId}`);
            if (this._currentEditId !== tournamentId) return;
            const t = await res.json();
            const list = document.getElementById('admin-tournament-player-list');
            if (!t.participants || !t.participants.length) {
                list.innerHTML = '<p class="empty-state">No players in this tournament yet.</p>';
                return;
            }
            const isSwiss = (t.format || '').toLowerCase().includes('swiss');
            list.innerHTML = t.participants.map(p => {
                const rating = p.rating || p.rating_rapid || p.rating_blitz || p.rating_classical || p.rating_bullet || 0;
                const ms = p.manual_score !== null && p.manual_score !== undefined ? p.manual_score : '';
                const mb = p.manual_buc1 !== null && p.manual_buc1 !== undefined ? p.manual_buc1 : '';
                const mber = p.manual_berger !== null && p.manual_berger !== undefined ? p.manual_berger : '';
                const mde = p.manual_de !== null && p.manual_de !== undefined ? p.manual_de : '';
                return `
                    <div class="admin-player-row" data-player-id="${p.id}">
                        <span class="admin-player-name">${p.title ? `<span class="player-title-badge">${p.title}</span> ` : ''}${p.name}</span>
                        <span class="admin-player-rating">${rating}</span>
                        <div class="admin-player-fields">
                            <label>Score</label>
                            <input type="number" step="0.5" class="admin-tf-input" data-field="manual_score" value="${ms}" placeholder="${p.calc_score}">
                            ${isSwiss ? `<label>Buc1</label><input type="number" step="0.1" class="admin-tf-input" data-field="manual_buc1" value="${mb}" placeholder="${p.buc1}">` : ''}
                            <label>Ber</label>
                            <input type="number" step="0.1" class="admin-tf-input" data-field="manual_berger" value="${mber}" placeholder="${p.berger}">
                            <label>DE</label>
                            <input type="number" step="0.1" class="admin-tf-input" data-field="manual_de" value="${mde}" placeholder="${p.de}">
                        </div>
                        <button class="btn-primary-sm" onclick="app.saveTournamentPlayerScores(${tournamentId}, ${p.id})">Save</button>
                        <button class="btn-danger-sm" onclick="app.removeTournamentPlayer(${tournamentId}, ${p.id})">Remove</button>
                    </div>`;
            }).join('');
        } catch (e) {}
    }

    async addTournamentPlayer(tournamentId) {
        const sel = document.getElementById('tournament-player-select');
        const playerId = sel.value;
        if (!playerId) return;
        try {
            await fetch(`/api/tournaments/${tournamentId}/players`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: parseInt(playerId) })
            });
            this.loadTournamentParticipantDropdown(tournamentId);
            this.loadAdminTournamentPlayers(tournamentId);
        } catch (e) {}
    }

    async removeTournamentPlayer(tournamentId, playerId) {
        try {
            await fetch(`/api/tournaments/${tournamentId}/players/${playerId}`, { method: 'DELETE' });
            this.loadTournamentParticipantDropdown(tournamentId);
            this.loadAdminTournamentPlayers(tournamentId);
        } catch (e) {}
    }

    async saveTournamentPlayerScores(tournamentId, playerId) {
        const row = document.querySelector(`.admin-player-row[data-player-id="${playerId}"]`);
        if (!row) return;
        const data = {};
        row.querySelectorAll('.admin-tf-input').forEach(input => {
            data[input.dataset.field] = input.value;
        });
        try {
            await fetch(`/api/tournaments/${tournamentId}/players/${playerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            this.loadAdminTournamentPlayers(tournamentId);
        } catch (e) {}
    }

    // --- Players ---
    async loadPlayers(search = '') {
        try {
            const url = search ? `/api/players?search=${encodeURIComponent(search)}` : '/api/players';
            const res = await fetch(url);
            const players = await res.json();
            this.renderPlayerGrid(players);
        } catch (e) {}
    }

    renderPlayerGrid(players) {
        const grid = document.getElementById('player-grid');
        if (players.length === 0) {
            grid.innerHTML = '<p class="empty-state">No players found.</p>';
            return;
        }
        grid.innerHTML = players.map(p => `
            <div class="player-card" data-id="${p.id}">
                ${p.photo
                    ? `<img class="player-card-photo" src="${p.photo}" alt="${p.name}">`
                    : `<div class="player-card-photo placeholder">♔</div>`
                }
                <div class="player-card-name">${p.title ? `<span class="title-badge">${p.title}</span> ` : ''}${p.name}</div>
                <div class="player-card-meta">${p.country || ''} ${p.birth_year ? 'b. ' + p.birth_year : ''}</div>
                ${p.rating ? `<div class="player-card-rating">${p.rating}</div>` : ''}
            </div>
        `).join('');

        grid.querySelectorAll('.player-card').forEach(card => {
            card.addEventListener('click', () => this.showPlayerDetail(parseInt(card.dataset.id)));
        });
    }

    async showPlayerDetail(id) {
        try {
            const res = await fetch(`/api/players/${id}`);
            const data = await res.json();
            const modal = document.getElementById('player-modal');
            const detail = document.getElementById('player-detail');

            const totalRating = (data.rating || 0) + (data.rating_rapid || 0) + (data.rating_blitz || 0) +
                (data.rating_classical || 0) + (data.rating_bullet || 0) + (data.rating_chess960 || 0);

            let wins = 0, losses = 0, draws = 0;
            if (data.games) {
                for (const g of data.games) {
                    const isWhite = g.white_name === data.name;
                    if (g.result === '1-0') { isWhite ? wins++ : losses++; }
                    else if (g.result === '0-1') { isWhite ? losses++ : wins++; }
                    else if (g.result === '1/2-1/2') { draws++; }
                }
            }
            const totalGames = wins + losses + draws;

            let statsHtml = '';
            if (totalGames > 0) {
                const winPct = Math.round((wins / totalGames) * 100);
                statsHtml = `
                    <div class="player-stats-row">
                        <div class="player-stat-box">
                            <div class="player-stat-num stat-total">${totalGames}</div>
                            <div class="player-stat-lbl">Games</div>
                        </div>
                        <div class="player-stat-box">
                            <div class="player-stat-num stat-wins">${wins}</div>
                            <div class="player-stat-lbl">Wins</div>
                        </div>
                        <div class="player-stat-box">
                            <div class="player-stat-num stat-draws">${draws}</div>
                            <div class="player-stat-lbl">Draws</div>
                        </div>
                        <div class="player-stat-box">
                            <div class="player-stat-num stat-losses">${losses}</div>
                            <div class="player-stat-lbl">Losses</div>
                        </div>
                        <div class="player-stat-box">
                            <div class="player-stat-num stat-pct">${winPct}%</div>
                            <div class="player-stat-lbl">Win Rate</div>
                        </div>
                    </div>
                `;
            }

            let gamesHtml = '';
            if (data.games && data.games.length > 0) {
                const recentGames = data.games.slice(0, 20);
                const gameItems = recentGames.map(g => {
                    const isWhite = g.white_name === data.name;
                    const opponent = isWhite ? g.black_name : g.white_name;
                    let resultText, resultClass;
                    if (g.result === '1-0') {
                        resultText = isWhite ? 'Won' : 'Lost';
                        resultClass = isWhite ? 'result-win' : 'result-loss';
                    } else if (g.result === '0-1') {
                        resultText = isWhite ? 'Lost' : 'Won';
                        resultClass = isWhite ? 'result-loss' : 'result-win';
                    } else if (g.result === '1/2-1/2') {
                        resultText = 'Draw';
                        resultClass = 'result-draw';
                    } else {
                        resultText = g.result || '*';
                        resultClass = '';
                    }
                    const elo = isWhite ? g.white_elo : g.black_elo;
                    const color = isWhite ? 'w' : 'b';
                    return `
                            <div class="game-item player-game-item" data-id="${g.id}" onclick="app.loadGameById(${g.id}); document.getElementById('player-modal').style.display='none'; app.switchPage('archive');">
                                <span class="game-item-result ${resultClass}">${resultText}</span>
                                <div class="game-item-players">
                                    <span class="game-pieces">${color === 'w' ? '♔' : '♚'}</span>
                                    vs ${opponent} ${elo ? '(' + elo + ')' : ''}
                                </div>
                                <div class="game-item-event">${g.event_name || ''} ${this.formatDate(g.date)} ${g.eco ? '(' + g.eco + ')' : ''}</div>
                            </div>
                        `;
                }).join('');
                const needsScroll = recentGames.length > 5;
                gamesHtml = '<div class="player-detail-games"><h4>Recent Games (' + data.games.length + ' total)</h4>' +
                    `<div class="player-games-scroll"${needsScroll ? ' style="max-height:calc(5 * 70px);overflow-y:auto"' : ''}>` + gameItems + '</div></div>';
            }

            detail.innerHTML = `
                <div class="player-detail-header">
                    ${data.photo
                        ? `<img class="player-detail-photo" src="${data.photo}" alt="${data.name}">`
                        : `<div class="player-detail-photo placeholder" style="display:flex;align-items:center;justify-content:center;font-size:3rem;color:var(--text-secondary)">♔</div>`
                    }
                    <div class="player-detail-info">
                        <h3>${data.title ? `<span class="title-badge">${data.title}</span> ` : ''}${data.name}</h3>
                        <p>${data.country || 'Unknown country'} ${data.birth_year ? '&middot; Born ' + data.birth_year : ''}</p>
                        ${data.status ? `<span class="player-status-badge status-${data.status}">${data.status.charAt(0).toUpperCase() + data.status.slice(1).replace('-', ' ')}</span>` : ''}
                        ${data.role ? `<span class="player-role-badge role-${data.role}">${data.role.charAt(0).toUpperCase() + data.role.slice(1)}</span>` : ''}
                        ${totalRating > 0 ? `<p class="player-total-rating">Total Rating: ${totalRating}</p>` : ''}
                        <div class="player-ratings-grid">
                            ${data.rating_classical ? `<div class="player-rating-item"><span class="pr-label">Classical</span><span class="pr-value">${data.rating_classical}</span></div>` : ''}
                            ${data.rating_rapid ? `<div class="player-rating-item"><span class="pr-label">Rapid</span><span class="pr-value">${data.rating_rapid}</span></div>` : ''}
                            ${data.rating_blitz ? `<div class="player-rating-item"><span class="pr-label">Blitz</span><span class="pr-value">${data.rating_blitz}</span></div>` : ''}
                            ${data.rating_bullet ? `<div class="player-rating-item"><span class="pr-label">Bullet</span><span class="pr-value">${data.rating_bullet}</span></div>` : ''}
                            ${data.rating_chess960 ? `<div class="player-rating-item"><span class="pr-label">Chess960</span><span class="pr-value">${data.rating_chess960}</span></div>` : ''}
                            ${data.rating ? `<div class="player-rating-item"><span class="pr-label">Legacy</span><span class="pr-value">${data.rating}</span></div>` : ''}
                        </div>
                    </div>
                </div>
                ${statsHtml}
                ${gamesHtml}
            `;
            modal.style.display = 'flex';
        } catch (e) {}
    }

    // --- Stats ---
    async loadStats() {
        try {
            const res = await fetch('/api/stats');
            const stats = await res.json();
            this.renderStats(stats);
        } catch (e) {}
    }

    renderStats(stats) {
        const container = document.getElementById('stats-content');
        container.innerHTML = `
            <div class="stat-card">
                <h3>Overview</h3>
                <div class="stat-number">${stats.totalGames}</div>
                <div class="stat-label">Total Games</div>
                <div class="stat-number" style="margin-top:1rem">${stats.totalPlayers}</div>
                <div class="stat-label">Total Players</div>
            </div>
            <div class="stat-card">
                <h3>Most Played Time Controls</h3>
                <ul class="stat-list">
                    ${stats.topTimeControls.map(t => {
                        const label = t.time_control.charAt(0).toUpperCase() + t.time_control.slice(1);
                        return `<li><span>${label}</span><span class="count">${t.count}</span></li>`;
                    }).join('')}
                </ul>
            </div>
            <div class="stat-card">
                <h3>Most Openings Used</h3>
                <ul class="stat-list stat-list-collapsible">
                    ${stats.topOpenings.length > 0 ? stats.topOpenings.slice(0, 5).map(o => `<li><span>${o.eco}${o.opening ? ' - ' + o.opening : ''}</span><span class="count">${o.count}</span></li>`).join('') : '<li><span>No openings recorded</span></li>'}
                    ${stats.topOpenings.length > 5 ? stats.topOpenings.slice(5).map(o => `<li class="stat-list-hidden"><span>${o.eco}${o.opening ? ' - ' + o.opening : ''}</span><span class="count">${o.count}</span></li>`).join('') : ''}
                </ul>
                ${stats.topOpenings.length > 5 ? '<button class="stat-show-more" onclick="this.previousElementSibling.classList.toggle(\'expanded\'); this.textContent = this.textContent === \'Show more\' ? \'Show less\' : \'Show more\'">Show more</button>' : ''}
            </div>
            <div class="stat-card">
                <h3>Games by Year</h3>
                <ul class="stat-list">
                    ${stats.gamesPerYear.map(y => `<li><span>${y.year}</span><span class="count">${y.count}</span></li>`).join('')}
                </ul>
            </div>
            <div class="stat-card">
                <h3>Recent Games</h3>
                <ul class="stat-list stat-list-collapsible">
                    ${stats.recentGames.slice(0, 5).map(g => `<li><span>${g.white_name} vs ${g.black_name}</span><span class="count">${g.result || '*'}</span></li>`).join('')}
                    ${stats.recentGames.length > 5 ? stats.recentGames.slice(5).map(g => `<li class="stat-list-hidden"><span>${g.white_name} vs ${g.black_name}</span><span class="count">${g.result || '*'}</span></li>`).join('') : ''}
                </ul>
                ${stats.recentGames.length > 5 ? '<button class="stat-show-more" onclick="this.previousElementSibling.classList.toggle(\'expanded\'); this.textContent = this.textContent === \'Show more\' ? \'Show less\' : \'Show more\'">Show more</button>' : ''}
            </div>
        `;
    }

    // --- Leaderboard ---
    async loadLeaderboard() {
        try {
            const res = await fetch('/api/leaderboard');
            const players = await res.json();
            this.renderLeaderboard(players);
        } catch (e) {
            document.getElementById('leaderboard-content').innerHTML = '<p class="empty-state">Could not load leaderboard.</p>';
        }
    }

    renderLeaderboard(players) {
        const container = document.getElementById('leaderboard-content');
        if (players.length === 0) {
            container.innerHTML = '<p class="empty-state">No players with ratings yet.</p>';
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        container.innerHTML = `
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th class="lb-rank">#</th>
                        <th class="lb-player">Player</th>
                        <th class="lb-total">Total</th>
                        <th class="lb-rating">Classical</th>
                        <th class="lb-rating">Rapid</th>
                        <th class="lb-rating">Blitz</th>
                        <th class="lb-rating">Bullet</th>
                        <th class="lb-rating">Chess960</th>
                    </tr>
                </thead>
                <tbody>
                    ${players.map((p, i) => `
                        <tr class="lb-row ${i < 3 ? 'lb-top3' : ''}" data-id="${p.id}">
                            <td class="lb-rank">${i < 3 ? medals[i] : i + 1}</td>
                            <td class="lb-player">
                                <div class="lb-player-info">
                                    ${p.photo ? `<img class="lb-avatar" src="${p.photo}" alt="${p.name}">` : `<div class="lb-avatar lb-avatar-placeholder">♔</div>`}
                                    <div>
                                        <div class="lb-name">${p.title ? `<span class="title-badge">${p.title}</span> ` : ''}${p.name}</div>
                                        <div class="lb-meta">${p.country || ''} ${p.birth_year ? 'b. ' + p.birth_year : ''}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="lb-total">${p.total_rating || 0}</td>
                            <td class="lb-rating">${p.rating_classical || '-'}</td>
                            <td class="lb-rating">${p.rating_rapid || '-'}</td>
                            <td class="lb-rating">${p.rating_blitz || '-'}</td>
                            <td class="lb-rating">${p.rating_bullet || '-'}</td>
                            <td class="lb-rating">${p.rating_chess960 || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.querySelectorAll('.lb-row').forEach(row => {
            row.addEventListener('click', () => this.showPlayerDetail(parseInt(row.dataset.id)));
        });
    }

    // --- Admin: Upload PGN ---
    async uploadPGNFiles(files) {
        const status = document.getElementById('upload-status');
        const defaultTC = document.getElementById('pgn-default-tc')?.value || '';
        for (const file of files) {
            const formData = new FormData();
            formData.append('pgn', file);
            if (defaultTC) formData.append('time_control', defaultTC);
            try {
                const res = await fetch('/api/games/upload-pgn', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) {
                    status.innerHTML = `<span class="success">✓ Saved ${data.count} game(s) from ${file.name}</span>`;
                } else {
                    status.innerHTML = `<span class="error">✗ ${data.error}</span>`;
                }
            } catch (e) {
                status.innerHTML = `<span class="error">✗ Upload failed</span>`;
            }
        }
        this.loadGames();
    }

    async parsePGNText() {
        const text = document.getElementById('pgn-text-input').value;
        if (!text.trim()) return;
        const status = document.getElementById('upload-status');
        const defaultTC = document.getElementById('pgn-default-tc')?.value || '';

        try {
            const res = await fetch('/api/games/upload-pgn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pgn: text, time_control: defaultTC })
            });
            const data = await res.json();
            if (data.success) {
                status.innerHTML = `<span class="success">✓ Saved ${data.count} game(s)</span>`;
                document.getElementById('pgn-text-input').value = '';
                this.loadGames();
            } else {
                status.innerHTML = `<span class="error">✗ ${data.error}</span>`;
            }
        } catch (e) {
            status.innerHTML = `<span class="error">✗ Parse failed</span>`;
        }
    }

    // --- Admin: Players ---
    async savePlayer() {
        const form = document.getElementById('player-form');
        const formData = new FormData();
        formData.append('name', document.getElementById('player-name').value);
        formData.append('title', document.getElementById('player-title').value);
        formData.append('rating', document.getElementById('player-rating').value);
        formData.append('rating_rapid', document.getElementById('player-rating-rapid').value);
        formData.append('rating_blitz', document.getElementById('player-rating-blitz').value);
        formData.append('rating_classical', document.getElementById('player-rating-classical').value);
        formData.append('rating_bullet', document.getElementById('player-rating-bullet').value);
        formData.append('rating_chess960', document.getElementById('player-rating-chess960').value);
        formData.append('country', document.getElementById('player-country').value);
        formData.append('birth_year', document.getElementById('player-birth').value);
        formData.append('status', document.getElementById('player-status').value);
        formData.append('role', document.getElementById('player-role').value);

        const photo = document.getElementById('player-photo').files[0];
        if (photo) formData.append('photo', photo);

        try {
            const res = await fetch('/api/players', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.id) {
                form.reset();
                document.getElementById('photo-preview').innerHTML = '';
                alert('Player saved: ' + data.name);
            }
        } catch (e) {
            alert('Failed to save player');
        }
    }

    // --- Admin: Manage Players ---

    async loadAdminPlayers(search = '') {
        try {
            const status = this.currentPlayerStatus || 'active';
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            params.set('status', status);
            const url = `/api/players?${params.toString()}`;
            const res = await fetch(url);
            const players = await res.json();
            this.renderAdminPlayers(players);
        } catch (e) {}
    }

    renderAdminPlayers(players) {
        const list = document.getElementById('admin-player-list');
        if (!list) return;
        if (players.length === 0) {
            list.innerHTML = '<p class="empty-state">No players found.</p>';
            return;
        }
        const statusLabels = { active: 'Active', inactive: 'Inactive', banned: 'Banned', 'non-member': 'Non-Member' };
        list.innerHTML = players.map(p => {
            const ratings = [];
            if (p.rating) ratings.push('C:' + p.rating);
            if (p.rating_rapid) ratings.push('R:' + p.rating_rapid);
            if (p.rating_blitz) ratings.push('B:' + p.rating_blitz);
            if (p.rating_bullet) ratings.push('Bu:' + p.rating_bullet);
            if (p.rating_chess960) ratings.push('960:' + p.rating_chess960);
            return `
                <div class="game-item admin-player-item" data-id="${p.id}">
                    <div class="admin-player-actions">
                        <button class="admin-btn-edit" data-id="${p.id}">Edit</button>
                        <button class="admin-btn-delete" data-id="${p.id}">Delete</button>
                    </div>
                    <div class="game-item-players">${p.title ? `<span class="title-badge">${p.title}</span> ` : ''}${p.name}${p.role ? ` <span class="player-role-badge role-${p.role}">${p.role.charAt(0).toUpperCase() + p.role.slice(1)}</span>` : ''}</div>
                    <div class="game-item-event">${p.country || ''} ${p.birth_year ? 'b. ' + p.birth_year : ''}</div>
                    ${ratings.length ? `<div class="admin-player-ratings">${ratings.join(' · ')}</div>` : ''}
                </div>
            `;
        }).join('');

        list.querySelectorAll('.admin-btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editPlayer(parseInt(btn.dataset.id));
            });
        });

        list.querySelectorAll('.admin-btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Delete this player?')) {
                    await fetch(`/api/players/${btn.dataset.id}`, { method: 'DELETE' });
                    this.loadAdminPlayers(document.getElementById('admin-player-search')?.value || '');
                }
            });
        });
    }

    async editPlayer(id) {
        try {
            const res = await fetch(`/api/players/${id}`);
            const data = await res.json();
            document.getElementById('edit-player-id').value = data.id;
            document.getElementById('edit-player-name').value = data.name || '';
            document.getElementById('edit-player-title').value = data.title || '';
            document.getElementById('edit-player-country').value = data.country || '';
            document.getElementById('edit-player-birth').value = data.birth_year || '';
            document.getElementById('edit-player-status').value = data.status || 'active';
            document.getElementById('edit-player-role').value = data.role || '';
            document.getElementById('edit-rating').value = data.rating || '';
            document.getElementById('edit-rating-rapid').value = data.rating_rapid || '';
            document.getElementById('edit-rating-blitz').value = data.rating_blitz || '';
            document.getElementById('edit-rating-classical').value = data.rating_classical || '';
            document.getElementById('edit-rating-bullet').value = data.rating_bullet || '';
            document.getElementById('edit-rating-chess960').value = data.rating_chess960 || '';
            document.getElementById('edit-player-modal').style.display = 'flex';
        } catch (e) {
            alert('Failed to load player');
        }
    }

    async saveEditPlayer() {
        const id = document.getElementById('edit-player-id').value;
        const formData = new FormData();
        formData.append('name', document.getElementById('edit-player-name').value);
        formData.append('title', document.getElementById('edit-player-title').value);
        formData.append('country', document.getElementById('edit-player-country').value);
        formData.append('birth_year', document.getElementById('edit-player-birth').value);
        formData.append('status', document.getElementById('edit-player-status').value);
        formData.append('role', document.getElementById('edit-player-role').value);
        formData.append('rating', document.getElementById('edit-rating').value);
        formData.append('rating_rapid', document.getElementById('edit-rating-rapid').value);
        formData.append('rating_blitz', document.getElementById('edit-rating-blitz').value);
        formData.append('rating_classical', document.getElementById('edit-rating-classical').value);
        formData.append('rating_bullet', document.getElementById('edit-rating-bullet').value);
        formData.append('rating_chess960', document.getElementById('edit-rating-chess960').value);

        const photo = document.getElementById('edit-player-photo').files[0];
        if (photo) formData.append('photo', photo);

        try {
            const res = await fetch(`/api/players/${id}`, { method: 'PUT', body: formData });
            const data = await res.json();
            if (data.success) {
                document.getElementById('edit-player-modal').style.display = 'none';
                this.loadAdminPlayers(document.getElementById('admin-player-search')?.value || '');
            }
        } catch (e) {
            alert('Failed to save player');
        }
    }

    // --- Admin: Manage Games ---
    async openEditGameModal(id) {
        try {
            const res = await fetch(`/api/games/${id}`);
            const game = await res.json();
            document.getElementById('edit-game-id').value = game.id;
            document.getElementById('edit-game-white-name').value = game.white_name || '';
            document.getElementById('edit-game-black-name').value = game.black_name || '';
            document.getElementById('edit-game-white-elo').value = game.white_elo || '';
            document.getElementById('edit-game-black-elo').value = game.black_elo || '';
            document.getElementById('edit-game-time-control').value = game.time_control || '';
            document.getElementById('edit-game-result').value = game.result || '*';
            document.getElementById('edit-game-date').value = game.date || '';
            document.getElementById('edit-game-event').value = game.event_name || '';
            document.getElementById('edit-game-eco').value = game.eco || '';
            document.getElementById('edit-game-opening').value = game.opening || '';
            document.getElementById('edit-game-modal').style.display = 'flex';
        } catch (e) {
            alert('Failed to load game');
        }
    }

    async saveEditGame() {
        const id = document.getElementById('edit-game-id').value;
        const whiteElo = document.getElementById('edit-game-white-elo').value;
        const blackElo = document.getElementById('edit-game-black-elo').value;
        const body = {
            white_name: document.getElementById('edit-game-white-name').value,
            black_name: document.getElementById('edit-game-black-name').value,
            white_elo: whiteElo !== '' ? parseInt(whiteElo) : null,
            black_elo: blackElo !== '' ? parseInt(blackElo) : null,
            time_control: document.getElementById('edit-game-time-control').value,
            result: document.getElementById('edit-game-result').value,
            date: document.getElementById('edit-game-date').value,
            event_name: document.getElementById('edit-game-event').value,
            eco: document.getElementById('edit-game-eco').value,
            opening: document.getElementById('edit-game-opening').value
        };
        try {
            const res = await fetch(`/api/games/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Server error' }));
                alert('Failed to save game: ' + (err.error || res.statusText));
                return;
            }
            const data = await res.json();
            if (data.success) {
                document.getElementById('edit-game-modal').style.display = 'none';
                this.loadGames();
                if (this.currentGameId == id) this.loadGameById(parseInt(id));
            } else {
                alert('Failed to save game: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Failed to save game: ' + e.message);
        }
    }

    async loadAdminGames() {
        try {
            const res = await fetch('/api/games?limit=100');
            const data = await res.json();
            const list = document.getElementById('admin-game-list');
            if (data.games.length === 0) {
                list.innerHTML = '<p class="empty-state">No games to manage.</p>';
                return;
            }
            list.innerHTML = data.games.map(g => `
                <div class="game-item" data-id="${g.id}">
                    <button class="game-item-delete" data-id="${g.id}">Delete</button>
                    <button class="game-edit-btn" onclick="event.stopPropagation(); app.openEditGameModal(${g.id})" title="Edit game">✎</button>
                    <div class="game-item-players">${g.white_name} vs ${g.black_name}</div>
                    <div class="game-item-event">${g.event_name || ''} ${this.formatDate(g.date)}</div>
                </div>
            `).join('');

            list.querySelectorAll('.game-item-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('Delete this game?')) {
                        await fetch(`/api/games/${btn.dataset.id}`, { method: 'DELETE' });
                        this.loadAdminGames();
                        this.loadGames();
                    }
                });
            });
        } catch (e) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChessApp();
});
