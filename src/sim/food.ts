import { WORLD } from '../config';

/** A food pellet on the ground plane. id is stable for the renderer to track. */
export interface Food {
  id: number;
  x: number;
  z: number;
  alive: boolean;
}

let nextFoodId = 1;

export function spawnFood(): Food {
  const h = WORLD.half - 2;
  return {
    id: nextFoodId++,
    x: (Math.random() * 2 - 1) * h,
    z: (Math.random() * 2 - 1) * h,
    alive: true,
  };
}
