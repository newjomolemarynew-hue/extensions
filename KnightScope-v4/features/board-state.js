(() => {
  function create(chess) {
    const sane = (fen) => {
      try {
        const position = chess.fromFen(fen);
        if (position.b.filter((piece) => piece === "K").length !== 1 || position.b.filter((piece) => piece === "k").length !== 1) return false;
        return !chess.inCheck(position, position.turn === "w" ? "b" : "w");
      } catch (_) {
        return false;
      }
    };

    const getBoard = () => document.querySelector("wc-chess-board, chess-board");

    function squareOf(element) {
      const match = [...element.classList].find((name) => /^square-\d\d$/.test(name));
      return match ? { file: +match[7] - 1, rank: +match[8] - 1 } : null;
    }

    function fenFromDom(board) {
      const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
      board.querySelectorAll(".piece").forEach((piece) => {
        const square = squareOf(piece);
        const type = [...piece.classList].find((name) => /^[wb][pnbrqk]$/.test(name));
        if (square && type) grid[square.rank][square.file] = type;
      });

      let turn = "w";
      for (const highlight of board.querySelectorAll(".highlight")) {
        const square = squareOf(highlight), piece = square && grid[square.rank][square.file];
        if (piece) {
          turn = piece[0] === "w" ? "b" : "w";
          break;
        }
      }

      const rows = [];
      for (let rank = 7; rank >= 0; rank--) {
        let row = "", empty = 0;
        for (let file = 0; file < 8; file++) {
          const piece = grid[rank][file];
          if (!piece) {
            empty++;
            continue;
          }
          if (empty) {
            row += empty;
            empty = 0;
          }
          row += piece[0] === "w" ? piece[1].toUpperCase() : piece[1];
        }
        rows.push(row + (empty || ""));
      }

      let castling = "";
      if (grid[0][4] === "wk") {
        if (grid[0][7] === "wr") castling += "K";
        if (grid[0][0] === "wr") castling += "Q";
      }
      if (grid[7][4] === "bk") {
        if (grid[7][7] === "br") castling += "k";
        if (grid[7][0] === "br") castling += "q";
      }
      return `${rows.join("/")} ${turn} ${castling || "-"} - 0 1`;
    }

    function readState(board) {
      const flipped = board.classList.contains("flipped");
      const fenFromPage = document.documentElement.dataset.bmFen;
      const hasPageFen = fenFromPage && fenFromPage.split(" ").length >= 4;
      const fen = hasPageFen ? fenFromPage : fenFromDom(board);
      const turn = fen.split(" ")[1] === "b" ? "b" : "w";
      const asRaw = (document.documentElement.dataset.bmAs || "").toLowerCase();
      let me = flipped ? "b" : "w";
      if (asRaw === "2" || asRaw === "b" || asRaw === "black") me = "b";
      else if (asRaw === "1" || asRaw === "w" || asRaw === "white") me = "w";
      return { fen, turn, me, flipped, real: !!hasPageFen, full: chess.parseFen(fen).full };
    }

    return { sane, getBoard, readState };
  }

  self.BMBoardState = { create };
})();
