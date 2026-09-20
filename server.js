const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8000;

// DARK PREDATOR TOURNAMENT PROFILE
const infoResponse = {
  apiversion: "1",
  author: "ThaiShadow-Lord",
  color: "#161B22",      // Cyber Void Obsidian Black
  head: "evil",           // Evil Dark Horns
  tail: "bolt",           // Lightning Bolt Tail
  version: "3.0.0-DARK-PREDATOR"
};

app.get('/', (req, res) => res.json(infoResponse));
app.post('/', (req, res) => res.json(infoResponse));
app.get('/ping', (req, res) => res.send("pong"));
app.post('/ping', (req, res) => res.send("pong"));

app.post('/start', (req, res) => {
  console.log(`[DARK PREDATOR] ⚔️ Match Started: ${req.body.game?.id}`);
  res.status(200).send("OK");
});

// Helper: Manhattan Distance
function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Helper: BFS Flood Fill available space count
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

// Helper: Voronoi Territory Control (Count cells reachable by us faster than any enemy)
function calculateVoronoi(myNextHead, enemyHeads, obstacles, width, height) {
  const myDistances = new Map();
  const enemyDistances = new Map();

  // BFS from my prospective head
  const qMy = [{ coord: myNextHead, dist: 0 }];
  myDistances.set(`${myNextHead.x},${myNextHead.y}`, 0);
  while (qMy.length > 0) {
    const { coord, dist } = qMy.shift();
    const neighbors = [
      { x: coord.x, y: coord.y + 1 }, { x: coord.x, y: coord.y - 1 },
      { x: coord.x - 1, y: coord.y }, { x: coord.x + 1, y: coord.y }
    ];
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height && !obstacles.has(key) && !myDistances.has(key)) {
        myDistances.set(key, dist + 1);
        qMy.push({ coord: n, dist: dist + 1 });
      }
    }
  }

  // Multi-source BFS from all enemy heads
  const qEnemies = [];
  enemyHeads.forEach(eh => {
    enemyDistances.set(`${eh.x},${eh.y}`, 0);
    qEnemies.push({ coord: eh, dist: 0 });
  });

  while (qEnemies.length > 0) {
    const { coord, dist } = qEnemies.shift();
    const neighbors = [
      { x: coord.x, y: coord.y + 1 }, { x: coord.x, y: coord.y - 1 },
      { x: coord.x - 1, y: coord.y }, { x: coord.x + 1, y: coord.y }
    ];
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height && !obstacles.has(key)) {
        if (!enemyDistances.has(key) || enemyDistances.get(key) > dist + 1) {
          enemyDistances.set(key, dist + 1);
          qEnemies.push({ coord: n, dist: dist + 1 });
        }
      }
    }
  }

  // Count Voronoi control cells (where we arrive strictly faster)
  let myTerritory = 0;
  for (const [key, myDist] of myDistances.entries()) {
    const enemyDist = enemyDistances.get(key);
    if (enemyDist === undefined || myDist < enemyDist) {
      myTerritory++;
    }
  }

  return myTerritory;
}

