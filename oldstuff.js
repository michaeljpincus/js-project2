map.addSource('radar', {
    type: 'raster',
    tiles: [
        'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png'
    ],
    tilesize: 256,
    attribution: 'Radar: NOAA NEXRAD via Iowa Environmental Mesonet'
  });


  map.addLayer({
    id: 'radar-layer',
    type: 'raster',
    source: 'radar',
    paint: { 'raster-opacity': 0.7 }
  }, 'cities');
});



{
      "id": "hillshade",
      "type": "hillshade",
      "source": "terrain",
      "paint": {
        "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 3, 0.3, 8, 0.5, 12, 0.5],
        "hillshade-shadow-color": "hsl(210, 8%, 45%)",
        "hillshade-highlight-color": "#ffffff",
        "hillshade-accent-color": "hsl(210, 8%, 60%)",
        "hillshade-illumination-direction": 315
      }
    },