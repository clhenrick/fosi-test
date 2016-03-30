var app = app || {};

var map,

  startView,
  countries,
  states,
  highlight,
  highlightActive,
  bboxes,
  regionsLayersRemoved,
  countriesLayersRemoved,
  topoData,
  mapLayers = {},
  mapPlaces = {},
  $mapTooltip,
  $loadingMsg,
  dfd,
  layerCount = 0;

app.map = (function(w, d, $, L) {
// starting center and zoom level of map
startView = {
  center: [45, 0],
  zoom: 2
};

// region names that map to country / admin0 polygons
countries = ['north_america', 'central_america', 'south_america',
  'asia', 'africa', 'middle_east', 'europe', 'oceania'];

// countries that map to states / provinces / admin1 polygons
states = ['USA', 'CAN', 'AUS'];

// for setting map view for some regions & countries
// coordinates order is lat, lon
bboxes = {
  'north_america' : { center: [44.527843, -104.238281], zoom: 3 },
  'central_america': { center: [15.434308, -82.714923], zoom: 5 },
  'south_america': { center: [-25.158848, -60.787488], zoom: 3 },
  'europe': { center: [47.960502, 15.732422], zoom: 4 },
  'asia': { center: [32.863448, 93.419581], zoom: 4 },
  'oceania': { center: [-25.306131, 136.709322], zoom: 4 },
  'middle_east': { center: [27.467433, 48.287763], zoom: 5 },
  'africa': { center: [6.424717, 18.291387], zoom: 3 },
  'USA': { center: [37.579413, -100.239258], zoom: 4 },
  'CAN': { center: [60.478879, -98.525391], zoom: 4 },
  'RUS': { center: [62.734601, 100.634766], zoom: 3 },
  'AUS': { center: [-26.941660, 134.252930], zoom: 4 },
  'ESP': { center: [39.495563, -3.845215], zoom: 6 },
  'FRA': { center: [46.694667, 2.680664], zoom: 5 },
  'NLD': { center: [51.988263, 5.537109], zoom: 7 },
  'PRT': { center: [39.833850, -8.129883], zoom: 6 },
  'NOR': { center: [64.148952, 11.865234], zoom: 4 },
  'NZL': { center: [-42.698586, 173.496094], zoom: 5 }
};

// highlight styles for polygons on mouse over
highlight = {
  weight: 2,
  fillColor: '#CECECE'
};

highlightActive = {
  weight: 2,
  fillColor: '#A8DDB5'
};

/* helper fns to grab an individual polygon / layer from it's parent L.geoJson group  */
function getStatePolygon(country, state) {
  var statePolygon = null;

  mapLayers[country].eachLayer(function(layer) {
    if (layer.feature.properties.postal === state) {
      statePolygon = layer;
    }
  });

  return statePolygon;
}

function getCountryPolygon(region, code) {
  var countryPolygon = null;

  mapLayers[region].eachLayer(function(layer) {
    if (layer.feature.properties.adm0_a3 === code) {
      countryPolygon = layer;
    }
  });

  return countryPolygon;
}

function getRegionPolygon(region) {
  var regionPolygon = null;

  mapLayers.regions.eachLayer(function(layer) {
    if (layer.feature.properties.region === region) {
      regionPolygon = layer;
    }
  });

  return regionPolygon;
}

/* handles receiving app state data from `map:focus` event */
function receiveAppState(e, data) {
  e.preventDefault();

  var region = data.state[0],
      country = data.state[1],
      state = data.state[2],
      view,
      regionPolygon,
      countryPolygon,
      statePolygon;

  if (!region && !country && !state) {
    // for when user hits back button in navbar from a list of countries to regions list 
    clearStatesProvinces();
    regionPolygon = regionsLayersRemoved.getLayers()[0];
    regionsLayersRemoved.removeLayer(regionPolygon);
    mapLayers.regions.addLayer(regionPolygon);
    map.setView(startView.center, startView.zoom);

  } else if (region && !state && !country) {
    // if just a region
    regionPolygon = getRegionPolygon(region);

    if (regionPolygon) {
      // region polygon hasn't been removed
      selectRegion(regionPolygon);
      zoomToFeature(regionPolygon);
    } else {
      // region polygon already removed so set map view manually
      view = bboxes[region];
      map.setView(view.center, view.zoom);
    }

    clearStatesProvinces();

  } else if (region && country && !state) {
    regionPolygon = getRegionPolygon(region);

    if (regionPolygon) {
      selectRegion(regionPolygon);
    }

    countryPolygon = getCountryPolygon(region, country);

    if (countryPolygon) {
      zoomToFeature(countryPolygon);
    } else if (countriesLayersRemoved.getLayers().length) {
      // likely when page loads on a state / province and user hits back UI button
      countryPolygon = countriesLayersRemoved.getLayers()[0];
      zoomToFeature(countryPolygon);
    }

    selectStatesProvinces(region, country);

  } else if (region && country && state) {
    state = state.split('.')[1];
    regionPolygon = getRegionPolygon(region);

    if (regionPolygon) {
      selectRegion(regionPolygon);
    }

    selectStatesProvinces(region, country);

    statePolygon = getStatePolygon(country, state);

    if (statePolygon) {
      zoomToFeature(statePolygon);
    }
  }
}

/* triggers map:navigation:goto event with app state data when a polygon is clicked on */
function emitState(arr) {
  if (typeof arr !== 'object' && !arr.length) {
    return;
  }

  var data = { state: arr };
  // "data" should be formatted like { state: ['region_name', 'code', 'postal']}
  $(document).trigger('FOSI:map:navigation:goto', data);
}

function getInitialState() {
  // see if there is intial state in the DOM
  var initialState = $('#map').data();

  if (!$.isEmptyObject(initialState)) {
    var dataToEmit = [
      initialState.defaultRegion,
      initialState.defaultCountry,
      initialState.defaultState
    ];

    $(document).trigger('FOSI:map:focus', { state: dataToEmit });
  }
}

function initMap() {
  map = L.map('map', {
    scrollWheelZoom: false,
    center: startView.center,
    zoom: startView.zoom,
    zoomControl: false
  });

  var zoomBtn = L.control.zoom({position: 'bottomright'});

  zoomBtn.addTo(map);

  regionsLayersRemoved = L.featureGroup();
  countriesLayersRemoved = L.featureGroup();
}

function getMaxGeo(feature) {
  var props = feature.properties,
      region = props.region,
      country = props.adm0_a3 || props.sr_adm0_a3,
      postal = props.postal,
      geo = '';

  if (region && !country && !postal) {
    geo = 'region';
  } else if (region && country && !postal) {
    geo = 'admin0';
  } else if (country && postal) {
    geo = 'admin1';
  } else {
    geo = null;
  }

  return geo;
}

function getGeoName(feature) {
  var props = feature.properties,
      region = props.region,
      country = props.adm0_a3 || props.sr_adm0_a3,
      postal = props.postal,
      name = '';

  if (region && !country && !postal) {
    name = region;
  } else if (region && country && !postal) {
    name = country;
  } else if (country && postal) {
    name = country + '.' + postal;
  } else {
    name = null;
  }

  return name;
}

function hasCMSContent(geo, name) {
  // determines if the polygon should be styled and clickable
  // depends on data gained from the CMS
  if (!mapPlaces || !geo || !name) {
    return;
  }

  if (geo === 'region' && mapPlaces.regions.indexOf(name) > -1) {
    return true;
  } else if (geo === 'admin0' && mapPlaces.countries.hasOwnProperty(name)) {
    return true;
  } else if (geo === 'admin1' && mapPlaces.states.hasOwnProperty(name)) {
    return true;
  }

  return false;
}

function getCMSAttributes(geo, name) {
  // grab the name and path for a given country or state / province
  var attributes = {};

  if (!mapPlaces || !geo || !name) {
    return;
  }

  if (geo === 'admin0' && mapPlaces.countries.hasOwnProperty(name)) {
    attributes.name = mapPlaces.countries[name].name;
    attributes.path = mapPlaces.countries[name].path;
  } else if (geo === 'admin1' && mapPlaces.states.hasOwnProperty(name)) {
    attributes.name = mapPlaces.states[name].name;
    attributes.path = mapPlaces.states[name].path;
  }

  return attributes;
}

function style(feature) {
  var className, fillColor;

  if (hasCMSContent(getMaxGeo(feature), getGeoName(feature))) {
    className = 'active';
    fillColor = '#E0F3DB';
    feature.properties.active = true;
  } else {
    className = 'not_active';
    fillColor = '#CECECE';
    feature.properties.active = false;
  }

  return {
    weight: 1,
    opacity: 1,
    color: '#FFFFFF',
    fillColor: fillColor,
    fillOpacity: 1,
    lineJoin: 'round',
    className: className
  };
}

function getMouseCoords(e) {
  var obj = {};
  obj.x = e.clientX;
  obj.y = e.clientY;

  return obj;
}

function createTooltip() {
  var body = d.body;
  L.DomUtil.create('div', 'map-tooltip', body);
  $mapTooltip = $('.map-tooltip');
}

function positionTooltip(e) {
  if ($mapTooltip.css('display') === 'block') {
    var coords = getMouseCoords(e),
        winWidth = $(w).width(),
        ttWidth = $mapTooltip.width(),
        ttHeight = $mapTooltip.height(),
        left = 0,
        top = 0;

    if (coords.x > (winWidth - ttWidth - 25)) {
      left = coords.x - ttWidth - 35;
    } else {
      left = coords.x + 12;
    }

    if (coords.y < (ttHeight + 10)) {
      top = coords.y + 20;
    } else {
      top = coords.y - 40;
    }

    $mapTooltip.css({
      'top': top,
      'left': left
    });
  }
}

/* handle mouseover events on polygons */
function handleMouseOver(e) {
  highlightFeature(e);
  revealTooltip(e);
}

function revealTooltip(e) {
  // reveal the popup / tooltip & create content for it
  var props = e.target.feature.properties,
      label,
      template = '<p>{label}</p>',
      html;

  if (props.region && !props.adm0_a3 && !props.postal) {
    label = props.region.split('_').join(' ');
  } else if (props.region && props.adm0_a3 && !props.postal) {
    label = props.name;
  } else if (props.sr_adm0_a3 && props.postal) {
    label = props.name;
  }

  if (label) {
    html = L.Util.template(template, {label: label});
  }

  $mapTooltip.html(html);
  $mapTooltip.css('display', 'block');
}

function highlightFeature(e) {
  var layer = e.target,
      active = layer.feature.properties.active;

  if (active) {
    layer.setStyle(highlightActive);      
  } else {
    layer.setStyle(highlight);
  }

  if (!L.Browser.ie && !L.Browser.opera) {
    layer.bringToFront();
  }
}

/* handle mouseout events on polygons */
function handleMouseOut(e) {
  resetHighlight(e);
  hideTooltip(e);
}

function hideTooltip(e) {
  // close the popup / tooltip
  $mapTooltip.html('');
  $mapTooltip.css('display', 'none');
}

function resetHighlight(e) {
  mapLayers.regions.resetStyle(e.target);
}

function zoomToFeature(e) {
  // expects object.target
  var geo, props;

  if (e.target) {
    props = e.target.feature.properties;
  } else if (e.feature) {
    props = e.feature.properties;
  }

  if (props.region && !props.adm0_a3) {
    props.region = props.region.split(' ').join('_');
    geo = props.region;
  } else if (props.adm0_a3 && !props.postal) {
    geo = props.adm0_a3;
  } else if (props.postal) {
    geo = props.postal;
  } else {
    map.fitBounds(e.target.getBounds());
  }

  if (geo && bboxes[geo]) {
    var view = bboxes[geo];
    map.setView(view.center, view.zoom);
  } else if (!e.target) {
    map.fitBounds(e.getBounds());
  } else {
    map.fitBounds(e.target.getBounds());
  }
}

/* layer selection fns */

function selectRegion(regionPolygon) {
  // loads countries polygons for a region &
  // removes the corresponding region polygon

  if (typeof regionPolygon !== 'object') {
    regionPolygon = getRegionPolygon(regionPolygon);
    if (!regionPolygon) { return; }
  }
  displayLoadingMsg();
  showCountries(regionPolygon.feature);
  removeRegionPolygon(regionPolygon);
}

function selectStatesProvinces(region, adm0_a3) {
  // handles adding admin1 data, removing & adding country polygon,
  // removing any previous admin1 data
  // called when country polygon is clicked on or a region name is passed via app state event
  // `region` and `adm0_a3` are assummed to be strings

  // if the country is USA, CAN, AUS load states provinces data
  if (states.indexOf(adm0_a3) > -1) {
    showStatesProvinces(adm0_a3);
    var country = getCountryPolygon(region, adm0_a3);
    removeCountryPolygon(region, country);
  } else if (countriesLayersRemoved.getLayers().length) {
    // if not USA, CAN, AUS then make sure any removed country polygons
    // are added back to the map
    clearStatesProvinces();
  }

  // remove any other existing admin1 data on the map
  var layerName, mLayer;
  var keys = Object.keys(mapLayers), i = keys.length;

  while (--i) {
    layerName = keys[i];
    mLayer = mapLayers[layerName];

    if (states.indexOf(layerName) > -1 && adm0_a3 !== layerName &&
      map.hasLayer(mapLayers[layerName])) {
      map.removeLayer(mapLayers[layerName]);
    }
  }
}

function clearStatesProvinces() {
  // determine if state polygons should be removed
  // and if a country polyon should be added back
  if (countriesLayersRemoved.getLayers().length) {
    var mLayer = countriesLayersRemoved.getLayers()[0];
    var countryName = mLayer.feature.properties.adm0_a3;
    var regionName = mLayer.feature.properties.region.split(' ').join('_').toLowerCase();
    map.removeLayer(mapLayers[countryName]);
    mapLayers[regionName].addLayer(mLayer);
    mapLayers[regionName].resetStyle(mLayer);
    countriesLayersRemoved.removeLayer(mLayer);
  }
}

function countLayers(layer) {
  // for displaying loading GIF

  if (!layer) {
    return;
  }

  if (!layer._layers) {
    layerCount += 1;
  } else {
    Object.keys(layer._layers).forEach(function(l) {
      layerCount += 1;
    });
  }
}

/* onEachFeature is for L.geoJson options */

function determineOnEachFeature(featureName) {
  // which onEachFeature does a layer get?
  if (featureName === 'regions') {
    return regionsOnEachFeature;
  } else if (countries.indexOf(featureName) > -1) {
    return countriesOnEachFeature;
  } else if (states.indexOf(featureName) > -1) {
    return statesOnEachFeature;
  } else {
    return null;
  }
}

function regionsOnEachFeature(feature, layer) {
  var regionName = feature.properties.region
    .split(' ').join('_').toLowerCase();

  countLayers(layer);

  layer.on({
    mouseover: handleMouseOver,
    mouseout: handleMouseOut,
    click: function(e) {
      if (hasCMSContent('region', regionName)) {
        displayLoadingMsg();
        zoomToFeature(e);
        selectRegion(layer);
        clearStatesProvinces();
        hideTooltip();
        emitState([regionName]);
      }
    }
  });
}

function countriesOnEachFeature(feature, layer) {
  var props = feature.properties,
      regionName = props.region
        .split(' ').join('_').toLowerCase(),
      countryName = props.adm0_a3;

  if (hasCMSContent('admin0', countryName)) {
      var cmsData = getCMSAttributes('admin0', countryName);
      props.path = cmsData.path;
      props.name_fos = cmsData.name;
  }

  countLayers(layer);

  layer.on({
    mouseover: handleMouseOver,
    mouseout: handleMouseOut,
    click: function(e) {
      if (hasCMSContent('admin0', countryName)) {
        // if country has no admin1, set window.location
        if (!(states.indexOf(countryName) > -1)) {
          w.location = props.path;
        } else {
          displayLoadingMsg();
          zoomToFeature(e);
          selectStatesProvinces(regionName, props.adm0_a3);
          hideTooltip();
          emitState([regionName, countryName]);
        }
      }
    }
  });
}

function statesOnEachFeature(feature, layer) {
  var props = feature.properties,
      regionName = props.region
        .split(' ').join('_').toLowerCase(),
      countryName = props.sr_adm0_a3,
      stateName = props.postal,
      countryState = countryName + '.' + stateName;

  if (hasCMSContent('admin1', countryState)) {
      var cmsData = getCMSAttributes('admin1', countryState);
      props.path = cmsData.path;
      props.name_fos = cmsData.name;
  }

  countLayers(layer);

  layer.on({
    mouseover: handleMouseOver,
    mouseout: handleMouseOut,
    click: function(e) {
      if (hasCMSContent('admin1', countryState)) {
        // zoomToFeature(e);
        // hideTooltip();
        // emitState([regionName, countryName, countryState]);
        w.location = props.path;
      }
    }
  });
}

function showStatesProvinces(country) {
  mapLayers[country] = getTopoJSONLayer(country);
  var mLayer = mapLayers[country];

  if (!map.hasLayer(mLayer)) {
    map.addLayer(mLayer);
  }
}

function removeCountryPolygon(region, country) {
  // removes a country polygon layer from mapLayers[region_name]
  // should only be called for the USA, CAN, AUS
  // region is a region name (string) and country is a polygon layer for a specific country

  if (!mapLayers[region].hasLayer(country)) {
    return;
  }

  // if no admin1 data is already displayed & a country polygon hasn't been removed
  if (!countriesLayersRemoved.getLayers().length)
  {
    countriesLayersRemoved.addLayer(country);
    mapLayers[region].removeLayer(country);
  }
  // else if a country polygon has already been removed & admin1 data is already displayed
  else if (countriesLayersRemoved.getLayers().length)
  {
    clearStatesProvinces();
    countriesLayersRemoved.addLayer(country);
    mapLayers[region].removeLayer(country);
  }
}


function showCountries(region) {
  // takes a region name & uses it to load country polygons for that region
  var layerName = region.properties.region.split(' ').join('_');
  mapLayers[layerName] = getTopoJSONLayer(layerName);
  var mapLayer = mapLayers[layerName];

  if (!map.hasLayer(mapLayer)) {
    displayLoadingMsg();
    mapLayer.addTo(map);
  }

  // remove any existing country polygons if already on the map
  // and add back the region polygons
  var layer;
  for (layer in mapLayers) {
    if (countries.indexOf(layer) > -1 && layerName !== layer && map.hasLayer(mapLayers[layer])) {
      map.removeLayer(mapLayers[layer]);
    }
  }
}

function removeRegionPolygon(region) {
  // takes a region polygon layer from mapLayers.regions;

  if (!mapLayers.regions.hasLayer(region)) {
    return;
  }

  // if no countries are displayed, just remove the region polygon from mapLayers.regions
  if (!regionsLayersRemoved.getLayers().length)
  {
    regionsLayersRemoved.addLayer(region);
    mapLayers.regions.removeLayer(region);
  }
  // other wise if a region polygon has already been removed
  // add it back before removing the current region
  else if (regionsLayersRemoved.getLayers().length)
  {
    var layerToAdd = regionsLayersRemoved.getLayers()[0];
    regionsLayersRemoved.removeLayer(layerToAdd);
    regionsLayersRemoved.addLayer(region);
    mapLayers.regions.removeLayer(region);
    mapLayers.regions.addLayer(layerToAdd);
    mapLayers.regions.resetStyle(layerToAdd);
  }
}

function loadRegions() {
  mapLayers.regions = getTopoJSONLayer('regions');
  mapLayers.regions.addTo(map);
}

function createLoadingMsg() {
  var mapDiv = d.getElementById('map');
  L.DomUtil.create('div', 'loading-msg', mapDiv);
  $loadingMsg = $('.loading-msg');
  $loadingMsg.addClass('hidden');
  $loadingMsg.html('<p>Loading...</p>');
}

function displayLoadingMsg() {
  if ($loadingMsg.hasClass('hidden')) {
    $loadingMsg.removeClass('hidden');
  }
}

function hideLoadingMsg() {
  if (!$loadingMsg.hasClass('hidden')) {
    $loadingMsg.addClass('hidden');
  }
}

function firstLoad() {
  // when the map first loads check for inital state & load the regions polygons
  loadRegions();
  getInitialState();
  hideLoadingMsg();
}

function getTopoJSONLayer(featureName) {
  // this actually returns a L.geoJson layer, not a topojson layer!
  var feature, onEachFeature, layer;

  if (!mapLayers[featureName])
  {
    feature = topojson.feature(topoData, topoData.objects[featureName]);
    onEachFeature = determineOnEachFeature(featureName);
    layer = new L.geoJson(feature, {
      style: style,
      onEachFeature: onEachFeature
    });
  }
  else
  {
    layer = mapLayers[featureName];
  }

  return layer;
}

function loadTopoJSON() {
  var dataToLoad;

  if (L.Browser.ie) {
    dataToLoad = 'fosi_lowres.json';
  } else {
    dataToLoad = 'fosi.json';
  }

  $.getJSON(dataToLoad, function(data) {
    topoData = data;
    firstLoad();
  });
}

function getMapPlaces() {
  $.getJSON('./new-map-places.json', function(data){
    mapPlaces = data;
    loadTopoJSON();
  });
}

// function onLayerAdd() {
//   map.on('layeradd', function(){
//     if (layerCount > 0) {
//       // display loading GIF
//       layerCount -= 1;

//       if (layerCount === 0) {
//         // hide loading GIF
//         layerCount = 0;
//         console.log('all layers added!');
//       }
//     } 
//   });
// }

function listeners() {
  // test via: $(document).trigger('map:focus', {state: ['africa', null, null] });
  $(document).on('FOSI:map:focus', receiveAppState);
  
  // test listener for emiting state, remove for production
  $(document).on('FOSI:map:navigation:goto', function(e, data) {
    console.log(data);
  });
  
  // position the .map-tooltip
  $('#map').mousemove(positionTooltip);
  
  // hide the loading GIF when layers are being added to the map
  map.on('moveend', function(e){
    hideLoadingMsg();
  });

}

function init() {
  initMap();
  // createTooltip();
  createLoadingMsg();
  displayLoadingMsg();
  getMapPlaces();
  listeners();
}

return {
  init: init
};

})(window, document, jQuery, L);