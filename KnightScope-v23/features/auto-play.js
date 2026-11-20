(() => {
  const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
  const PROMOTIONS = { q: "queen", r: "rook", b: "bishop", n: "knight" };

  function create({ chess, getState, getBoard, isEnabled, canAutoPlay, getDelay = () => 0 }) {
    let generation = 0;
    let lastPositionKey = "";
    let lastAttempt = "";
    const pending = new Set();

    function isCurrent(fen, expectedGeneration) {
      if (expectedGeneration !== generation || !isEnabled() || !canAutoPlay()) return false;
      const state = getState();
      return !!state && state.turn === state.me && chess.key(state.fen) === chess.key(fen);
    }

    function schedule(callback, delay, fen, expectedGeneration) {
      const timer = setTimeout(() => {
        pending.delete(timer);
        if (isCurrent(fen, expectedGeneration)) callback();
      }, delay);
      pending.add(timer);
      return timer;
    }

    function cancel() {
      generation++;
      pending.forEach(clearTimeout);
      pending.clear();
    }

    function squareCenter(board, square, flipped) {
      const rect = board.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const file = square.charCodeAt(0) - 97;
      const rank = Number(square[1]) - 1;
      const x = (flipped ? 7 - file : file) * rect.width / 8 + rect.width / 16;
      const y = (flipped ? rank : 7 - rank) * rect.height / 8 + rect.height / 16;
      return { x: rect.left + x, y: rect.top + y };
    }

    function emitClick(element, x, y, after) {
      if (!element || !element.isConnected) return false;
      const pointerOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        width: 1,
        height: 1,
        pressure: 0.5,
        isPrimary: true,
        buttons: 1
      };
      const mouseOptions = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1 };
      element.dispatchEvent(new PointerEvent("pointerover", pointerOptions));
      element.dispatchEvent(new PointerEvent("pointerenter", pointerOptions));
      element.dispatchEvent(new MouseEvent("mouseover", mouseOptions));
      element.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
      element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));

      setTimeout(() => {
        if (!element.isConnected) return;
        element.dispatchEvent(new PointerEvent("pointerup", { ...pointerOptions, buttons: 0, pressure: 0 }));
        element.dispatchEvent(new MouseEvent("mouseup", { ...mouseOptions, buttons: 0 }));
        element.dispatchEvent(new MouseEvent("click", { ...mouseOptions, buttons: 0 }));
        after?.();
      }, 50);
      return true;
    }

    function clickBoardSquare(square, fen, expectedGeneration, after) {
      if (!isCurrent(fen, expectedGeneration)) return false;
      const board = getBoard();
      const state = getState();
      if (!board || !state) return false;
      const point = squareCenter(board, square, state.flipped);
      if (!point) return false;
      const element = document.elementFromPoint(point.x, point.y);
      if (!element || !board.contains(element)) return false;
      return emitClick(element, point.x, point.y, after);
    }

    function promotionElement(board, piece, color) {
      const pieceName = PROMOTIONS[piece];
      if (!pieceName) return null;
      const roots = [
        ...document.querySelectorAll(".promotion-window, .promotion-area, [class*='promotion']")
      ].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      for (const root of roots) {
        const candidates = root.querySelectorAll(
          `.${color}${piece}, [data-piece="${color}${piece}"], .promotion-piece.${pieceName}, [class*="${pieceName}"]`
        );
        for (const candidate of candidates) {
          if (candidate.classList.contains(`${color}${piece}`) ||
              candidate.dataset.piece === `${color}${piece}` ||
              candidate.classList.contains(pieceName) ||
              candidate.className.toString().includes(pieceName)) {
            return candidate;
          }
        }
      }
      return board.querySelector(
        `.promotion-window .${color}${piece}, .promotion-area .${color}${piece}, [data-piece="${color}${piece}"]`
      );
    }

    function choosePromotion(piece, fen, expectedGeneration, attempt = 0) {
      if (!isCurrent(fen, expectedGeneration)) return;
      const board = getBoard();
      const state = getState();
      if (!board || !state) return;
      const color = state.me;
      const colorPrefix = color === "w" ? "w" : "b";
      const option = promotionElement(board, piece, colorPrefix);
      if (!option) {
        if (attempt < 5) schedule(() => choosePromotion(piece, fen, expectedGeneration, attempt + 1), 150, fen, expectedGeneration);
        else console.warn("[AutoMove] Could not find the requested promotion piece.");
        return;
      }
      const rect = option.getBoundingClientRect();
      emitClick(option, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    function play(move, fen) {
      if (typeof move !== "string" || !UCI_PATTERN.test(move || "")) return false;
      if (!isEnabled() || !canAutoPlay()) return false;

      const state = getState();
      if (!state || state.turn !== state.me || chess.key(state.fen) !== chess.key(fen)) return false;
      const position = chess.fromFen(state.fen);
      if (!chess.moveFromUci(position, move, chess.legalMoves(position))) {
        console.warn("[AutoMove] Refusing to play an illegal move.");
        return false;
      }

      const positionKey = chess.key(fen);
      if (positionKey !== lastPositionKey) {
        lastPositionKey = positionKey;
        lastAttempt = "";
      }
      if (positionKey === lastAttempt) return false;
      lastAttempt = positionKey;
      const expectedGeneration = generation;

      const beginMove = () => {
        if (!isCurrent(fen, expectedGeneration)) return;
        if (!clickBoardSquare(move.slice(0, 2), fen, expectedGeneration, () => {
          schedule(() => {
            const afterDestination = () => {
              if (move.length === 5) choosePromotion(move[4], fen, expectedGeneration);
            };
            if (!clickBoardSquare(move.slice(2, 4), fen, expectedGeneration, afterDestination)) console.warn("[AutoMove] Could not click the destination square.");
          }, 150, fen, expectedGeneration);
        })) {
          lastAttempt = "";
          console.warn("[AutoMove] Could not click the source square.");
        }
      };
      let delay = 0;
      try {
        const configured = Number(getDelay());
        if (Number.isFinite(configured)) delay = Math.max(0, Math.min(10000, Math.round(configured)));
      } catch (_) {}
      schedule(beginMove, delay, fen, expectedGeneration);
      return true;
    }

    return { play, cancel };
  }

  self.BMAutoPlay = { create };
})();
