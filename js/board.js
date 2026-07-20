class ChessBoard {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.flipped = false;
        this.selectedSquare = null;
        this.onSquareClick = null;
        this.render();
    }

    render() {
        this.container.innerHTML = '';
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const displayRank = this.flipped ? 7 - rank : rank;
                const displayFile = this.flipped ? 7 - file : file;
                const isLight = (displayRank + displayFile) % 2 === 0;

                const square = document.createElement('div');
                square.className = `square ${isLight ? 'light' : 'dark'}`;
                square.dataset.file = displayFile;
                square.dataset.rank = displayRank;

                if (rank === 0) {
                    const label = document.createElement('span');
                    label.className = 'rank-label';
                    label.textContent = displayRank + 1;
                    square.appendChild(label);
                }

                if (rank === 7) {
                    const label = document.createElement('span');
                    label.className = 'file-label';
                    label.textContent = String.fromCharCode(97 + displayFile);
                    square.appendChild(label);
                }

                square.addEventListener('click', () => this.handleClick(displayFile, displayRank));
                this.container.appendChild(square);
            }
        }
    }

    handleClick(file, rank) {
        if (this.onSquareClick) {
            this.onSquareClick(file, rank);
        }
    }

    update(chess, lastMove = null, selectedSquare = null) {
        const squares = this.container.querySelectorAll('.square');
        squares.forEach(sq => {
            sq.classList.remove('highlight', 'selected');
            const existingPiece = sq.querySelector('.chess-piece');
            if (existingPiece) existingPiece.remove();
        });

        if (lastMove) {
            this.highlightSquare(lastMove.from[0], lastMove.from[1], 'highlight');
            this.highlightSquare(lastMove.to[0], lastMove.to[1], 'highlight');
        }

        if (selectedSquare) {
            this.highlightSquare(selectedSquare[0], selectedSquare[1], 'selected');
        }

        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = chess.getSquare(file, rank);
                if (piece) {
                    this.setPiece(file, rank, piece, chess);
                }
            }
        }
    }

    setPiece(file, rank, piece, chess) {
        const square = this.getSquareElement(file, rank);
        if (!square) return;

        const existing = square.querySelector('.chess-piece');
        if (existing) existing.remove();

        const pieceEl = document.createElement('span');
        pieceEl.className = 'chess-piece';
        pieceEl.textContent = chess.getUnicode(piece);
        square.appendChild(pieceEl);
    }

    highlightSquare(file, rank, className) {
        const square = this.getSquareElement(file, rank);
        if (square) {
            square.classList.add(className);
        }
    }

    getSquareElement(file, rank) {
        return this.container.querySelector(`[data-file="${file}"][data-rank="${rank}"]`);
    }

    flip() {
        this.flipped = !this.flipped;
        this.render();
    }

    setFlipped(flipped) {
        this.flipped = flipped;
        this.render();
    }
}

if (typeof module !== 'undefined') {
    module.exports = ChessBoard;
}
