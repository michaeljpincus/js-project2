import { featureById } from './data.js';
import { state } from './state.js';
import { popupHTML } from './helpers.js';
import { map, hoverPopup, selectedPopup } from './map.js';
import { highlightDot } from './scatter.js';
import { showInfo, showInfoPlaceholder, setDropdownValue } from './panels.js';

/* ==========================================================================
   SELECTION: the bridge between chart, map and panels.
   Every view calls selectCollege(id) / clearSelection(); these update all of
   them. This is the only module that imports from the map, the chart and the
   panels at once.
   ========================================================================== */

function flyToId(id) {
  map.flyTo({ center: featureById.get(id).geometry.coordinates, zoom: 10 });
}

export function selectCollege(id, { fly = false } = {}) {
  const feature = featureById.get(id);
  if (!feature) return;

  state.selectedId = id;
  setDropdownValue(id);
  showInfo(feature.properties);
  hoverPopup.remove();   // avoid two identical popups
  highlightDot(id);

  selectedPopup
    .setLngLat(feature.geometry.coordinates)
    .setHTML(popupHTML(feature.properties))
    .addTo(map);

  if (fly) flyToId(id);
}

export function clearSelection() {
  state.selectedId = null;
  selectedPopup.remove();
  setDropdownValue('');
  showInfoPlaceholder();
  highlightDot(null);
}
