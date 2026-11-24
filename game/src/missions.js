// The story of Solmar Bay: six missions for Danny Cole, ex-wheelman, back in town after
// three years away, working for the fixer Marina Solano against Kane Voss and his crew,
// the Vultures. Each mission is a list of steps — go somewhere, steal or deliver a car,
// lose the heat, take out the gang — with phone-call dialogue that plays as it runs.

import { PLACES } from './city.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'First Wheels',
    giver: 'Marina Solano',
    reward: 400,
    intro: [
      'Marina: Danny Cole. Three years gone, and you walk back into my town on foot?',
      'Marina: No car, no money, no crew. Lucky for you, I still like you.',
      'Marina: Steal a car — any car — and bring it to my garage. That is your interview.',
    ],
    steps: [
      { type: 'enterCar', label: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', x: PLACES.garage.x, y: PLACES.garage.y, radius: 90, label: 'Drive to Solano Garage', inCar: true },
    ],
    outro: 'Marina: Not bad. The car stays with me. You, I keep.',
  },
  {
    id: 2,
    title: 'The Pickup',
    giver: 'Marina Solano',
    reward: 800,
    intro: [
      'Marina: A package is waiting at the docks. Small box, big value.',
      'Marina: Walk in, pick it up, bring it to my office. And Danny — do not open it.',
    ],
    steps: [
      { type: 'goto', x: PLACES.docks.x, y: PLACES.docks.y, radius: 80, label: 'Go to the Docks' },
      { type: 'collect', x: PLACES.docks.x, y: PLACES.docks.y, radius: 46, label: 'Pick up the package' },
      { type: 'goto', x: PLACES.office.x, y: PLACES.office.y, radius: 90, label: 'Deliver it to Marina\u2019s Office' },
    ],
    outro: 'Marina: Sealed, on time. You might be worth the trouble after all.',
  },
  {
    id: 3,
    title: 'Heat Wave',
    giver: 'Marina Solano',
    reward: 600,
    intro: [
      'Marina: The SBPD found my name on a shipping list. Now they want a word with you.',
      'Marina: Lose them. Break line of sight, stay out of trouble, and the heat cools off.',
      'Marina: And Danny? Do not make it worse.',
    ],
    steps: [
      { type: 'loseHeat', label: 'Lose the police (get your wanted level to zero)' },
    ],
    setup: { heat: 60 },
    outro: 'Marina: Clean again. The list is gone too. You owe me a coffee.',
  },
  {
    id: 4,
    title: 'Repo Run',
    giver: 'Marina Solano',
    reward: 1200,
    intro: [
      'Marina: A client of mine stopped paying. His gold coupe is parked at the stadium.',
      'Marina: Take it back for me. Bring it to the garage in one piece if you can.',
    ],
    steps: [
      { type: 'goto', x: PLACES.stadium.x, y: PLACES.stadium.y, radius: 140, label: 'Go to Solmar Stadium' },
      { type: 'enterCar', label: 'Steal the gold Solstice GT', carId: 'repo' },
      { type: 'goto', x: PLACES.garage.x, y: PLACES.garage.y, radius: 90, label: 'Deliver the coupe to the garage', inCar: true },
    ],
    setup: { spawnRepoCar: true },
    outro: 'Marina: Beautiful. The client can cry to his accountant.',
  },
  {
    id: 5,
    title: 'Sunset Getaway',
    giver: 'Marina Solano',
    reward: 1500,
    intro: [
      'Marina: Kane Voss tipped off the SBPD. They are coming for the garage — and for you.',
      'Marina: Get to your safehouse before they box you in. Ninety seconds. Go.',
    ],
    steps: [
      { type: 'goto', x: PLACES.safehouse.x, y: PLACES.safehouse.y, radius: 90, label: 'Reach the Safehouse', timed: 90 },
    ],
    setup: { heat: 130 },
    outro: 'Marina: You made it. Voss is getting bold. We end this soon.',
  },
  {
    id: 6,
    title: 'Showdown at the Docks',
    giver: 'Marina Solano',
    reward: 3000,
    intro: [
      'Marina: Voss and his Vultures are moving product through the docks tonight.',
      'Marina: End it, Danny. Take them all down — then come home.',
      'Marina: Your pistol is loaded. Make it count.',
    ],
    steps: [
      { type: 'goto', x: PLACES.docks.x, y: PLACES.docks.y, radius: 220, label: 'Go to the Docks' },
      { type: 'kill', count: 6, label: 'Take down the Vultures (0/6)' },
      { type: 'goto', x: PLACES.office.x, y: PLACES.office.y, radius: 90, label: 'Report back to Marina' },
    ],
    setup: { spawnEnemies: 6 },
    outro: 'Marina: It is done. Solmar Bay is ours again, Danny. All of it.',
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

/** The next mission the player has not finished yet, or null when the story is done. */
export function nextMission(completedIds) {
  for (const mission of MISSIONS) {
    if (!completedIds.includes(mission.id)) return mission;
  }
  return null;
}

export function createMissionState() {
  return {
    active: null, // the mission definition currently running
    stepIndex: 0,
    kills: 0,
    timer: 0,
    dialogQueue: [],
    dialogTimer: 0,
    banner: null, // { text, sub, kind, timer }
    failed: false,
  };
}

/** Start a mission: queue its intro dialogue and reset its progress. */
export function startMission(missionState, mission) {
  missionState.active = mission;
  missionState.stepIndex = 0;
  missionState.kills = 0;
  missionState.timer = 0;
  missionState.failed = false;
  missionState.dialogQueue = [...mission.intro];
  missionState.dialogTimer = 0;
  missionState.banner = { text: mission.title, sub: `Mission ${mission.id} of ${MISSIONS.length} — ${mission.giver}`, kind: 'mission', timer: 4 };
}

export function currentStep(missionState) {
  if (!missionState.active) return null;
  return missionState.active.steps[missionState.stepIndex] ?? null;
}

/** The world position the player should head for now, or null. */
export function currentObjective(missionState) {
  const step = currentStep(missionState);
  if (!step) return null;
  if (step.type === 'goto' || step.type === 'collect') return { x: step.x, y: step.y, label: step.label };
  if (step.type === 'enterCar' && step.carId === 'repo') return { x: PLACES.stadium.x, y: PLACES.stadium.y, label: step.label };
  return null;
}

/**
 * Advance the mission state machine one step. `events` is what happened this frame
 * (entered a car, collected, killed, reached a point); returns 'complete', 'failed'
 * or null. The world fills in the checks the steps need.
 */
export function updateMission(missionState, dt, context) {
  const mission = missionState.active;
  if (!mission) return null;
  const step = currentStep(missionState);
  if (!step) return null;

  if (step.timed) {
    missionState.timer += dt;
    if (missionState.timer > step.timed) {
      missionState.failed = true;
      missionState.banner = { text: 'MISSION FAILED', sub: 'Out of time.', kind: 'failed', timer: 4 };
      return 'failed';
    }
  }

  let done = false;
  if (step.type === 'enterCar') {
    if (context.enteredCar) {
      if (!step.carId || context.enteredCarId === step.carId) done = true;
    }
  } else if (step.type === 'goto' || step.type === 'collect') {
    const p = context.playerPos;
    const d = Math.hypot(p.x - step.x, p.y - step.y);
    if (d < step.radius && (!step.inCar || context.inCar)) done = true;
  } else if (step.type === 'loseHeat') {
    if (context.wanted === 0) done = true;
  } else if (step.type === 'kill') {
    if (missionState.kills >= step.count) done = true;
  }

  if (!done) return null;
  missionState.stepIndex += 1;
  missionState.timer = 0;
  if (missionState.stepIndex >= mission.steps.length) {
    missionState.banner = {
      text: 'MISSION PASSED',
      sub: `${mission.title}  ·  +$${mission.reward}`,
      kind: 'passed',
      timer: 4,
    };
    return 'complete';
  }
  return null;
}

/** The dialogue line showing now, advanced by time; null when the queue is empty. */
export function updateDialog(missionState, dt) {
  if (missionState.dialogQueue.length === 0) return null;
  missionState.dialogTimer += dt;
  if (missionState.dialogTimer > 5.5) {
    missionState.dialogTimer = 0;
    missionState.dialogQueue.shift();
  }
  return missionState.dialogQueue[0] ?? null;
}

/** The label the HUD's mission tracker shows for the current step. */
export function trackerLabel(missionState) {
  const step = currentStep(missionState);
  if (!step || !missionState.active) return null;
  let label = step.label;
  if (step.type === 'kill') label = `Take down the Vultures (${missionState.kills}/${step.count})`;
  if (step.timed) {
    const left = Math.max(0, Math.ceil(step.timed - missionState.timer));
    label += `  ·  ${left}s left`;
  }
  return { title: missionState.active.title, label };
}
