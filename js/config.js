import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

/* ==========================================================================
   CONFIG: constants and shared scales. No dependencies on other modules.
   ========================================================================== */

export const INITIAL_CENTER = [-75.93286341656814, 42.6617285841208];
export const INITIAL_ZOOM = 6.5;

// One color list shared by the scatterplot and the map.
// Index 0 is the fallback, then ownership 1, 2, 3.
export const OWNERSHIP_COLORS = ['gray', '#009E73', '#0072B2', '#E69F00'];
export const SELECTED_COLOR = 'crimson';

export const DOT_RADIUS = 4;
export const DOT_RADIUS_SELECTED = 8;

export const MARGIN = { top: 40, right: 20, bottom: 50, left: 70 };
export const MIN_PLOT_HEIGHT = 80;

export const STUDENT_MAX = 100000;
export const radiusScale = d3.scaleLinear()
  .domain([0, STUDENT_MAX])
  .range([5, 100]);   // pixel radius on the map

// Shared color scale: ownership code -> color
export const color = d3.scaleThreshold()
  .domain([1, 2, 3])
  .range(OWNERSHIP_COLORS);

// Mobile handler for zoom 
export const isMobile = window.matchMedia("(max-width: 768px)").matches;