app.post('/move', (req, res) => {
  const { board, you, turn } = req.body;
  const myHead = you.head;
  const myLength = you.length;
  const myHealth = you.health;
  const myTail = you.body[you.body.length - 1];

  // 1. Map Obstacles
  const obstacles = new Set();
  const enemyHeads = [];
  let maxEnemyLength = 0;
  let weakestEnemy = null;
  let minEnemyHealth = 100;

  for (const snake of board.snakes) {
    if (snake.id !== you.id) {
      enemyHeads.push(snake.head);
      if (snake.length > maxEnemyLength) {
        maxEnemyLength = snake.length;
      }
      if (snake.health < minEnemyHealth) {
        minEnemyHealth = snake.health;
        weakestEnemy = snake;
      }
    }

    snake.body.forEach((seg, idx) => {
      // If not tail or snake just ate (health == 100), it's an obstacle
      if (idx === snake.body.length - 1 && snake.health < 100) {
        // tail will move away
      } else {
        obstacles.add(`${seg.x},${seg.y}`);
      }
    });
  }

  // 2. Identify Dangerous Zones vs Hunting Kill Zones
  const fatalZones = new Set();    // Do NOT step here (bigger/equal enemy head collision)
  const huntingZones = new Set();  // Step here to kill smaller enemy

  for (const snake of board.snakes) {
    if (snake.id !== you.id) {
      const eNeighbors = [
        { x: snake.head.x, y: snake.head.y + 1 },
        { x: snake.head.x, y: snake.head.y - 1 },
        { x: snake.head.x - 1, y: snake.head.y },
        { x: snake.head.x + 1, y: snake.head.y }
      ];

      if (snake.length >= myLength) {
        // Deadly: Enemy is bigger or equal
        eNeighbors.forEach(n => {
          if (n.x >= 0 && n.x < board.width && n.y >= 0 && n.y < board.height) {
            fatalZones.add(`${n.x},${n.y}`);
          }
        });
      } else {
        // Predator target: Enemy is smaller! We can crush their head
        eNeighbors.forEach(n => {
          if (n.x >= 0 && n.x < board.width && n.y >= 0 && n.y < board.height) {
            huntingZones.add(`${n.x},${n.y}`);
          }
        });
      }
    }
  }

  // 3. Evaluate Available Directions
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

    // Wall Collision Check
    if (coord.x < 0 || coord.x >= board.width || coord.y < 0 || coord.y >= board.height) {
      continue;
    }

    // Body Obstacle Check
    if (obstacles.has(key)) {
      continue;
    }

    // Flood Fill Space Evaluation
    const space = floodFill(coord, obstacles, board.width, board.height);
    const isTrap = space < myLength;

    // Voronoi Territory Control Score
    const territory = calculateVoronoi(coord, enemyHeads, obstacles, board.width, board.height);

    const isFatal = fatalZones.has(key);
    const isHunt = huntingZones.has(key);

    candidateMoves.push({
      dir,
      coord,
      space,
      territory,
      isTrap,
      isFatal,
      isHunt
    });
  }

  // Emergency fallback
  if (candidateMoves.length === 0) {
    console.log(`[TURN ${turn}] ⚠️ TRAPPED! No valid moves.`);
    return res.json({ move: 'up', shout: 'VOID_CONSUMED' });
  }

  // 4. Filter Safe Moves
  let safeChoices = candidateMoves.filter(c => !c.isFatal && !c.isTrap);
  if (safeChoices.length === 0) {
    safeChoices = candidateMoves.filter(c => !c.isFatal);
  }
  if (safeChoices.length === 0) {
    safeChoices = candidateMoves.filter(c => !c.isTrap);
  }
  if (safeChoices.length === 0) {
    safeChoices = candidateMoves;
  }

  // 5. Strategic Target Determination (Starvation, Early Food Rush, or Tail Control)
  let target = null;
  let tacticalShout = `⚡ AREA: ${safeChoices[0]?.territory || 0}`;

  // Mode A: Fast Early Growth or Low Health (Hunger Protocol)
  const isHungry = myHealth < 40 || (myLength <= maxEnemyLength + 1 && board.food.length > 0);

  // Mode B: Starvation Protocol (Steal food from starving enemies)
  let starveFood = null;
  if (weakestEnemy && minEnemyHealth < 35 && board.food.length > 0) {
    let minD = Infinity;
    for (const f of board.food) {
      const d = getDistance(weakestEnemy.head, f);
      if (d < minD) {
        minD = d;
        starveFood = f;
      }
    }
  }

  if (starveFood && getDistance(myHead, starveFood) <= 4) {
    target = starveFood;
    tacticalShout = `☠️ STARVATION_ACTIVE`;
  } else if (isHungry && board.food.length > 0) {
    // Seek nearest safe food
    let minDist = Infinity;
    for (const food of board.food) {
      const d = getDistance(myHead, food);
      if (d < minDist) {
        minDist = d;
        target = food;
      }
    }
    tacticalShout = `🩸 HUNGRY: ${myHealth}%`;
  } else {
    // Mode C: Dominance / Tail Loop / Center Control
    if (myLength > 8) {
      target = myTail; // Eternal Tail-Chasing Loop
      tacticalShout = `👑 TAIL_LOOP_LOCKED`;
    } else {
      target = { x: Math.floor(board.width / 2), y: Math.floor(board.height / 2) };
      tacticalShout = `⚔️ CENTER_DOMINANCE`;
    }
  }

  // 6. Score and Rank Moves
  safeChoices.sort((a, b) => {
    // 1st priority: Kill smaller enemy if safe
    if (a.isHunt && !b.isHunt && a.space >= myLength) return -1;
    if (!a.isHunt && b.isHunt && b.space >= myLength) return 1;

    // 2nd priority: Territory & Space control
    const territoryDiff = b.territory - a.territory;
    if (Math.abs(territoryDiff) >= 3) {
      return territoryDiff;
    }

    // 3rd priority: Distance to strategic target
    if (target) {
      const distA = getDistance(a.coord, target);
      const distB = getDistance(b.coord, target);
      if (distA !== distB) {
        return distA - distB;
      }
    }

    // Fallback: Maximum BFS space
    return b.space - a.space;
  });

  const bestMove = safeChoices[0].dir;
  console.log(`[TURN ${turn}] HP: ${myHealth} | Voronoi: ${safeChoices[0].territory} | Move: ${bestMove.toUpperCase()} | Shout: ${tacticalShout}`);

  res.json({
    move: bestMove,
    shout: tacticalShout
  });
});

app.post('/end', (req, res) => {
  console.log(`[DARK PREDATOR] 🏆 Match Concluded.`);
  res.status(200).send("OK");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`😈 [Battlesnake DARK PREDATOR 3.0] Active on port ${PORT}`);
});
