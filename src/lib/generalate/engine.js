export function ordinationEligible(state, petitionerId) {
  if (staffGradeFor(state, petitionerId) !== 'coadjutors') return false;
  const pet = getGameData().petitioners.find((p) => p.id === petitionerId);
  const rec = state.petitioners[petitionerId];
  const years = (rec && rec.yearsInSociety) ?? (pet ? pet.yearsInSociety : 0) ?? 0;
  // Years increase as the campaign progresses; use entry year + elapsed.
  const entryYear = (rec && rec.entryYear) ?? (pet ? pet.entryYear : state.year) ?? state.year;
  return (state.year - entryYear + years) >= 12;
}

/**
 * Compute a petitioner's effective years in the Society at the current game year.
 * Returns: base yearsInSociety + elapsed years since entryYear.
 * Safe for partial or stale saves; never throws when data is missing.
 */
export function yearsInSociety(state, petitionerId) {
  try {
    const g = getGameData();
    const pet = g ? (g.petitioners || []).find((p) => p.id === petitionerId) : null;
    const rec = (state && state.petitioners) ? state.petitioners[petitionerId] : null;
    const base = (rec && typeof rec.yearsInSociety === 'number')
      ? rec.yearsInSociety
      : (pet && typeof pet.yearsInSociety === 'number' ? pet.yearsInSociety : 0);
    const entryYear = (rec && typeof rec.entryYear === 'number')
      ? rec.entryYear
      : (pet && typeof pet.entryYear === 'number' ? pet.entryYear : (state && typeof state.year === 'number' ? state.year : 0));
    const yearNow = (state && typeof state.year === 'number') ? state.year : 0;
    return base + (yearNow - entryYear);
  } catch (e) {
    return 0;
  }
}

/**
 * Ordain an eligible scholastic as a priest. The General's decision, not automatic.
 * Sets an override so staffGradeFor returns 'fathers'. Cannot be undone.
 */
export function ordainPriest(state, petitionerId) {
