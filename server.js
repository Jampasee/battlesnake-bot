const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8000;

const infoResponse = {
  apiversion: "1",
  author: "ThaiMaster-Pro",
  color: "#FF0055",      // Neon Crimson
  head: "dragon",         // Dragon Head
  tail: "curled",         // Curled Tail
  version: "2.0.0-PRO"
};

app.get('/', (req, res) => res.json(infoResponse));
app.post('/', (req, res) => res.json(infoResponse));
app.get('/ping', (req, res) => res.send("pong"));
app.post('/ping', (req, res) => res.send("pong"));

app.post('/start', (req, res) => {
  console.log(`[PRO AI] Match started: ${req.body.game?.id}`);
  res.status(200).send("OK");
});

// Helper: Manhattan Distance
function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Helper: Flood Fill to calculate available space
function floodFill(start, obstacles, width, height) {
  const visited = new Set();
  const queue = [start];
  visited.add(`${start.x},${start.y}`);

  let count = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    count++;

    const neighbors = [
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y }
    ];

    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (
        n.x >= 0 && n.x < width &&
        n.y >= 0 && n.y < height &&
        !obstacles.has(key) &&
        !visited.has(key)
      ) {
        visited.add(key);
        queue.push(n);
      }
    }
  }
  return count;
}

app.post('/move', (req, res) => {
  const { board, you, turn } = req.body;
  const myHead = you.head;
  const myLength = you.length;
  const myHealth = you.health;
  const myTail = you.body[you.body.length - 1];

  // 1. Build Obstacle Map (Walls + Snake bodies)
  const obstacles = new Set();

  // Add all snakes' bodies
  for (const snake of board.snakes) {
    snake.body.forEach((seg, idx) => {
      // Tail will move on next turn unless snake just ate food
      if (idx === snake.body.length - 1 && snake.health < 100) {
        // Safe to ignore tail as an obstacle
      } else {
        obstacles.add(`${seg.x},${seg.y}`);
      }
    });
  }

  // 2. Identify Dangerous Enemy Head Zones (Threat Zones)
  const dangerZones = new Set();
  for (const snake of board.snakes) {
    if (snake.id !== you.id) {
      if (snake.length >= myLength) {
        // Enemy is bigger or equal: AVOID adjacent tiles
        const eNeighbors = [
          { x: snake.head.x, y: snake.head.y + 1 },
          { x: snake.head.x, y: snake.head.y - 1 },
          { x: snake.head.x - 1, y: snake.head.y },
          { x: snake.head.x + 1, y: snake.head.y }
        ];
        eNeighbors.forEach(n => {
          if (n.x >= 0 && n.x < board.width && n.y >= 0 && n.y < board.height) {
            dangerZones.add(`${n.x},${n.y}`);
          }
        });
      }
    }
  }

  // 3. Evaluate 4 Directions
  const moves = [
    { dir: 'up', coord: { x: myHead.x, y: myHead.y + 1 } },
    { dir: 'down', coord: { x: myHead.x, y: myHead.y - 1 } },
    { dir: 'left', coord: { x: myHead.x - 1, y: myHead.y } },
    { dir: 'right', coord: { x: myHead.x + 1, y: myHead.y } }
  ];

  const candidateMoves = [];

  for (const m of moves) {
    const { coord, dir } = m;
    const key = `${coord.x},${coord.y}`;

    // A. Wall Collision Check
    if (coord.x < 0 || coord.x >= board.width || coord.y < 0 || coord.y >= board.height) {
      continue;
    }

    // B. Snake Body Collision Check
    if (obstacles.has(key)) {
      continue;
    }

    // C. Calculate Available Space via Flood Fill
    const space = floodFill(coord, obstacles, board.width, board.height);

    // If space is too small (trapped), penalize heavily
    const isTrap = space < myLength;

    // D. Check Head-to-Head Danger
    const isDangerZone = dangerZones.has(key);

    candidateMoves.push({
      dir,
      coord,
      space,
      isTrap,
      isDangerZone
    });
  }

  // If no safe moves, pick any valid coordinate
  if (candidateMoves.length === 0) {
    console.log(`[TURN ${turn}] ⚠️ EMERGENCY: Trapped!`);
    return res.json({ move: 'up', shout: 'Farewell!' });
  }

  // 4. Rank Candidates by Safety & Strategy
  // Filter out danger zones and traps if better alternatives exist
  let safeChoices = candidateMoves.filter(c => !c.isDangerZone && !c.isTrap);
  if (safeChoices.length === 0) {
    safeChoices = candidateMoves.filter(c => !c.isTrap);
  }
  if (safeChoices.length === 0) {
    safeChoices = candidateMoves;
  }

  // 5. Choose Optimal Target: Food vs Center vs Tail Chasing
  let target = null;

  if (myHealth < 50 || (board.food.length > 0 && myLength < 8)) {
    // Hungry mode: Seek closest food
    let minDist = Infinity;
    for (const food of board.food) {
      const d = getDistance(myHead, food);
      if (d < minDist) {
        minDist = d;
        target = food;
      }
    }
  }

  if (!target) {
    // Survival / Dominance mode: Follow Tail or stay near Center
    if (myLength > 6) {
      target = myTail; // Follow own tail for safety loop
    } else {
      target = { x: Math.floor(board.width / 2), y: Math.floor(board.height / 2) };
    }
  }

  // Score each safe choice based on distance to target + space available
  safeChoices.sort((a, b) => {
    const distA = getDistance(a.coord, target);
    const distB = getDistance(b.coord, target);

    // If space is significantly different, prefer bigger space
    if (Math.abs(a.space - b.space) > 5) {
      return b.space - a.space;
    }

    // Otherwise prefer closest to target
    return distA - distB;
  });

  const bestMove = safeChoices[0].dir;
  const bestSpace = safeChoices[0].space;

  console.log(`[TURN ${turn}] Health: ${myHealth} | Space: ${bestSpace} | Move: ${bestMove.toUpperCase()}`);

  res.json({
    move: bestMove,
    shout: `Area: ${bestSpace} tiles`
  });
});

app.post('/end', (req, res) => {
  console.log(`[PRO AI] Match ended`);
  res.status(200).send("OK");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐉 [Battlesnake PRO AI] Running on port ${PORT}`);
});
