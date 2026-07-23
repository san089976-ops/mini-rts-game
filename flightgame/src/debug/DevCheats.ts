/** Runtime cheat flags (title Dev panel). Not for production builds ideally. */
export const DevCheats = {
  infiniteAmmo: false,
  /** Player cannot be AA-locked / missile-tracked */
  noLock: false,
  infiniteHp: false
};

export function anyCheatActive() {
  return DevCheats.infiniteAmmo || DevCheats.noLock || DevCheats.infiniteHp;
}
