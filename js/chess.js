class Chess {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = this.createInitialBoard();
        this.turn = 'w';
        this.castling = { K: true, Q: true, k: true, q: true };
        this.enPassant = null;
        this.halfmoveClock = 0;
        this.fullmoveNumber = 1;
        this.moveHistory = [];
        this.positions = [];
        this.gameOver = false;
        this.result = '*';
    }

    createInitialBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
        for (let col = 0; col < 8; col++) {
            board[0][col] = { type: backRank[col], color: 'b' };
            board[1][col] = { type: 'p', color: 'b' };
            board[6][col] = { type: 'p', color: 'w' };
            board[7][col] = { type: backRank[col], color: 'w' };
        }
        return board;
    }

    clone() {
        const copy = new Chess();
        copy.board = this.board.map(row => row.map(sq => sq ? { ...sq } : null));
        copy.turn = this.turn;
        copy.castling = { ...this.castling };
        copy.enPassant = this.enPassant ? [...this.enPassant] : null;
        copy.halfmoveClock = this.halfmoveClock;
        copy.fullmoveNumber = this.fullmoveNumber;
        copy.moveHistory = [...this.moveHistory];
        copy.gameOver = this.gameOver;
        copy.result = this.result;
        return copy;
    }

    getSquare(file, rank) {
        return this.board[rank][file];
    }

    setSquare(file, rank, piece) {
        this.board[rank][file] = piece;
    }

    algebraicToCoords(algebraic) {
        const file = algebraic.charCodeAt(0) - 97;
        const rank = parseInt(algebraic[1]) - 1;
        return [file, rank];
    }

    coordsToAlgebraic(file, rank) {
        return String.fromCharCode(97 + file) + (rank + 1);
    }

    findKing(color) {
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = this.board[r][f];
                if (p && p.type === 'k' && p.color === color) {
                    return [f, r];
                }
            }
        }
        return null;
    }

    isSquareAttacked(file, rank, byColor) {
        const directions = [
            [0, 1], [0, -1], [1, 0], [-1, 0],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];

        for (const [df, dr] of directions) {
            let f = file + df;
            let r = rank + dr;
            while (f >= 0 && f < 8 && r >= 0 && r < 8) {
                const p = this.board[r][f];
                if (p) {
                    if (p.color === byColor) {
                        if (p.type === 'k' && Math.abs(df) <= 1 && Math.abs(dr) <= 1) return true;
                        if (p.type === 'q') return true;
                        if (p.type === 'r' && (df === 0 || dr === 0)) return true;
                        if (p.type === 'b' && df !== 0 && dr !== 0) return true;
                        if (p.type === 'p') {
                            const pawnDir = byColor === 'w' ? 1 : -1;
                            if (dr === pawnDir && Math.abs(df) === 1) return true;
                        }
                    }
                    if (!(p.color === byColor && p.type === 'k' && Math.abs(df) <= 1 && Math.abs(dr) <= 1)) {
                        break;
                    }
                }
                f += df;
                r += dr;
            }
        }

        const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [df, dr] of knightMoves) {
            const f = file + df;
            const r = rank + dr;
            if (f >= 0 && f < 8 && r >= 0 && r < 8) {
                const p = this.board[r][f];
                if (p && p.color === byColor && p.type === 'n') return true;
            }
        }

        return false;
    }

    isInCheck(color) {
        const king = this.findKing(color);
        if (!king) return false;
        const opponent = color === 'w' ? 'b' : 'w';
        return this.isSquareAttacked(king[0], king[1], opponent);
    }

    generatePseudoLegalMoves(color) {
        const moves = [];
        const opponent = color === 'w' ? 'b' : 'w';

        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const piece = this.board[r][f];
                if (!piece || piece.color !== color) continue;

                if (piece.type === 'p') {
                    const dir = color === 'w' ? -1 : 1;
                    const startRank = color === 'w' ? 6 : 1;
                    const promoRank = color === 'w' ? 0 : 7;

                    if (this.board[r + dir] && !this.board[r + dir][f]) {
                        if (r + dir === promoRank) {
                            for (const promo of ['q', 'r', 'b', 'n']) {
                                moves.push({ from: [f, r], to: [f, r + dir], promotion: promo });
                            }
                        } else {
                            moves.push({ from: [f, r], to: [f, r + dir] });
                        }
                        if (r === startRank && !this.board[r + 2 * dir][f]) {
                            moves.push({ from: [f, r], to: [f, r + 2 * dir], doublePush: true });
                        }
                    }

                    for (const df of [-1, 1]) {
                        const tf = f + df;
                        const tr = r + dir;
                        if (tf >= 0 && tf < 8 && tr >= 0 && tr < 8) {
                            const target = this.board[tr][tf];
                            if (target && target.color === opponent) {
                                if (tr === promoRank) {
                                    for (const promo of ['q', 'r', 'b', 'n']) {
                                        moves.push({ from: [f, r], to: [tf, tr], promotion: promo });
                                    }
                                } else {
                                    moves.push({ from: [f, r], to: [tf, tr] });
                                }
                            }
                            if (this.enPassant && this.enPassant[0] === tf && this.enPassant[1] === tr) {
                                moves.push({ from: [f, r], to: [tf, tr], enPassant: true });
                            }
                        }
                    }
                }

                if (piece.type === 'n') {
                    for (const [df, dr] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
                        const tf = f + df;
                        const tr = r + dr;
                        if (tf >= 0 && tf < 8 && tr >= 0 && tr < 8) {
                            const target = this.board[tr][tf];
                            if (!target || target.color === opponent) {
                                moves.push({ from: [f, r], to: [tf, tr] });
                            }
                        }
                    }
                }

                if (piece.type === 'k') {
                    for (const [df, dr] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
                        const tf = f + df;
                        const tr = r + dr;
                        if (tf >= 0 && tf < 8 && tr >= 0 && tr < 8) {
                            const target = this.board[tr][tf];
                            if (!target || target.color === opponent) {
                                moves.push({ from: [f, r], to: [tf, tr] });
                            }
                        }
                    }

                    if (color === 'w' && r === 7 && f === 4) {
                        if (this.castling.K && !this.board[7][5] && !this.board[7][6] && this.board[7][7]?.type === 'r') {
                            if (!this.isSquareAttacked(4, 7, opponent) && !this.isSquareAttacked(5, 7, opponent) && !this.isSquareAttacked(6, 7, opponent)) {
                                moves.push({ from: [4, 7], to: [6, 7], castle: 'K' });
                            }
                        }
                        if (this.castling.Q && !this.board[7][3] && !this.board[7][2] && !this.board[7][1] && this.board[7][0]?.type === 'r') {
                            if (!this.isSquareAttacked(4, 7, opponent) && !this.isSquareAttacked(3, 7, opponent) && !this.isSquareAttacked(2, 7, opponent)) {
                                moves.push({ from: [4, 7], to: [2, 7], castle: 'Q' });
                            }
                        }
                    }
                    if (color === 'b' && r === 0 && f === 4) {
                        if (this.castling.k && !this.board[0][5] && !this.board[0][6] && this.board[0][7]?.type === 'r') {
                            if (!this.isSquareAttacked(4, 0, 'w') && !this.isSquareAttacked(5, 0, 'w') && !this.isSquareAttacked(6, 0, 'w')) {
                                moves.push({ from: [4, 0], to: [6, 0], castle: 'k' });
                            }
                        }
                        if (this.castling.q && !this.board[0][3] && !this.board[0][2] && !this.board[0][1] && this.board[0][0]?.type === 'r') {
                            if (!this.isSquareAttacked(4, 0, 'w') && !this.isSquareAttacked(3, 0, 'w') && !this.isSquareAttacked(2, 0, 'w')) {
                                moves.push({ from: [4, 0], to: [2, 0], castle: 'q' });
                            }
                        }
                    }
                }

                if (piece.type === 'r' || piece.type === 'q') {
                    for (const [df, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                        let tf = f + df;
                        let tr = r + dr;
                        while (tf >= 0 && tf < 8 && tr >= 0 && tr < 8) {
                            const target = this.board[tr][tf];
                            if (target) {
                                if (target.color === opponent) {
                                    moves.push({ from: [f, r], to: [tf, tr] });
                                }
                                break;
                            }
                            moves.push({ from: [f, r], to: [tf, tr] });
                            tf += df;
                            tr += dr;
                        }
                    }
                }

                if (piece.type === 'b' || piece.type === 'q') {
                    for (const [df, dr] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
                        let tf = f + df;
                        let tr = r + dr;
                        while (tf >= 0 && tf < 8 && tr >= 0 && tr < 8) {
                            const target = this.board[tr][tf];
                            if (target) {
                                if (target.color === opponent) {
                                    moves.push({ from: [f, r], to: [tf, tr] });
                                }
                                break;
                            }
                            moves.push({ from: [f, r], to: [tf, tr] });
                            tf += df;
                            tr += dr;
                        }
                    }
                }
            }
        }

        return moves;
    }

    generateLegalMoves(color) {
        color = color || this.turn;
        const pseudoMoves = this.generatePseudoLegalMoves(color);
        return pseudoMoves.filter(move => {
            const test = this.clone();
            test.makeRawMove(move);
            return !test.isInCheck(color);
        });
    }

    makeRawMove(move) {
        const piece = this.board[move.from[1]][move.from[0]];
        const target = this.board[move.to[1]][move.to[0]];

        if (move.castle) {
            const rookFrom = move.castle === 'K' || move.castle === 'k' ? [7, move.from[1]] : [0, move.from[1]];
            const rookTo = move.castle === 'K' || move.castle === 'k' ? [5, move.from[1]] : [3, move.from[1]];
            this.board[rookTo[1]][rookTo[0]] = this.board[rookFrom[1]][rookFrom[0]];
            this.board[rookFrom[1]][rookFrom[0]] = null;
        }

        if (move.enPassant) {
            const capturedRow = move.from[1];
            this.board[capturedRow][move.to[0]] = null;
        }

        this.board[move.to[1]][move.to[0]] = move.promotion
            ? { type: move.promotion, color: piece.color }
            : piece;
        this.board[move.from[1]][move.from[0]] = null;
    }

    makeMove(move) {
        if (this.gameOver) return false;

        const piece = this.board[move.from[1]][move.from[0]];
        if (!piece) return false;

        const legalMoves = this.generateLegalMoves();
        const legalMove = legalMoves.find(m =>
            m.from[0] === move.from[0] && m.from[1] === move.from[1] &&
            m.to[0] === move.to[0] && m.to[1] === move.to[1] &&
            (m.promotion || null) === (move.promotion || null)
        );

        if (!legalMove) return false;

        const san = this.moveToSAN(legalMove);
        const captured = this.board[legalMove.to[1]][legalMove.to[0]] ||
            (legalMove.enPassant ? { type: 'p' } : null);

        this.makeRawMove(legalMove);

        if (legalMove.enPassant) {
            this.board[legalMove.from[1]][legalMove.to[0]] = null;
        }

        if (legalMove.doublePush) {
            const epRow = (legalMove.from[1] + legalMove.to[1]) / 2;
            this.enPassant = [legalMove.to[0], epRow];
        } else {
            this.enPassant = null;
        }

        if (piece.type === 'k') {
            if (legalMove.from[0] === 4) {
                if (legalMove.to[0] === 6) {
                    this.castling.K = false;
                    this.castling.Q = false;
                } else if (legalMove.to[0] === 2) {
                    this.castling.K = false;
                    this.castling.Q = false;
                }
            }
        }
        if (piece.type === 'r') {
            if (legalMove.from[0] === 0 && legalMove.from[1] === 7) this.castling.Q = false;
            if (legalMove.from[0] === 7 && legalMove.from[1] === 7) this.castling.K = false;
            if (legalMove.from[0] === 0 && legalMove.from[1] === 0) this.castling.q = false;
            if (legalMove.from[0] === 7 && legalMove.from[1] === 0) this.castling.k = false;
        }
        if (captured) {
            if (legalMove.to[0] === 0 && legalMove.to[1] === 7) this.castling.Q = false;
            if (legalMove.to[0] === 7 && legalMove.to[1] === 7) this.castling.K = false;
            if (legalMove.to[0] === 0 && legalMove.to[1] === 0) this.castling.q = false;
            if (legalMove.to[0] === 7 && legalMove.to[1] === 0) this.castling.k = false;
        }

        this.turn = this.turn === 'w' ? 'b' : 'w';
        if (this.turn === 'w') this.fullmoveNumber++;

        if (piece.type === 'p' || captured) {
            this.halfmoveClock = 0;
        } else {
            this.halfmoveClock++;
        }

        const check = this.isInCheck(this.turn);
        const legalMovesAfter = this.generateLegalMoves();
        const checkmate = check && legalMovesAfter.length === 0;
        const stalemate = !check && legalMovesAfter.length === 0;

        let moveSan = san;
        if (checkmate) moveSan += '#';
        else if (check) moveSan += '+';

        this.moveHistory.push({
            san: moveSan,
            from: legalMove.from,
            to: legalMove.to,
            piece: piece.type,
            captured: captured ? captured.type : null,
            promotion: legalMove.promotion || null,
            castle: legalMove.castle || null,
            enPassant: legalMove.enPassant || false,
            check: check,
            checkmate: checkmate
        });

        if (checkmate) {
            this.gameOver = true;
            this.result = this.turn === 'w' ? '0-1' : '1-0';
        } else if (stalemate || this.halfmoveClock >= 100) {
            this.gameOver = true;
            this.result = '1/2-1/2';
        }

        return true;
    }

    moveToSAN(move) {
        const piece = this.board[move.from[1]][move.from[0]];
        const target = this.board[move.to[1]][move.to[0]];

        if (move.castle === 'K' || move.castle === 'k') return 'O-O';
        if (move.castle === 'Q' || move.castle === 'q') return 'O-O-O';

        let san = '';
        if (piece.type !== 'p') {
            san += piece.type.toUpperCase();

            const allMoves = this.generateLegalMoves();
            const ambiguous = allMoves.filter(m => {
                const p = this.board[m.from[1]][m.from[0]];
                return p.type === piece.type && m.to[0] === move.to[0] && m.to[1] === move.to[1] &&
                    (m.from[0] !== move.from[0] || m.from[1] !== move.from[1]);
            });

            if (ambiguous.length > 0) {
                const sameFile = ambiguous.some(m => m.from[0] === move.from[0]);
                const sameRank = ambiguous.some(m => m.from[1] === move.from[1]);
                if (!sameFile) {
                    san += String.fromCharCode(97 + move.from[0]);
                } else if (!sameRank) {
                    san += (move.from[1] + 1);
                } else {
                    san += String.fromCharCode(97 + move.from[0]) + (move.from[1] + 1);
                }
            }
        } else {
            if (target || move.enPassant) {
                san += String.fromCharCode(97 + move.from[0]);
            }
        }

        if (target || move.enPassant) {
            san += 'x';
        }

        san += this.coordsToAlgebraic(move.to[0], move.to[1]);

        if (move.promotion) {
            san += '=' + move.promotion.toUpperCase();
        }

        return san;
    }

    loadFEN(fen) {
        this.reset();
        const parts = fen.split(' ');
        const rows = parts[0].split('/');

        for (let r = 0; r < 8; r++) {
            let f = 0;
            for (const ch of rows[r]) {
                if (ch >= '1' && ch <= '8') {
                    f += parseInt(ch);
                } else {
                    const color = ch === ch.toUpperCase() ? 'w' : 'b';
                    this.board[r][f] = { type: ch.toLowerCase(), color };
                    f++;
                }
            }
        }

        this.turn = parts[1] || 'w';
        const castling = parts[2] || '-';
        this.castling = {
            K: castling.includes('K'),
            Q: castling.includes('Q'),
            k: castling.includes('k'),
            q: castling.includes('q')
        };

        if (parts[3] && parts[3] !== '-') {
            this.enPassant = this.algebraicToCoords(parts[3]);
        }

        this.halfmoveClock = parseInt(parts[4]) || 0;
        this.fullmoveNumber = parseInt(parts[5]) || 1;
    }

    toFEN() {
        let fen = '';
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let f = 0; f < 8; f++) {
                const p = this.board[r][f];
                if (p) {
                    if (empty > 0) { fen += empty; empty = 0; }
                    fen += p.color === 'w' ? p.type.toUpperCase() : p.type;
                } else {
                    empty++;
                }
            }
            if (empty > 0) fen += empty;
            if (r < 7) fen += '/';
        }

        fen += ' ' + this.turn;
        let castling = '';
        if (this.castling.K) castling += 'K';
        if (this.castling.Q) castling += 'Q';
        if (this.castling.k) castling += 'k';
        if (this.castling.q) castling += 'q';
        fen += ' ' + (castling || '-');
        fen += ' ' + (this.enPassant ? this.coordsToAlgebraic(this.enPassant[0], this.enPassant[1]) : '-');
        fen += ' ' + this.halfmoveClock;
        fen += ' ' + this.fullmoveNumber;
        return fen;
    }

    getUnicode(piece) {
        const unicode = {
            'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
            'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙'
        };
        const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
        return unicode[key];
    }
}

if (typeof module !== 'undefined') {
    module.exports = Chess;
}
