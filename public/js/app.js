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

        this.initEventListeners();
        this.checkAuth();
        this.loadGames();
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
        document.getElementById('filter-eco').addEventListener('change', () => this.loadGames());
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
    }

    // --- Games ---
    async loadGames(page = 1) {
        const search = document.getElementById('search-input').value;
        const eco = document.getElementById('filter-eco').value;
        const year = document.getElementById('filter-year').value;

        const params = new URLSearchParams({ page, limit: 20 });
        if (search) params.set('search', search);
        if (eco) params.set('eco', eco);
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
        list.innerHTML = this.games.map(g => `
            <div class="game-item" data-id="${g.id}">
                <span class="game-item-result">${g.result || '*'}</span>
                <div class="game-item-players">${g.white_name} vs ${g.black_name}</div>
                <div class="game-item-event">${g.event_name || ''} ${g.date || ''} ${g.eco ? '(' + g.eco + ')' : ''}</div>
            </div>
        `).join('');

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

            const ecoSelect = document.getElementById('filter-eco');
            const currentEco = ecoSelect.value;
            ecoSelect.innerHTML = '<option value="">All Openings</option>' +
                openings.map(o => `<option value="${o.eco}" ${o.eco === currentEco ? 'selected' : ''}>${o.eco} - ${o.opening || o.eco} (${o.count})</option>`).join('');

            const years = [...new Set(events.map(e => e.date?.substring(0, 4)).filter(Boolean))].sort().reverse();
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

        const blackTitle = game.black_title ? `<span class="title-badge">${game.black_title}</span> ` : '';
        const whiteTitle = game.white_title ? `<span class="title-badge">${game.white_title}</span> ` : '';
        document.getElementById('player-top').querySelector('.player-name').innerHTML = blackTitle + game.black_name;
        document.getElementById('player-top').querySelector('.player-rating').textContent = game.black_elo || '';
        document.getElementById('player-bottom').querySelector('.player-name').innerHTML = whiteTitle + game.white_name;
        document.getElementById('player-bottom').querySelector('.player-rating').textContent = game.white_elo || '';

        document.getElementById('info-event').textContent = game.event_name || '-';
        document.getElementById('info-date').textContent = game.date || '-';
        document.getElementById('info-result').textContent = game.result || '-';
        document.getElementById('info-eco').textContent = (game.eco || '-') + (game.opening ? ' - ' + game.opening : '');

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
        this.highlightGameInList(game.id);
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
    }

    goToEnd() {
        if (!this.parsedMoves) return;
        this.goToMove(this.parsedMoves.length - 1);
    }

    flipBoard() {
        this.board.flip();
        const lastMove = this.currentMoveIndex >= 0 && this.parsedMoves
            ? { from: this.parsedMoves[this.currentMoveIndex].move.from, to: this.parsedMoves[this.currentMoveIndex].move.to }
            : null;
        this.board.update(this.chess, lastMove);
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
                gamesHtml = '<div class="player-detail-games"><h4>Recent Games (' + data.games.length + ' total)</h4>' +
                    recentGames.map(g => {
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
                                <div class="game-item-event">${g.event_name || ''} ${g.date || ''} ${g.eco ? '(' + g.eco + ')' : ''}</div>
                            </div>
                        `;
                    }).join('') + '</div>';
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
                        ${data.status ? `<p class="player-status-badge status-${data.status}">${data.status.charAt(0).toUpperCase() + data.status.slice(1).replace('-', ' ')}</p>` : ''}
                        ${totalRating > 0 ? `<p class="player-total-rating">Total Rating: ${totalRating}</p>` : ''}
                        <div class="player-ratings-grid">
                            ${data.rating ? `<div class="player-rating-item"><span class="pr-label">Classical</span><span class="pr-value">${data.rating}</span></div>` : ''}
                            ${data.rating_rapid ? `<div class="player-rating-item"><span class="pr-label">Rapid</span><span class="pr-value">${data.rating_rapid}</span></div>` : ''}
                            ${data.rating_blitz ? `<div class="player-rating-item"><span class="pr-label">Blitz</span><span class="pr-value">${data.rating_blitz}</span></div>` : ''}
                            ${data.rating_bullet ? `<div class="player-rating-item"><span class="pr-label">Bullet</span><span class="pr-value">${data.rating_bullet}</span></div>` : ''}
                            ${data.rating_chess960 ? `<div class="player-rating-item"><span class="pr-label">Chess960</span><span class="pr-value">${data.rating_chess960}</span></div>` : ''}
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
                <h3>Most Popular Openings</h3>
                <ul class="stat-list">
                    ${stats.topOpenings.map(o => `<li><span>${o.eco} - ${o.opening || o.eco}</span><span class="count">${o.count}</span></li>`).join('')}
                </ul>
            </div>
            <div class="stat-card">
                <h3>Games by Year</h3>
                <ul class="stat-list">
                    ${stats.gamesPerYear.map(y => `<li><span>${y.year}</span><span class="count">${y.count}</span></li>`).join('')}
                </ul>
            </div>
            <div class="stat-card">
                <h3>Recent Games</h3>
                <ul class="stat-list">
                    ${stats.recentGames.map(g => `<li><span>${g.white_name} vs ${g.black_name}</span><span class="count">${g.result || '*'}</span></li>`).join('')}
                </ul>
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
        for (const file of files) {
            const formData = new FormData();
            formData.append('pgn', file);
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

        try {
            const res = await fetch('/api/games/upload-pgn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pgn: text })
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
                    <div class="game-item-players">${p.title ? `<span class="title-badge">${p.title}</span> ` : ''}${p.name}</div>
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
                    <div class="game-item-players">${g.white_name} vs ${g.black_name}</div>
                    <div class="game-item-event">${g.event_name || ''} ${g.date || ''}</div>
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
