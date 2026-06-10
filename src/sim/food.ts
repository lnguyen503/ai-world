/** A food pellet on the ground plane. id is stable for the renderer to track. */
export interface Food {
  id: number;
  x: number;
  z: number;
  alive: boolean;
}

let nextFoodId = 1;

export function makeFood(x: number, z: number): Food {
  return { id: nextFoodId++, x, z, alive: true };
}
