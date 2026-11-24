import { Collectible, CollectibleType, Lane, Obstacle, ObstacleType } from './types';

let nextEntityId = 1;

export function resetEntityIds() {
  nextEntityId = 1;
}

function getId(): number {
  return nextEntityId++;
}

function randomLane(exclude?: Lane[]): Lane {
  const all: Lane[] = [0, 1, 2];
  const valid = exclude ? all.filter((l) => !exclude.includes(l)) : all;
  if (valid.length === 0) return 1;
  return valid[Math.floor(Math.random() * valid.length)];
}

export interface SpawnBatch {
  obstacles: Obstacle[];
  collectibles: Collectible[];
  cooldownBonus?: number;
}

/**
 * Computes which lanes currently have a train that could overlap with a wave spawning at z ~ 1.0.
 * Moving trains travel ~1.5x faster, so we include trains further down the track or recently spawned.
 */
function getBlockedTrainLanes(activeObstacles: Obstacle[]): Set<Lane> {
  const blocked = new Set<Lane>();
  for (const obs of activeObstacles) {
    if (obs.type === 'TRAIN') {
      if (obs.z + obs.length > 0.56) {
        blocked.add(obs.lane);
      }
    } else if (obs.type === 'MOVING_TRAIN') {
      // Moving train closes distance fast; keep its lane + safety check conservative
      if (obs.z + obs.length > 0.35) {
        blocked.add(obs.lane);
      }
    }
  }
  return blocked;
}

