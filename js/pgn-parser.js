class PGNParser {
    static parse(pgnText) {
        const games = [];
        const blocks = pgnText.split(/\n\n+/);

        let currentHeaders = {};
        let currentMoves = '';

        for (const block of blocks) {
            const lines = block.trim().split('\n');
            let isHeader = false;

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    const match = trimmed.match(/\[(\w+)\s+"(.*)"\]/);
                    if (match) {
                        currentHeaders[match[1]] = match[2];
                        isHeader = true;
                    }
                } else if (trimmed && !trimmed.startsWith(';')) {
                    currentMoves += ' ' + trimmed;
                }
            }

            if (isHeader && currentMoves.trim()) {
                games.push(this.createGame(currentHeaders, currentMoves.trim()));
                currentHeaders = {};
                currentMoves = '';
            }
        }

        if (Object.keys(currentHeaders).length > 0 || currentMoves.trim()) {
            games.push(this.createGame(currentHeaders, currentMoves.trim()));
        }

        if (games.length === 0 && pgnText.trim()) {
            games.push(this.createGame({}, pgnText.trim()));
        }

        return games;
    }

    static createGame(headers, moveText) {
        const chess = new Chess();
        const moves = [];
        let moveNumber = 1;
        let turn = 'w';

        const cleanText = moveText
            .replace(/\{[^}]*\}/g, '')
            .replace(/;.*$/gm, '')
            .replace(/\d+\.\.\./g, '')
            .trim();

        const tokens = cleanText.split(/\s+/).filter(t => t && !t.match(/^\d+\.+$/));

        for (const token of tokens) {
            if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') {
                break;
            }

            const move = this.parseSAN(chess, token, turn);
            if (move) {
                const san = token;
                if (chess.makeMove(move)) {
                    moves.push({ san, move });
                    turn = turn === 'w' ? 'b' : 'w';
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        return {
            headers: {
                Event: headers.Event || headers.Site || 'Unknown Event',
                Date: headers.Date || '????.??.??',
                White: headers.White || 'White',
                Black: headers.Black || 'Black',
                Result: headers.Result || '*',
                ECO: headers.ECO || '',
                Round: headers.Round || '',
                Site: headers.Site || ''
            },
            moves,
            result: headers.Result || '*'
        };
    }

    static parseSAN(chess, san, color) {
        const cleanSan = san.replace(/[+#!?]/g, '');

        if (cleanSan === 'O-O' || cleanSan === '0-0') {
            const row = color === 'w' ? 7 : 0;
            return { from: [4, row], to: [6, row], castle: color === 'w' ? 'K' : 'k' };
        }

        if (cleanSan === 'O-O-O' || cleanSan === '0-0-0') {
            const row = color === 'w' ? 7 : 0;
            return { from: [4, row], to: [2, row], castle: color === 'w' ? 'Q' : 'q' };
        }

        let promotion = null;
        let moveStr = cleanSan;
        const promoMatch = moveStr.match(/=([QRBN])$/i);
        if (promoMatch) {
            promotion = promoMatch[1].toLowerCase();
            moveStr = moveStr.slice(0, -2);
        }

        let pieceType = 'p';
        if (moveStr[0] === moveStr[0].toUpperCase() && moveStr[0] >= 'A' && moveStr[0] <= 'Z') {
            pieceType = moveStr[0].toLowerCase();
            moveStr = moveStr.substring(1);
        }

        moveStr = moveStr.replace(/x/g, '');

        let toFile, toRank, disambigFile = null, disambigRank = null;

        if (pieceType === 'p') {
            if (moveStr.length === 2) {
                toFile = moveStr.charCodeAt(0) - 97;
                toRank = parseInt(moveStr[1]) - 1;
            } else if (moveStr.length === 3) {
                disambigFile = moveStr.charCodeAt(0) - 97;
                toFile = moveStr.charCodeAt(1) - 97;
                toRank = parseInt(moveStr[2]) - 1;
            } else if (moveStr.length === 4) {
                disambigFile = moveStr.charCodeAt(0) - 97;
                disambigRank = parseInt(moveStr[1]) - 1;
                toFile = moveStr.charCodeAt(2) - 97;
                toRank = parseInt(moveStr[3]) - 1;
            }
        } else {
            if (moveStr.length === 2) {
                toFile = moveStr.charCodeAt(0) - 97;
                toRank = parseInt(moveStr[1]) - 1;
            } else if (moveStr.length === 3) {
                if (moveStr[0] >= 'a' && moveStr[0] <= 'h') {
                    disambigFile = moveStr.charCodeAt(0) - 97;
                } else if (moveStr[0] >= '1' && moveStr[0] <= '8') {
                    disambigRank = parseInt(moveStr[0]) - 1;
                }
                toFile = moveStr.charCodeAt(1) - 97;
                toRank = parseInt(moveStr[2]) - 1;
            } else if (moveStr.length === 4) {
                disambigFile = moveStr.charCodeAt(0) - 97;
                disambigRank = parseInt(moveStr[1]) - 1;
                toFile = moveStr.charCodeAt(2) - 97;
                toRank = parseInt(moveStr[3]) - 1;
            }
        }

        if (toFile === undefined || toRank === undefined) return null;

        const legalMoves = chess.generateLegalMoves(color);
        const candidates = legalMoves.filter(m => {
            const piece = chess.board[m.from[1]][m.from[0]];
            if (piece.type !== pieceType || piece.color !== color) return false;
            if (m.to[0] !== toFile || m.to[1] !== toRank) return false;
            if (disambigFile !== null && m.from[0] !== disambigFile) return false;
            if (disambigRank !== null && m.from[1] !== disambigRank) return false;
            if (promotion && m.promotion !== promotion) return false;
            if (!promotion && pieceType === 'p' && (toRank === 0 || toRank === 7) && !m.promotion) return false;
            return true;
        });

        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        for (const c of candidates) {
            if (!chess.board[c.to[1]][c.to[0]] && !c.enPassant) return c;
        }

        return candidates[0];
    }

    static parseMultiplePGN(pgnText) {
        const games = [];
        const sections = pgnText.split(/\n\n\s*\n/);

        for (const section of sections) {
            const trimmed = section.trim();
            if (!trimmed) continue;

            const parsed = this.parse(trimmed);
            games.push(...parsed);
        }

        if (games.length === 0) {
            return this.parse(pgnText);
        }

        return games;
    }
}

if (typeof module !== 'undefined') {
    module.exports = PGNParser;
}
