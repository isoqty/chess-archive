class EvalBar {
    constructor() {
        this.worker = null;
        this.ready = false;
        this.pendingFen = null;
        this.searching = false;
        this.currentFen = null;
        this.lines = ['', '', ''];
        this.scores = [0, 0, 0];
        this.mateScores = [0, 0, 0];
        this.watchdog = null;
        this.enginePath = '/js/stockfish-18-lite-single.js';
        this.init();
    }

    init() {
        const warmup = new Worker(this.enginePath);
        warmup.onmessage = (e) => {
            if (e.data === 'uciok') {
                try { warmup.terminate(); } catch (e) {}
                this.createMainWorker();
            }
        };
        warmup.onerror = () => {
            try { warmup.terminate(); } catch (e) {}
            setTimeout(() => this.init(), 2000);
        };
        warmup.postMessage('uci');
    }

    createMainWorker() {
        this.worker = new Worker(this.enginePath);
        this.worker.onmessage = (e) => {
            try { this.handleMessage(e.data); } catch (err) {
                console.error('[EvalBar] Handler error:', err);
            }
        };
        this.worker.onerror = () => {
            this.ready = false;
            this.searching = false;
            this.clearWatchdog();
            setTimeout(() => this.init(), 500);
        };
        this.worker.postMessage('uci');
    }

    killWorker() {
        this.clearWatchdog();
        this.ready = false;
        this.searching = false;
        try { this.worker.terminate(); } catch (e) {}
        this.worker = null;
    }

    handleMessage(msg) {
        if (typeof msg !== 'string') return;

        if (msg === 'uciok') {
            this.ready = true;
            this.worker.postMessage('setoption name MultiPV value 3');
            this.worker.postMessage('isready');
            return;
        }

        if (msg === 'readyok') {
            if (this.pendingFen) {
                const fen = this.pendingFen;
                this.pendingFen = null;
                this.run(fen);
            }
            return;
        }

        if (msg.startsWith('bestmove')) {
            this.clearWatchdog();
            this.searching = false;
            if (this.pendingFen) {
                const fen = this.pendingFen;
                this.pendingFen = null;
                this.run(fen);
            }
            return;
        }

        if (!msg.startsWith('info')) return;
        if (msg.includes('info string')) return;

        const pvMovesMatch = msg.match(/ pv ((?:[a-h][1-8][a-h][1-8][qrbn]? ?)+)/);
        if (!pvMovesMatch) return;

        const depthMatch = msg.match(/depth (\d+)/);
        const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
        if (depth < 1) return;

        const pvMatch = msg.match(/multipv (\d+)/);
        const pvIndex = pvMatch ? parseInt(pvMatch[1]) - 1 : 0;
        if (pvIndex > 2) return;

        const scoreCpMatch = msg.match(/score cp (-?\d+)/);
        const scoreMateMatch = msg.match(/score mate (-?\d+)/);

        const turn = this.currentFen ? this.currentFen.split(' ')[1] : 'w';
        const sign = turn === 'w' ? 1 : -1;

        if (scoreCpMatch) {
            this.scores[pvIndex] = sign * parseInt(scoreCpMatch[1]) / 100;
            this.mateScores[pvIndex] = 0;
        } else if (scoreMateMatch) {
            const mate = parseInt(scoreMateMatch[1]);
            this.scores[pvIndex] = sign * (mate > 0 ? 1000 : -1000);
            this.mateScores[pvIndex] = sign * mate;
        }

        this.lines[pvIndex] = pvMovesMatch[1].trim();

        if (pvIndex === 0 && depth >= 4) {
            this.updateBar(this.scores[0], this.mateScores[0]);
        }
        this.updateLines();
    }

    run(fen) {
        if (!this.worker || !this.ready) return;
        this.currentFen = fen;
        this.searching = true;
        this.lines = ['', '', ''];
        this.scores = [0, 0, 0];
        this.mateScores = [0, 0, 0];
        try {
            this.worker.postMessage('position fen ' + fen);
            this.worker.postMessage('go depth 20');
        } catch (e) {
            this.searching = false;
            return;
        }
        this.startWatchdog();
    }

    startWatchdog() {
        this.clearWatchdog();
        this.watchdog = setTimeout(() => {
            if (!this.searching) return;
            console.warn('[EvalBar] Engine stalled, killing and restarting...');
            this.killWorker();
            const pendingFen = this.pendingFen || this.currentFen;
            this.pendingFen = null;
            setTimeout(() => {
                this.init();
                if (pendingFen) {
                    const checkReady = setInterval(() => {
                        if (this.ready) {
                            clearInterval(checkReady);
                            this.evaluate(pendingFen);
                        }
                    }, 100);
                    setTimeout(() => clearInterval(checkReady), 10000);
                }
            }, 200);
        }, 5000);
    }

    clearWatchdog() {
        if (this.watchdog) {
            clearTimeout(this.watchdog);
            this.watchdog = null;
        }
    }

    evaluate(fen) {
        if (!fen) return;
        this.pendingFen = fen;
        if (!this.ready) return;

        if (this.searching) {
            try { this.worker.postMessage('stop'); } catch (e) {}
        } else {
            const f = this.pendingFen;
            this.pendingFen = null;
            this.run(f);
        }
    }

    uciToSAN(uciMoves, fen) {
        try {
            const chess = new Chess();
            chess.loadFEN(fen);
            const sanMoves = [];
            const tokens = uciMoves.split(' ');
            for (let i = 0; i < tokens.length; i++) {
                const t = tokens[i];
                if (t.length < 4) continue;
                const fromFile = t.charCodeAt(0) - 97;
                const fromRank = 8 - parseInt(t[1]);
                const toFile = t.charCodeAt(2) - 97;
                const toRank = 8 - parseInt(t[3]);
                const promo = t.length > 4 ? t[4] : null;
                const legalMoves = chess.generateLegalMoves();
                const move = legalMoves.find(m =>
                    m.from[0] === fromFile && m.from[1] === fromRank &&
                    m.to[0] === toFile && m.to[1] === toRank &&
                    (m.promotion || null) === (promo || null)
                );
                if (!move) break;
                const san = chess.moveToSAN(move);
                if (chess.turn === 'w') {
                    sanMoves.push(chess.fullmoveNumber + '.' + san);
                } else {
                    sanMoves.push(san);
                }
                chess.makeMove(move);
            }
            if (sanMoves.length === 0) return uciMoves;
            if (sanMoves.length > 6) {
                return sanMoves.slice(0, 6).join(' ') + ' ...';
            }
            return sanMoves.join(' ');
        } catch (e) {
            return uciMoves;
        }
    }

    updateBar(evalScore, mateScore) {
        const fill = document.getElementById('eval-bar-fill');
        const score = document.getElementById('eval-score');
        if (!fill || !score) return;

        let percent;
        if (mateScore !== 0) {
            percent = mateScore > 0 ? 100 : 0;
        } else if (evalScore >= 10) {
            percent = 95;
        } else if (evalScore <= -10) {
            percent = 5;
        } else {
            percent = 50 + (evalScore / 10) * 45;
        }
        if (mateScore === 0) {
            percent = Math.max(2, Math.min(98, percent));
        }

        fill.style.height = percent + '%';

        if (mateScore !== 0) {
            score.textContent = (mateScore > 0 ? '+' : '') + 'M' + Math.abs(mateScore);
            score.style.color = mateScore > 0 ? '#fff' : '#333';
        } else if (evalScore > 0) {
            score.textContent = '+' + evalScore.toFixed(1);
            score.style.color = '#fff';
        } else if (evalScore < 0) {
            score.textContent = evalScore.toFixed(1);
            score.style.color = '#333';
        } else {
            score.textContent = '0.0';
            score.style.color = 'var(--text-secondary)';
        }
    }

    updateLines() {
        const container = document.getElementById('engine-lines');
        if (!container) return;
        const fen = this.currentFen;
        container.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            if (!this.lines[i]) continue;
            const score = this.scores[i];
            const mate = this.mateScores[i];
            const div = document.createElement('div');
            div.className = 'engine-line';
            let scoreText;
            if (mate !== 0) scoreText = (mate > 0 ? '+' : '') + 'M' + Math.abs(mate);
            else if (score > 0) scoreText = '+' + score.toFixed(1);
            else scoreText = score.toFixed(1);
            const pvText = this.uciToSAN(this.lines[i], fen);
            div.innerHTML = `<span class="engine-line-score">${scoreText}</span> <span class="engine-line-moves">${pvText}</span>`;
            container.appendChild(div);
        }
    }
}

const evalBar = new EvalBar();
