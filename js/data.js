import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

/* ==========================================================================
   DATA: load once, share everywhere.
   Modules only evaluate once, so every importer gets the same objects. That
   matters because the chart and the map rely on the same feature ids.
   ========================================================================== */

export const geojson = await d3.json('colleges.geojson');

// Give every college a stable id. The chart and the map share this key.
geojson.features.forEach((f, i) => {
  f.properties.id = f.properties.id ?? i;
});

export const allProps = geojson.features.map(f => f.properties);
export const featureById = new Map(geojson.features.map(f => [f.properties.id, f]));

// Colleges missing either value can't be plotted (they still appear on the map).
export const plotData = allProps.filter(
  d => d.avg_net_price != null && d.earnings_10y_post_grad != null
);
export const plotById = new Map(plotData.map(d => [d.id, d]));
