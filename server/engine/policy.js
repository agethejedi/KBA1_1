
export const DEFAULT_POLICY = {
  scoring: {
    failIfWrongOrDeclinedAtLeast: 2,
    passIfCorrectAtLeast: 3,
    perClassMinimumCorrect: {
      real_estate: 0,
      vehicle: 0,
      license: 0
    }
  },
  selection: {
    counts: { real_estate: 2, vehicle: 1, license: 1 },
    real_estate: { allowedFields: ["street","move_in_year","city","zip"] },
    vehicle: { allowedAttrs: ["color","model","make","year"] },
    license: { allowedFields: ["agency","profession","number"] },
    preferDiversity: true
  }
};

let ACTIVE = structuredClone(DEFAULT_POLICY);
export function getPolicy(){ return ACTIVE; }
export function setPolicy(next){
  ACTIVE = structuredClone({
    ...DEFAULT_POLICY,
    ...next,
    scoring: { ...DEFAULT_POLICY.scoring, ...(next?.scoring || {}) },
    selection: {
      ...DEFAULT_POLICY.selection,
      ...(next?.selection || {}),
      counts: { ...DEFAULT_POLICY.selection.counts, ...(next?.selection?.counts || {}) },
      real_estate: { ...DEFAULT_POLICY.selection.real_estate, ...(next?.selection?.real_estate || {}) },
      vehicle: { ...DEFAULT_POLICY.selection.vehicle, ...(next?.selection?.vehicle || {}) },
      license: { ...DEFAULT_POLICY.selection.license, ...(next?.selection?.license || {}) },
      preferDiversity: next?.selection?.preferDiversity ?? DEFAULT_POLICY.selection.preferDiversity
    }
  });
  return ACTIVE;
}
