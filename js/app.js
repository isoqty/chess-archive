class ChessApp {
    constructor() {
        this.chess = new Chess();
        this.board = new ChessBoard('chessboard');
        this.games = [];
        this.currentGameIndex = -1;
        this.currentMoveIndex = -1;
        this.autoPlayInterval = null;
        this.autoPlaySpeed = 1000;

        this.initEventListeners();
        this.loadFromStorage();
    }

    initEventListeners() {
        document.getElementById('btn-start').addEventListener('click', () => this.goToStart());
        document.getElementById('btn-prev').addEventListener('click', () => this.prevMove());
        document.getElementById('btn-next').addEventListener('click', () => this.nextMove());
        document.getElementById('btn-end').addEventListener('click', () => this.goToEnd());
        document.getElementById('btn-flip').addEventListener('click', () => this.flipBoard());
        document.getElementById('btn-auto').addEventListener('click', () => this.toggleAutoPlay());

        document.getElementById('btn-load-sample').addEventListener('click', () => this.loadSampleGames());
        document.getElementById('btn-parse-pgn').addEventListener('click', () => this.parsePGNText());

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => this.switchPage(e.target.dataset.page));
        });

        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        document.getElementById('search-input').addEventListener('input', (e) => this.searchGames(e.target.value));

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft') this.prevMove();
            if (e.key === 'ArrowRight') this.nextMove();
            if (e.key === 'Home') this.goToStart();
            if (e.key === 'End') this.goToEnd();
        });
    }

    switchPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');
        document.querySelector(`[data-page="${page}"]`).classList.add('active');
    }

    handleFiles(files) {
        const status = document.getElementById('upload-status');
        let totalGames = 0;

        for (const file of files) {
            if (!file.name.endsWith('.pgn')) {
                status.innerHTML = '<span class="error">Only .pgn files are supported</span>';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const games = PGNParser.parse(e.target.result);
                this.addGames(games);
                totalGames += games.length;
                status.innerHTML = `<span class="success">Loaded ${totalGames} game(s) from ${files.length} file(s)</span>`;
                this.saveToStorage();
            };
            reader.readAsText(file);
        }
    }

    parsePGNText() {
        const text = document.getElementById('pgn-text').value;
        if (!text.trim()) return;

        const games = PGNParser.parse(text);
        if (games.length > 0) {
            this.addGames(games);
            this.switchPage('archive');
            this.saveToStorage();
        }
    }

    addGames(games) {
        this.games.push(...games);
        this.renderGameList();
    }

    renderGameList() {
        const list = document.getElementById('game-list');
        if (this.games.length === 0) {
            list.innerHTML = '<p class="empty-state">No games loaded. Upload PGN files or load sample games.</p>';
            return;
        }

        list.innerHTML = this.games.map((game, i) => `
            <div class="game-item ${i === this.currentGameIndex ? 'active' : ''}" data-index="${i}">
                <span class="game-item-result">${game.result}</span>
                <div class="game-item-players">${game.headers.White} vs ${game.headers.Black}</div>
                <div class="game-item-event">${game.headers.Event} ${game.headers.Date}</div>
            </div>
        `).join('');

        list.querySelectorAll('.game-item').forEach(item => {
            item.addEventListener('click', () => this.loadGame(parseInt(item.dataset.index)));
        });
    }

    loadGame(index) {
        this.stopAutoPlay();
        this.currentGameIndex = index;
        this.currentMoveIndex = -1;
        this.chess.reset();

        const game = this.games[index];
        document.getElementById('player-top').querySelector('.player-name').textContent = game.headers.Black;
        document.getElementById('player-top').querySelector('.player-rating').textContent = '';
        document.getElementById('player-bottom').querySelector('.player-name').textContent = game.headers.White;
        document.getElementById('player-bottom').querySelector('.player-rating').textContent = '';

        document.getElementById('info-event').textContent = game.headers.Event;
        document.getElementById('info-date').textContent = game.headers.Date;
        document.getElementById('info-result').textContent = game.result;
        document.getElementById('info-eco').textContent = game.headers.ECO;

        this.board.update(this.chess);
        this.renderMoveList();
        this.renderGameList();
    }

    renderMoveList() {
        const game = this.games[this.currentGameIndex];
        if (!game) return;

        let html = '<div class="move-list-container"><div class="move-list">';
        for (let i = 0; i < game.moves.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = game.moves[i];
            const blackMove = game.moves[i + 1];

            html += `<span class="move-number">${moveNum}.</span>`;
            html += `<span class="move ${i === this.currentMoveIndex ? 'current' : ''}" data-index="${i}">${whiteMove.san}</span>`;
            if (blackMove) {
                html += `<span class="move ${i + 1 === this.currentMoveIndex ? 'current' : ''}" data-index="${i + 1}">${blackMove.san}</span>`;
            } else {
                html += '<span></span>';
            }
        }
        html += '</div></div>';

        const container = document.querySelector('.game-info');
        const existing = container.querySelector('.move-list-container');
        if (existing) existing.remove();
        container.insertAdjacentHTML('afterend', html);

        document.querySelectorAll('.move').forEach(el => {
            el.addEventListener('click', () => this.goToMove(parseInt(el.dataset.index)));
        });
    }

    goToMove(index) {
        const game = this.games[this.currentGameIndex];
        if (!game) return;

        this.chess.reset();
        for (let i = 0; i <= index; i++) {
            this.chess.makeMove(game.moves[i].move);
        }
        this.currentMoveIndex = index;

        const lastMove = game.moves[index];
        this.board.update(this.chess, lastMove);
        this.updateMoveHighlight();
    }

    updateMoveHighlight() {
        document.querySelectorAll('.move').forEach(el => {
            el.classList.toggle('current', parseInt(el.dataset.index) === this.currentMoveIndex);
        });
    }

    nextMove() {
        const game = this.games[this.currentGameIndex];
        if (!game || this.currentMoveIndex >= game.moves.length - 1) return;
        this.goToMove(this.currentMoveIndex + 1);
    }

    prevMove() {
        if (this.currentMoveIndex < 0) return;
        if (this.currentMoveIndex === 0) {
            this.chess.reset();
            this.currentMoveIndex = -1;
            this.board.update(this.chess);
            this.updateMoveHighlight();
            return;
        }
        this.goToMove(this.currentMoveIndex - 1);
    }

    goToStart() {
        this.chess.reset();
        this.currentMoveIndex = -1;
        this.board.update(this.chess);
        this.updateMoveHighlight();
    }

    goToEnd() {
        const game = this.games[this.currentGameIndex];
        if (!game) return;
        this.goToMove(game.moves.length - 1);
    }

    flipBoard() {
        this.board.flip();
        const game = this.games[this.currentGameIndex];
        const lastMove = this.currentMoveIndex >= 0 ? game?.moves[this.currentMoveIndex] : null;
        this.board.update(this.chess, lastMove);
    }

    toggleAutoPlay() {
        const btn = document.getElementById('btn-auto');
        if (this.autoPlayInterval) {
            this.stopAutoPlay();
        } else {
            btn.classList.add('active');
            this.autoPlayInterval = setInterval(() => {
                const game = this.games[this.currentGameIndex];
                if (!game || this.currentMoveIndex >= game.moves.length - 1) {
                    this.stopAutoPlay();
                    return;
                }
                this.nextMove();
            }, this.autoPlaySpeed);
        }
    }

    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
            document.getElementById('btn-auto').classList.remove('active');
        }
    }

    searchGames(query) {
        const items = document.querySelectorAll('.game-item');
        const q = query.toLowerCase();
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(q) ? '' : 'none';
        });
    }

    saveToStorage() {
        try {
            const data = this.games.map(g => ({
                headers: g.headers,
                moves: g.moves.map(m => m.san),
                result: g.result
            }));
            localStorage.setItem('chessArchive', JSON.stringify(data));
        } catch (e) {
            console.warn('Storage not available');
        }
    }

    loadFromStorage() {
        try {
            const data = localStorage.getItem('chessArchive');
            if (!data) return;

            const stored = JSON.parse(data);
            for (const game of stored) {
                const pgn = this.headersToPGN(game.headers) + '\n\n' + this.movesToText(game.moves, game.result);
                const parsed = PGNParser.parse(pgn);
                if (parsed.length > 0) {
                    this.games.push(parsed[0]);
                }
            }
            this.renderGameList();
        } catch (e) {
            console.warn('Could not load from storage');
        }
    }

    headersToPGN(headers) {
        return Object.entries(headers)
            .map(([key, val]) => `[${key} "${val}"]`)
            .join('\n');
    }

    movesToText(moves, result) {
        let text = '';
        for (let i = 0; i < moves.length; i += 2) {
            const num = Math.floor(i / 2) + 1;
            text += `${num}. ${moves[i]}`;
            if (moves[i + 1]) text += ` ${moves[i + 1]}`;
            text += ' ';
        }
        text += result;
        return text;
    }

    loadSampleGames() {
        const samplePGN = `[Event "World Chess Championship 2023"]
[Site "Astana, Kazakhstan"]
[Date "2023.04.09"]
[Round "12"]
[White "Ding, Liren"]
[Black "Nepomniachtchi, Ian"]
[Result "1-0"]
[ECO "E04"]

1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 dxc4 5. e4 Bb4 6. Bg5 c5 7. dxc5 Qa5 8. Nd2 Bxc3 9. bxc3 Qxc5 10. Qg4 O-O 11. Qxg7 Re8 12. Ng4 Nd5 13. Qh8+ Kf8 14. Bf4 e5 15. Bg5 Be6 16. Nxe5 Qxe5 17. d3 cxd3 18. Bxd3 Nd7 19. O-O Rc8 20. a4 Qe7 21. a5 a6 22. h4 h6 23. Bd2 Nf4 24. Bxf4 Qxf4 25. Rfe1 Nb6 26. Re3 Rc5 27. Rae1 Rxc3 28. Rxc3 Qxe4 29. Bxe4 d1=Q 30. Rxd1 Nxa4 31. Rd8+ Ke7 32. Re1+ Kd6 33. Rd4 Nxc3 34. Bd3 b5 35. Rg4 a5 36. Rxg7 b4 37. Rg6+ Kd5 38. Bf5 Kc4 39. Bc2 Nb5 40. Rf6 Nd4 41. Bb1+ Kb3 42. Rf3 Kc2 43. Be4+ Kb2 44. Rf2+ Ka1 45. Bf5 Nc2 46. Rf1 Nd4 47. Bc8 Nf5 48. Bxf5 a4 49. Be4 b3 50. Bxb1 a3 51. Bc2 b2+ 52. Kd2 a2 53. Ke2 1-0

[Event "Classic Game"]
[Site "Chess Archive"]
[Date "2024.01.15"]
[White "Stockfish"]
[Black "AlphaZero"]
[Result "0-1"]
[ECO "B90"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Nh5 14. Kb1 a5 15. Ng3 Nxg3 16. hxg3 a4 17. Nc1 Nb6 18. Bd3 d5 19. exd5 Nxd5 20. Bg5 f6 21. gxf6 Bxf6 22. Bxf6 Rxf6 23. Bc4 Kh8 24. Bxd5 Bxd5 25. Rh5 Be6 26. Rdh1 Rf7 27. Rh8+ Kg8 28. R1h7 Rf8 29. Rxf8+ Kxf8 30. Rh8+ Ke7 31. Qh6 Qb6 32. Qh4+ Kd7 33. Rh7 Re8 34. Qf6 Qc7 35. Qxe5 Qc6 36. Qf4 Re1+ 37. Ka1 Qc4 38. Rh4 Qd5 39. Qg4+ Kc7 40. Qf4+ Kb7 41. Rh7 Qd1+ 42. Ka2 Qd5+ 43. Ka1 a3 44. Rxb7+ Kxb7 45. Qe4+ Qxe4 46. fxe4 a2 47. e5 Re2 48. Nd3 Rxc2 0-1

[Event "Rapid Chess"]
[Site "Chess Archive"]
[Date "2024.03.20"]
[White "Magnus Carlsen"]
[Black "Hikaru Nakamura"]
[Result "1/2-1/2"]
[ECO "C67"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 9. h3 Ke8 10. Nc3 h5 11. Bg5 Be6 12. Rd1 Be7 13. Bxe7 Kxe7 14. Rd2 Rad8 15. Rad1 Rxd2 16. Rxd2 Rd8 17. Rxd8 Kxd8 18. g4 Nh6 19. Nxh6 gxh6 20. Ne4 b6 21. Kf1 Ke7 22. Ke2 c5 23. Kd3 a5 24. Kc4 Kd7 25. Kb5 Kc7 26. Kc4 Kd7 27. Kb5 Kc7 1/2-1/2
`;
        const games = PGNParser.parse(samplePGN);
        this.addGames(games);
        this.saveToStorage();
        if (games.length > 0) {
            this.loadGame(0);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChessApp();
});
