const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8000;

// 1. Info Endpoint (GET /)
app.get('/', (req, res) => {
  res.json({
    apiversion: "1",
    author: "ThaiMaster",
    color: "#00E5FF",      // Neon Cyan
    head: "tiger-king",     // Head style
    tail: "bolt",           // Tail style
    version: "1.0.0"
  });
});

// 2. Game Start (POST /start)
app.post('/start', (req, res) => {
  console.log(`[GAME START] ID: ${req.body.game?.id}`);
  res.status(200).send("OK");
});

// 3. Move Calculation (POST /move)
app.post('/move', (req, res) => {
  const gameState = req.body;
  const myHead = gameState.you.head;
  const myBody = gameState.you.body;
  const boardWidth = gameState.board.width;
  const boardHeight = gameState.board.height;
  const foodList = gameState.board.food;
  const opponents = gameState.board.snakes;

  // Possible moves
  const isMoveSafe = {
    up: true,
    down: true,
    left: true,
    right: true
  };

  // 1. Avoid Walls
  if (myHead.x === 0) isMoveSafe.left = false;
  if (myHead.x === boardWidth - 1) isMoveSafe.right = false;
  if (myHead.y === 0) isMoveSafe.down = false;
  if (myHead.y === boardHeight - 1) isMoveSafe.up = false;

  // 2. Avoid Self Body
  const targetCoords = {
    up: { x: myHead.x, y: myHead.y + 1 },
    down: { x: myHead.x, y: myHead.y - 1 },
    left: { x: myHead.x - 1, y: myHead.y },
    right: { x: myHead.x + 1, y: myHead.y }
  };

  for (const [move, coord] of Object.entries(targetCoords)) {
    // Check self collision (ignore tail if it won't grow)
    if (myBody.some((segment, idx) => idx < myBody.length - 1 && segment.x === coord.x && segment.y === coord.y)) {
      isMoveSafe[move] = false;
    }

    // Check all opponents' bodies
    for (const snake of opponents) {
      if (snake.body.some(segment => segment.x === coord.x && segment.y === coord.y)) {
        isMoveSafe[move] = false;
      }

      // Avoid head-to-head collisions with larger/equal snakes
      if (snake.id !== gameState.you.id && snake.length >= gameState.you.length) {
        const distToOpponentHead = Math.abs(coord.x - snake.head.x) + Math.abs(coord.y - snake.head.y);
        if (distToOpponentHead <= 1) {
          isMoveSafe[move] = false;
        }
      }
    }
  }

  // Get list of remaining safe moves
  const safeMoves = Object.keys(isMoveSafe).filter(key => isMoveSafe[key]);

  // Fallback if all moves are dangerous
  if (safeMoves.length === 0) {
    console.log(`[WARNING] No safe moves found! Head: (${myHead.x}, ${myHead.y})`);
    return res.json({ move: "up", shout: "GG!" });
  }

  // 3. Move Towards Closest Food (or Center if full health)
  let chosenMove = safeMoves[0];

  let targetPoints = foodList;
  if (foodList.length === 0 || (gameState.you.health > 80 && foodList.length > 0)) {
    // Move towards board center when healthy
    targetPoints = [{ x: Math.floor(boardWidth / 2), y: Math.floor(boardHeight / 2) }];
  }

  if (targetPoints.length > 0) {
    let closestDistance = Infinity;

    for (const target of targetPoints) {
      for (const move of safeMoves) {
        const nextCoord = targetCoords[move];
        const dist = Math.abs(nextCoord.x - target.x) + Math.abs(nextCoord.y - target.y);
        if (dist < closestDistance) {
          closestDistance = dist;
          chosenMove = move;
        }
      }
    }
  }

  console.log(`[TURN ${gameState.turn}] Health: ${gameState.you.health} | Moved: ${chosenMove}`);
  res.json({
    move: chosenMove,
    shout: `Health ${gameState.you.health}`
  });
});

// 4. Game End (POST /end)
app.post('/end', (req, res) => {
  console.log(`[GAME END] ID: ${req.body.game?.id}`);
  res.status(200).send("OK");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Battlesnake Server] Listening on port ${PORT}`);
});