export function spawnWave(distance: number, activeObstacles: Obstacle[] = []): SpawnBatch {
  const obstacles: Obstacle[] = [];
  const collectibles: Collectible[] = [];

  const difficulty = Math.min(1, distance / 1400);
  const blockedTrainLanes = getBlockedTrainLanes(activeObstacles);

  // Power-up spawn chance (~18% per wave)
  const shouldSpawnPowerup = Math.random() < 0.18;
  const powerupTypes: CollectibleType[] = ['MAGNET', 'SHIELD', 'MULTIPLIER'];
  const chosenPowerup = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];

  // Helper to safely add a train without EVER creating a 3-lane train wall
  const canPlaceTrainOnLane = (lane: Lane): boolean => {
    const simulated = new Set(blockedTrainLanes);
    for (const o of obstacles) {
      if (o.type === 'TRAIN' || o.type === 'MOVING_TRAIN') {
        simulated.add(o.lane);
      }
    }
    simulated.add(lane);
    // Strict rule: NEVER allow all 3 lanes (0, 1, 2) to have trains!
    return simulated.size <= 2;
  };

  // Helper to attach coins going up a ramp and across the train roof
  const addRampAndRoofCoins = (
    lane: Lane,
    trainZ: number,
    trainLength: number,
    rampLen: number,
    putPowerupOnRoof: boolean
  ) => {
    // 3 coins ascending the ramp
    const rampSteps = [0.28, 0.62, 0.94];
    for (let i = 0; i < rampSteps.length; i++) {
      collectibles.push({
        id: getId(),
        lane,
        z: trainZ - rampLen + ((i + 0.5) / rampSteps.length) * rampLen,
        yOffset: rampSteps[i],
        type: 'COIN',
        collected: false,
      });
    }

    // 4-5 coins along the top roof of the train!
    const roofCount = Math.max(3, Math.floor(trainLength / 0.065));
    for (let i = 0; i < roofCount; i++) {
      const rz = trainZ + 0.03 + (i / roofCount) * (trainLength - 0.05);
      collectibles.push({
        id: getId(),
        lane,
        z: rz,
        yOffset: 1.14,
        type: putPowerupOnRoof && i === Math.floor(roofCount / 2) ? chosenPowerup : 'COIN',
        collected: false,
      });
    }
  };

  const patternRoll = Math.random();

  if (patternRoll < 0.30) {
    // Pattern 1: RAMP TRAIN! Run up the ramp onto the train roof for roof coins!
    const availableForTrain = ([0, 1, 2] as Lane[]).filter((l) => canPlaceTrainOnLane(l));
    const rampLane =
      availableForTrain.length > 0
        ? availableForTrain[Math.floor(Math.random() * availableForTrain.length)]
        : randomLane();

    if (canPlaceTrainOnLane(rampLane)) {
      const rampLength = 0.14;
      const trainLength = 0.32;
      const trainZ = 1.08;

      obstacles.push({
        id: getId(),
        lane: rampLane,
        z: trainZ,
        length: trainLength,
        type: 'TRAIN',
        speedMult: 1,
        passed: false,
        colorScheme: Math.floor(Math.random() * 4),
        hasRamp: true,
        rampLength,
      });

      addRampAndRoofCoins(rampLane, trainZ, trainLength, rampLength, shouldSpawnPowerup);

      // Optional 2nd stationary train on another lane (leaving 3rd lane open & safe!)
      const otherCandidates = ([0, 1, 2] as Lane[]).filter(
        (l) => l !== rampLane && canPlaceTrainOnLane(l)
      );
      if (otherCandidates.length >= 2 && Math.random() < 0.55) {
        const secondLane = otherCandidates[0];
        obstacles.push({
          id: getId(),
          lane: secondLane,
          z: 1.04,
          length: 0.24,
          type: 'TRAIN',
          speedMult: 1,
          passed: false,
          colorScheme: Math.floor(Math.random() * 4),
        });
      }

      return { obstacles, collectibles, cooldownBonus: 0.22 };
    }
  }

  if (patternRoll < 0.52) {
    // Pattern 2: Single stationary train (50% chance with ramp!) + coin trail on safe lane
    const candidates = ([0, 1, 2] as Lane[]).filter((l) => canPlaceTrainOnLane(l));
    if (candidates.length > 0) {
      const trainLane = candidates[Math.floor(Math.random() * candidates.length)];
      const withRamp = Math.random() < 0.55;
      const rampLength = 0.14;
      const trainLength = withRamp ? 0.28 : 0.22;
      const trainZ = withRamp ? 1.08 : 1.02;

      obstacles.push({
        id: getId(),
        lane: trainLane,
        z: trainZ,
        length: trainLength,
        type: 'TRAIN',
        speedMult: 1,
        passed: false,
        colorScheme: Math.floor(Math.random() * 4),
        hasRamp: withRamp,
        rampLength: withRamp ? rampLength : undefined,
      });

      if (withRamp) {
        addRampAndRoofCoins(trainLane, trainZ, trainLength, rampLength, shouldSpawnPowerup);
      } else {
        const coinLane = randomLane([trainLane]);
        for (let i = 0; i < 5; i++) {
          collectibles.push({
            id: getId(),
            lane: coinLane,
            z: 0.96 + i * 0.045,
            yOffset: 0,
            type: shouldSpawnPowerup && i === 2 ? chosenPowerup : 'COIN',
            collected: false,
          });
        }
      }

      return { obstacles, collectibles, cooldownBonus: withRamp ? 0.16 : 0.06 };
    }
  }

  if (patternRoll < 0.68) {
    // Pattern 3: Two trains (only if 3rd lane is 100% free of all trains!)
    const freeLanes = ([0, 1, 2] as Lane[]).filter((l) => !blockedTrainLanes.has(l));
    if (freeLanes.length === 3) {
      const safeLane = randomLane();
      const blockedLanes = ([0, 1, 2] as Lane[]).filter((l) => l !== safeLane);
      const rampIndex = Math.random() < 0.65 ? Math.floor(Math.random() * 2) : -1;

      blockedLanes.forEach((lane, idx) => {
        const hasRamp = idx === rampIndex;
        const trainZ = hasRamp ? 1.08 : 1.02;
        const trainLen = hasRamp ? 0.28 : 0.22;
        obstacles.push({
          id: getId(),
          lane,
          z: trainZ,
          length: trainLen,
          type: 'TRAIN',
          speedMult: 1,
          passed: false,
          colorScheme: Math.floor(Math.random() * 4),
          hasRamp,
          rampLength: hasRamp ? 0.14 : undefined,
        });

        if (hasRamp) {
          addRampAndRoofCoins(lane, trainZ, trainLen, 0.14, false);
        }
      });

      for (let i = 0; i < 5; i++) {
        collectibles.push({
          id: getId(),
          lane: safeLane,
          z: 0.98 + i * 0.045,
          yOffset: 0,
          type: shouldSpawnPowerup && i === 4 ? chosenPowerup : 'COIN',
          collected: false,
        });
      }

      return { obstacles, collectibles, cooldownBonus: 0.2 };
    }
  }

  if (patternRoll < 0.84) {
    // Pattern 4: Low Jump Barrier(s) with parabolic coin arc + High Gantry variety
    const barrierLane = randomLane();
    const secondBarrier = difficulty > 0.2 && Math.random() < 0.65;
    const altLane = randomLane([barrierLane]);

    const addBarrierWithArc = (lane: Lane) => {
      obstacles.push({
        id: getId(),
        lane,
        z: 1.0,
        length: 0.04,
        type: 'LOW_BARRIER',
        speedMult: 1,
        passed: false,
        colorScheme: 0,
      });

      const arcOffsets = [0.22, 0.62, 0.88, 0.62, 0.22];
      for (let i = 0; i < arcOffsets.length; i++) {
        collectibles.push({
          id: getId(),
          lane,
          z: 0.93 + i * 0.035,
          yOffset: arcOffsets[i],
          type: 'COIN',
          collected: false,
        });
      }
    };

    addBarrierWithArc(barrierLane);
    if (secondBarrier) {
      addBarrierWithArc(altLane);
    } else if (shouldSpawnPowerup) {
      collectibles.push({
        id: getId(),
        lane: altLane,
        z: 1.0,
        yOffset: 0,
        type: chosenPowerup,
        collected: false,
      });
    }

    return { obstacles, collectibles };
  }

  // Pattern 5: High Gantry (Slide under!) OR single Moving Express Train (strictly <= 2 trains total)
  const gantryLane = randomLane();
  obstacles.push({
    id: getId(),
    lane: gantryLane,
    z: 1.0,
    length: 0.04,
    type: 'HIGH_GANTRY',
    speedMult: 1,
    passed: false,
    colorScheme: 0,
  });

  for (let i = 0; i < 4; i++) {
    collectibles.push({
      id: getId(),
      lane: gantryLane,
      z: 0.94 + i * 0.04,
      yOffset: 0,
      type: shouldSpawnPowerup && i === 2 ? chosenPowerup : 'COIN',
      collected: false,
    });
  }

  // Only spawn an oncoming Moving Express Train if all 3 lanes were clear of trains
  const fastCandidates = ([0, 1, 2] as Lane[]).filter(
    (l) => l !== gantryLane && canPlaceTrainOnLane(l)
  );
  if (blockedTrainLanes.size === 0 && fastCandidates.length > 0 && Math.random() < 0.75) {
    const fastLane = fastCandidates[Math.floor(Math.random() * fastCandidates.length)];
    obstacles.push({
      id: getId(),
      lane: fastLane,
      z: 1.04,
      length: 0.24,
      type: 'MOVING_TRAIN',
      speedMult: 1.44 + difficulty * 0.2,
      passed: false,
      colorScheme: 1,
    });
  } else if (difficulty > 0.15) {
    const otherLane = randomLane([gantryLane]);
    const extraType: ObstacleType = Math.random() < 0.5 ? 'LOW_BARRIER' : 'HIGH_GANTRY';
    obstacles.push({
      id: getId(),
      lane: otherLane,
      z: 1.02,
      length: 0.04,
      type: extraType,
      speedMult: 1,
      passed: false,
      colorScheme: 1,
    });
  }

  return { obstacles, collectibles, cooldownBonus: 0.1 };
}
