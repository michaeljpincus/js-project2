/* ==========================================================================
   STATE: shared mutable state.
   An exported `let` can't be reassigned from another module, so the values
   live as properties on one object that every module can read and write.
   ========================================================================== */

export const state = {
  selectedId: null,   // id of the selected college, or null
  mapReady: false     // true once the map style and the 'colleges' layer exist
};
