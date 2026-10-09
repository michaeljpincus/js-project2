import { initScatter, initScatterEvents, showHoverRing, hideHoverRing } from './scatter.js';
import { initMapEvents, mapLoaded } from './map.js';
import { buildLegend, buildDropdown, showInfoPlaceholder } from './panels.js';
import { selectCollege, clearSelection } from './selection.js';
import { setupFilters, applyFilters } from './filters.js';

/* ==========================================================================
   MAIN: wiring only. Builds each piece in order and connects the views to the
   selection logic through callbacks, so the chart, map and panels never need
   to import from each other.
   ========================================================================== */

// Every view selects with a fly-to, so one handler covers them all
const onSelect = id => selectCollege(id, { fly: true });

// Static pieces
buildLegend();
showInfoPlaceholder();
buildDropdown({ onSelect, onClear: clearSelection });

// Chart
initScatter();
initScatterEvents({ onSelect });

// Filters (labels update now; the map part is applied once the map has loaded)
setupFilters();
applyFilters();

// Map: needs its style and layer, so everything below waits for the load event
await mapLoaded;

initMapEvents({
  onSelect,
  onClear: clearSelection,
  onHover: showHoverRing,
  onHoverEnd: hideHoverRing
});

applyFilters();   // in case a slider moved before the map finished loading
