import * as maplibregl from 'https://unpkg.com/maplibre-gl@^6.12.0/dist/maplibre-gl.mjs';
import {
  INITIAL_CENTER, INITIAL_ZOOM, OWNERSHIP_COLORS, STUDENT_MAX, radiusScale
} from './config.js';
import { geojson } from './data.js';
import { state } from './state.js';
import { popupHTML } from './helpers.js';
import { isMobile } from './config.js'

/* ==========================================================================
   MAP: creation, the 'colleges' layer, and map interaction.
   This module knows nothing about the chart or the selection logic. Anything
   that needs them is passed in as a callback to initMapEvents().
   ========================================================================== */

const resetButton = document.getElementById('reset-zoom');

export const map = new maplibregl.Map({
  container: 'map',
  center: INITIAL_CENTER,
  zoom: isMobile ? 5 : INITIAL_ZOOM,
  minZoom: isMobile ? 3 : 5.5,
  style: 'basemap.json'
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

// Hover popup (follows the cursor) and selected popup (stays on the clicked college)
export const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
export const selectedPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

function addCollegeLayer() {
  map.addSource('colleges', {
    type: 'geojson',
    data: geojson,        // same object as the chart, so ids match
    generateId: true
  });

  map.addLayer({
    id: 'colleges',
    type: 'circle',
    source: 'colleges',
    paint: {
      'circle-color': [
        'step', ['get', 'ownership'],
        OWNERSHIP_COLORS[0],
        1, OWNERSHIP_COLORS[1],
        2, OWNERSHIP_COLORS[2],
        3, OWNERSHIP_COLORS[3]
      ],
      'circle-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        1,
        0.6
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'student_pop'],
        0, radiusScale(0),
        STUDENT_MAX, radiusScale(STUDENT_MAX)
      ]
    }
  }, 'cities');   // draw beneath the 'cities' layer
}

// Resolves once the style has loaded and the 'colleges' layer exists.
export const mapLoaded = new Promise(resolve => {
  map.on('load', () => {
    addCollegeLayer();
    state.mapReady = true;
    resolve();
  });
});

/**
 * Wire up map interaction. Call after `mapLoaded` has resolved.
 *   onSelect(id)    a college was clicked
 *   onClear()       empty map was clicked, or the reset button was pressed
 *   onHover(id)     the cursor is over a college
 *   onHoverEnd()    the cursor left the colleges layer
 */
export function initMapEvents({ onSelect, onClear, onHover, onHoverEnd }) {
  let hoveredFeatureId = null;   // MapLibre's generated id, used for feature-state

  function clearHoverState() {
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: 'colleges', id: hoveredFeatureId }, { hover: false });
      hoveredFeatureId = null;
    }
  }

  // Hover
  map.on('mousemove', 'colleges', (e) => {
    const feature = e.features[0];
    onHover(feature.properties.id);

    if (hoveredFeatureId !== feature.id) clearHoverState();
    hoveredFeatureId = feature.id;
    map.setFeatureState({ source: 'colleges', id: hoveredFeatureId }, { hover: true });

    map.getCanvas().style.cursor = 'pointer';

    // The selected college already has its own popup.
    if (feature.properties.id === state.selectedId) {
      hoverPopup.remove();
      return;
    }

    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(popupHTML(feature.properties))
      .addTo(map);
  });

  map.on('mouseleave', 'colleges', () => {
    clearHoverState();
    onHoverEnd();
    hoverPopup.remove();
    map.getCanvas().style.cursor = '';
  });

  // Click: selects a college, or clears if clicking empty map
  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ['colleges'] });
    if (hits.length) onSelect(hits[0].properties.id);
    else onClear();
  });

  // Reset-zoom button
  map.on('zoom', () => {
    resetButton.style.display = map.getZoom() > INITIAL_ZOOM ? 'block' : 'none';
  });

  resetButton.addEventListener('click', () => {
    onClear();
    map.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM, duration: 1000 });
  });
}
