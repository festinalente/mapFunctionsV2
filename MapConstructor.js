function MapConstructor (baseHTMLElement, height) {
  if (typeof baseHTMLElement === 'string') {
    baseHTMLElement = document.querySelector(baseHTMLElement);
  }
  if (!height) {
    height = '100vh';
  }

  let locationOptions;
  let map;
  let routeConstructor;
  let typeDropdownOption = false;
  let displayed = false;
  let buttonBase;
  // contains the reference to the individual markers:
  const markerTracker = [];
  console.warn(`Marker tracker needs to update according to the map view,
  zoom should be limited to avoid loading too much data.`);
  // contains the type of servive the marker represents to filter by type:
  const indexByType = [];
  const radiae = L.layerGroup();
  const markers = new L.MarkerClusterGroup({ spiderfyDistanceMultiplier: 2 });
  const coordinates = document.createElement('div');
  coordinates.classList.add('coordinatesDiv');

  /**
   * @type {function}
   * @fires L.map (leaflet.js)
   * @param {string} tileURL
   * @returns itself
   * @description Generates a map passed initially to the constructor and returns itself. 
   * Typically the first function to be called in the map constructor.
   */

  this.generateMap = (tileURL) => {
    if (displayed === false) {
      const serviceArea = document.createElement('div');
      baseHTMLElement.appendChild(serviceArea);
      serviceArea.appendChild(coordinates);
      serviceArea.style.height = height;
      // added width
      serviceArea.style.width = '100%';

      map = L.map(serviceArea, {
        layers: [
          L.tileLayer(tileURL, {
            attribution: "<a href='https://www.mapbox.com/about/maps/'>Mapbox</a> © <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
          })],
        preferCanvas: true,
        center: [37.09681, -8.41965],
        zoom: 11
      });
      L.control.scale().addTo(map).setPosition('bottomright');
    }
    displayed = true;
    // add this layer only once:
    radiae.addTo(map);
    return this;
  };

  /**
   * @return {Object} map returns the leaflet map object belonging to the instance.
   */
  this.map = () => {
    return map;
  };

  /**
   * @param {Object} config
   * @param {string} config.route The URL to an OSRM service from which routes are created and fetched.
   * @param {string} config.profile An OSRM instance may have several types of service, typically car, bicycle.
   * @param {Object|Object[]} config.points An latLng object, method or an array with lat lng points [lat, lng, lat, lng]
   * requiring at least 2 points
   * @fires L.Routing.control (leaflet routing machine)
   * @return itself
   * @description this function can be extended to control other LRM options via config.
   */
  this.enableRouting = (config) => {
    const innerThis = this;

    if (routeConstructor) {
      return;
    }
    routeConstructor = L.Routing.control({
      serviceUrl: config.route,
      timeout: 5000,
      profile: config.profile,
      show: false,
      waypoints: config.points,
      addWaypoints: false,
      draggableWaypoints: false,
      routeWhileDragging: false,
      createMarker: (i, wp) => {
        // disable marker on circle marker (provider marker)
        return false;
      },
      lineOptions: {
        styles: [{ color: 'blue', opacity: 1, weight: 4, width: '4px' }]
      }
    });

    routeConstructor.on('routingerror', (e)=> {
      alert('Ops, we couldn\'t find a route between these points');
      // return;
    });

    routeConstructor.on('routeselected', function(e) {
      const routeInfo = innerThis.computeRouteInfo(e.route);
      alert(`This provider is ${routeInfo.km} km away from your chosen location,
      a trip of ${routeInfo.carJourneyTime} duration approximately.`);
    }).addTo(map);

    return this;
  };

  /**
   * @param {Object[]} points in various formats, typically two points [lat, lng, lat, lng]
   * @fires LRM#setWaypoints
   */
  this.route = (points) => {
    routeConstructor.setWaypoints(points);
  };

  /**
   * @param {Object} route information for LRM
   * @returns  a function that returns an object containing route distance and estimated travel time.
   */
  this.computeRouteInfo = (route) => {
    const meters = route.summary.totalDistance;
    const km = meters / 1000;
    const seconds = route.summary.totalTime;
    const secPerKm = seconds / km;

    return returnTime(km, secPerKm);

    /**
     * @param {int} km
     * @param {int} timeperkm
     * @returns an object including distance and car journey time.
     */
    function returnTime (km, timeperkm) {
      const skm = km * timeperkm;
      const secNum = parseInt(skm, 10);
      const h = Math.floor(secNum / 3600);
      const m = Math.floor(secNum / 60) % 60;
      const s = secNum % 60;

      const minnought = function (mh) {
        if (mh.toString().length === 1 && mh === m) {
          return ':0';
        }
        if (mh.toString().length === 1 && mh === h) {
          return '0';
        } else {
          return ':';
        }
      };
      return {
        carJourneyTime: `${minnought(h)}${h}${minnought(m)}${m}:${s}`,
        km: km
      };
    }
  };

  /**
   * loadProviders
   * @type {function}
   * @param {boolean} [true] cards -Requests rendered template if true, raw json if false.
   * @param {string} link -Link from which to request information
   * @description This function used to be called loadProvidersAndSports. It loads all
   * provider data into the the map.
   * @fires loadMarkers
   * @fires typeDropdown Generates a dropdown that toggles the visibility of different services
   * @returns itself
   */
  this.loadProviders = (cards, link) => {
    // location-providers
    const innerThis = this;
    const bounds = map.getBounds();
    xhr({ coordinates: bounds, cards: cards }, link, (callback) => {
      if (cards) {
        const cardDiv = document.createElement('div');
        baseHTMLElement.parentElement.appendChild(cardDiv);
        cardDiv.innerHTML = callback;
        // this is to reduce round trips, print non precious data to template:
        if (cardDiv.firstChild.dataset.supplierdata) {
          const data = JSON.parse(cardDiv.firstChild.dataset.supplierdata);
          // load the data in the template like guides app.
          innerThis.loadMarkers(data, map);
          innerThis.typeDropdown(data);
          innerThis.viewServiceCoverage();
          console.warn('remove inner call to typeDropdown etc so these can be called sepearately on the constructor');        } else {
          innerThis.typeDropdown([]);
          innerThis.viewServiceCoverage();
        }
      } else {
        innerThis.loadMarkers(callback, map);
        innerThis.typeDropdown(callback);
        innerThis.viewServiceCoverage();
      }
    });
    return this;
  };

  /**
   * @param {boolean} cards -If replies to queries made through this call should
   * rendered and sent or sent as a raw object string.
   * @param {string} link -Takes a a link to which to post requests for data.
   * @return {function} A function call on mapEvent(), to which the aforementioned parameters are passed.
   * @description This function reloads providers based on changes to the ares shown by the map
   * emmited by leaflet (load, move, resize)
   */
  this.loadProvidersMapEvents = (cards, link) => {
    /**
     * @fires loadProviders on map move end, 'moveend'.
     */
    map.on('load', (e) => {
      this.loadProviders(sport, cards, link);
    });

    map.on('moveend', (e) => {
      if (map.offsetWidth > 0 && map.offsetHeight > 0) {
        this.loadProviders(sport, cards, link);
      }
    });

    map.on('resize', (e) => {
      // if the map is visible:
      if (map.offsetWidth > 0 && map.offsetHeight > 0) {
        this.loadProviders(sport, cards, link);
      }
    });
    return this;
  };

  /**
   * @description simply generates a div before the map to add buttons to rather than passing a div. 
   * @returns itself
   */
  this.generateButtonBase = () => {
    buttonBase = document.createElement('div');
    buttonBase.classList.add('rentalsMapButtons');
    buttonBase.classList.add('center');
    baseHTMLElement.parentElement.insertBefore(buttonBase, baseHTMLElement);
    return this;
  };

  /**
   * @param {Object} guides -An object containing all the information to load markers onto the map
   * @calls makeMarkers
   */
  this.loadMarkers = (data) => {
    const providers = (typeof data !== 'object') ? JSON.parse(data) : data;
    for (let i = 0; i < providers.length; i++) {
      // split and make diffent markers for different services by the same provider
      if (providers[i].services.length <= 1) {
        console.log(providers[i].providerID);
        this.makeMarkers(providers[i], 0);
      } else {
        for (let j = 0; j < providers[i].services.length; j++) {
          this.makeMarkers(providers[i], j);
        }
      }
      if (i === providers.length - 1) {
        markers.addTo(map);
        if ((typeof (folder) !== 'undefined')) {
          folder.reattachEvents();
        }
      }
    }
    // no marker, wipe the slate:
    if (providers.length === 0) {
      markers.clearLayers();
      markerTracker.length = 0;
    }
  };

  /**
   * @type {function}
   * @param {Object[]} data An array representing all the provider data in a given area: 
   * @description Generates a dropdown allowing the different types of service in an area to be toggled. 
   * @fires internal function makeOptions()
   *
   */
  this.typeDropdown = (data) => {
    console.log('type dropdown fired');

    const servicesAr = [];
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    let select;
    // prevent duplication
    if (typeDropdownOption === false) {
      select = document.createElement('select');
      select.classList.add('rentalTypeSelect');
      buttonBase.appendChild(select);

      const option = document.createElement('option');
      option.setAttribute('disabled', true);
      option.setAttribute('selected', true);
      option.textContent = 'Select service type:';
      select.appendChild(option);

      typeDropdownOption = true;
      makeOptions(data);
    } else {
      while (select.children.length > 1) {
        select.removeChild(select.lastChild);
      }
      makeOptions(data);
    }

    function makeOptions (data) {
      data.forEach((provider, i) => {
        provider.services.forEach((e, j) => {
          e = `${e['item type']} ${e.service}`;
          if (servicesAr.includes(e) === false) {
            const optionNew = document.createElement('option');
            optionNew.setAttribute('value', e);
            optionNew.textContent = e;
            select.appendChild(optionNew);
            servicesAr.push(e);
          }
          if (i === data.length - 1 && j === provider.services.length - 1) {
            console.log('select option appended');
          }
        });
      });
      // attach events
      select.addEventListener('change', (evt) => {
        for (let i = markerTracker.length - 1; i >= 0; --i) {
          if (evt.target.value === markerTracker[i].type) {
            markerTracker[i].providerMarkers.forEach((e) => {
              markers.addLayer(e);
            });
          } else {
            markerTracker[i].providerMarkers.forEach((e) => {
              markers.removeLayer(e);
            });
          }
        }
      });
    }
  };

  /**
   * @description View service coverage.
   * @todo make dependent on typeDropdown.
   */
  this.viewServiceCoverage = () => {
    const div = document.createElement('div');
    div.classList.add('simpleFlexRow');
    const checkBox = document.createElement('input');
    checkBox.type = 'checkbox';
    checkBox.name = 'serviceCoverage';
    checkBox.id = 'serviceCoverage';
    checkBox.value = 'value';

    const label = document.createElement('label');
    label.htmlFor = 'serviceCoverage';
    label.innerHTML = 'View coverage for this service in this area: ';

    div.appendChild(label);
    div.appendChild(checkBox);
    buttonBase.appendChild(div);
    console.log('check box added to map');
    const servicesLayers = [];

    checkBox.addEventListener('click', () => {
      const service = document.querySelector('.rentalTypeSelect');
      if (service.selectedIndex === 0) {
        alert('Select a service type from the dropsdown menu above the map');
        service.addEventListener('change', () => {
          toggle();
        });
        return;
      }
      toggle();
    });

    function toggle () {
      if (checkBox.checked) {
        // get markers
        markerTracker.forEach((marker) => {
          const coordinates = marker.provider.logistics['delivery base location'];
          const radius = parseInt(marker.provider.logistics['delivery radius']) * 1000;
          const circle = L.circle(coordinates, radius);
          servicesLayers.push(circle);
          circle.addTo(radiae);
        });
      } else {
        servicesLayers.forEach((circle) => {
          circle.removeFrom(radiae);
        });
      }
    }

    return this;
  };

  /**
   * @param {Object} provider Object containing the information on a provider inclusing services and logistical constraints
   * @param {*} serviceIndex
   * @description Example Object { _id: "63163188a59976bd573d480c", providerID: "OneBike Lda.", location: {…},
   *  logistics: Object {
   *    "allows pickup ": false,
   *    "delivery base location": Object { lat: 37.14238, lng: -8.54771 },
   *    "delivery radius": 50,
   *    "delivery timetable": Array(309) [ {…}, {…}, {…}, … ],
   *    "delivery vehicles": Array [],
   *    "does deliveries": true,
   *    "summarized delivery times": Array(7) [ [], "Mo 15:00-18:00", "Tu 15:00-18:00", … ],
   *    ​"travel charge": 0
   *  }, services: (2) [ "race bike rental", "mountain bike rental"] }
   */
  this.makeMarkers = (provider, serviceIndex) => {
    const service = provider.services[serviceIndex];
    const location = JSON.stringify(provider.logistics['delivery base location']);
    const reference = `${service['item type']}-${service.service}-${location}`;

    if (indexByType.includes(reference) === false) {
      // rendering circles to canvas allows more (pseudo)elements to be added.
      const lat = provider.logistics['delivery base location'].lat;
      const lng = provider.logistics['delivery base location'].lng;
      const coordinates = { lat: lat, lng: lng };

      const marker = L.circleMarker(coordinates, {
        // this doen't seem to work to lift markers above the route if route exists
        zIndexOffset: 2000,
        color: color(service),
        // adding the markers to the marker pane *does* work to lift marker above the route
        pane: 'markerPane'
      });

      marker.bindPopup(L.popup({ autoPan : false} ).setContent(this.generateRentalPopup(provider, serviceIndex))).openPopup();
      // store by type
      markerTracker.push({type: `${service['item type']} ${service.service}`, providerMarkers: [marker], provider: provider});
      // adde to MarkerClusterGroup
      marker.addTo(markers);
      // index to avoid duplicates:
      indexByType.push(reference);
    }
  };

  /**
   * @param {Object[]} Array with lat lng at 0 and 1
   * @param {string} Text to bind to a marker
   * @description latLng, latitude and logitude in the form [lat, lng],
   * it also swaps the marker's location.
   * @fires LRM#spliceWaypoints a leaflet routing engine function
   * @returns itself
   */
  this.makeClientMarker = (latLng) => {
    const marker = L.marker(latLng, {
      zIndexOffset: 1000
    });

    const popUpContent = document.createElement('div');
    const text = document.createElement('p');
    text.textContent = `Your chosen location: ${latLng[0]}, ${latLng[1]}`;
    text.style.color = '#000';
    popUpContent.appendChild(text);

    marker.bindPopup(L.popup({ autoPan: false }).setContent(popUpContent)).openPopup();
    if (indexByType.includes('clientMarker')) {
      const index = indexByType.indexOf('clientMarker');
      markerTracker[index].providerMarkers[0].setLatLng(latLng);
      map.setView(latLng, 11);
      // LRM method.
      routeConstructor.spliceWaypoints(1, 1, latLng);
    } else {
      markerTracker.push({type: 'clientMarker', providerMarkers: [marker]});
      indexByType.push('clientMarker');
      marker.addTo(map);
      map.setView(latLng, 11);
      // LRM method.
      routeConstructor.spliceWaypoints(1, 1, latLng);
    }
    return this;
  };

  /**
   * @fires searchLocation
   * @description This function generates a search widget on the 
   * button base element that calls search location.
   * @returns itself
   */
  this.generateLocationSearchWidget = () => {
    const locationOptions = document.createElement('div');
    locationOptions.classList.add('locationOptions');

    const textinput = document.createElement('input');
    textinput.setAttribute('type', 'text');
    textinput.classList.add('clientLocation', 'bookguide', 'item');
    textinput.setAttribute('placeholder', 'Enter address');

    const searchLocationBtn = document.createElement('button');
    searchLocationBtn.classList.add('btn', 'btn-primary', 'sms2', 'btn-lg', 'geodecode');
    searchLocationBtn.textContent = 'Search';
    searchLocationBtn.setAttribute('type', 'button');

    searchLocationBtn.addEventListener('click', (event) => {
      event.preventDefault();
      // meetingPointType = 'searchedLocation';
      this.searchLocation(textinput.value, null, map).then((parent) => {
        const elems = parent.children;
        for (let i = 0; i < elems.length; i++) {
          elems[i].addEventListener('click', () => {
            const lat = parseFloat(elems[i].dataset.lat);
            const lng = parseFloat(elems[i].dataset.lng);
            const text = elems[i].textContent;
            console.log('switch function from swapUser... to makeClientMarker');
            console.log('check this function is not making more markers than needed');
            this.makeClientMarker([lat, lng]);
            // this.swapUserLocationMarker(lat, lng, text, map, baseHTMLElement, clientLocation);
          });
        }
      });
    });
    buttonBase.appendChild(textinput);
    buttonBase.appendChild(searchLocationBtn);
    buttonBase.appendChild(locationOptions);
    return this;
  };

  /**
   * @param {string} textinput The text to geo-decode.
   * @returns A list of possible locations for a given text search and appends them bellow the
   * search field.
   */
  this.searchLocation = (textinput) => {
    const promise = new Promise((resolve, reject) => {
      console.warn('set up private nominatim instance');
      const nominatimURL = `https://nominatim.openstreetmap.org/search/${encodeURIComponent(textinput)}?format=json`;
      const xhr = new XMLHttpRequest();
      xhr.open('GET', nominatimURL);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send();
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
          const locationResponse = JSON.parse(xhr.responseText);
          // first child
          const subtitle = document.createElement('h3');
          subtitle.textContent = 'Pick a location from the options bellow:';
          const locationOptions = buttonBase.querySelector('.locationOptions');
          if (!locationOptions.firstChild) {
            locationOptions.appendChild(subtitle);
          }
          // all this to overwrite an element:
          locationOptions.removeChild(locationOptions.firstChild);
          const locations = document.createElement('div');
          const tit = document.createElement('h3');
          tit.textContent = 'Choose a location';
          locations.append(tit);
          // prints response
          for (let i = 0; i < locationResponse.length; i++) {
            const option = locationResponse[i].display_name;
            const div = document.createElement('div');
            div.textContent = option;
            div.dataset.lat = locationResponse[i].lat;
            div.dataset.lng = locationResponse[i].lon;
            div.classList.add('locationsCss');
            div.addEventListener('click', () => {
              map._container.scrollIntoView({ block: 'start', behavior: 'smooth' });
            });
            locations.appendChild(div);
            if (i === locationResponse.length - 1) {
              locationOptions.appendChild(locations);
              resolve(locations);
            }
          }
        }
      };
    }); return promise;
  };

  /**
   * @description Creates a button which gets the location from the browser.
   * @fires locateBrowser()
   * @fires MapConstructor#makeClientMarker
   * @description MapConstructor.makeClientMarker replaces MapConstructor.swapUserLocationMarker
   * @returns itself
   */
  this.generateBrowserLocateWidget = () => {
    const locationBtn = document.createElement('button');
    locationBtn.classList.add('btn', 'sms2', 'bounceOnHover', 'item');
    locationBtn.textContent = 'Get your current location';
    locationBtn.setAttribute('type', 'button');
    locationBtn.addEventListener('click', (event) => {
      event.preventDefault();
      this.locateBrowser(map).then((latLng) => {
      /*
        this.swapUserLocationMarker(latLng[0], latLng[1], 'Your browser location',
          map, baseHTMLElement, clientLocation);
      */
        this.makeClientMarker([latLng[0], latLng[1]]);
        baseHTMLElement.scrollIntoView( {block: 'start', behavior: 'smooth' });
      });
    });
    buttonBase.appendChild(locationBtn);
    return this;
  };

  /**
   * @fires L#locate
   * @returns a promise with a user's browser's location (a leaflet method)
   */
  this.locateBrowser = () => {
    const promise = new Promise((resolve, reject) => {
      map.locate();
      map.on('locationfound', (e) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        resolve([lat, lng]);
      });
      console.warn('proper error delation required');
      map.on('locationerror', (e) => {
        console.error(e);
        if (e.code === 3) {
          alert('Connection timed out while retrieving your position');
        } else {
          alert('An Error occured trying to find your location through your browser.');
        }
        reject(e);
      });
    });
    return promise;
  };

  /**
   * @param {function} save function to call on click.
   * @calls makeClientMarker
   * @returns itself
   */
  this.locateOnClick = () => {
    const innerThis = this;
    map.addEventListener('click', function onLocationFound(e) {
      innerThis.makeClientMarker([e.latlng.lat, e.latlng.lng]);
    });
    return this;
  };

  /**
    * explanatoryTextsForBtns builds a set of controls buttons for the map
    * @function
    * @param {string} baseElement - The element that holds the buttons or null
    * to the element you wish to contain the controls buttons.
    * @param {string} titleText - Desired title for the button element
    * @param {string} explanatoryParagraph - Paragraph with further information
    **/
  this.explanatoryTextsForBtns = (baseElement, titleText, explanatoryParagraph) => {
    if (typeof baseElement === 'string') {
      buttonBase = document.querySelector(baseElement);
    }

    buttonBase.classList.add('emphasis', 'center');
    // locationOptions is defined in the constructor
    locationOptions = document.createElement('div');
    locationOptions.classList.add('locationOptions');
    if (titleText) {
      const title = document.createElement('h2');
      // ,'block' removed
      title.classList.add('center', 'findaguide', 'item');
      title.textContent = titleText;
      buttonBase.appendChild(title);
    }
    const expPara = document.createElement('div');
    expPara.classList.add('emphasis', 'block');
    const expParaText = document.createElement('p');
    expParaText.textContent = explanatoryParagraph;
    buttonBase.appendChild(expPara);
    expPara.appendChild(expParaText);
    return this;
  };

  /**
   * @fires L.remove Removes the map from the host div
   */
  this.removeMap = () => {
    map.remove();
  };

  /**
   * @fires L.invalidateSize Often required when the map tiles are disordered. I don't know why.
   */
  this.invalidateSize = () => {
    return map.invalidateSize();
  };

  /**
   * @param {Object} provider An object containing the provider information. Check swiftmo.providers DB in MongoDB for the shape.
   * @param {Number} serviceIndex whole integer refering to one of the services a provider provides.
   * @fires MapConstructor#makeRouteButton
   * @returns a pop up with various buttons and events.
   */
  this.generateRentalPopup = (provider, serviceIndex) => {
    const innerThis = this;
    const div = L.DomUtil.create('div');
    makeTitle(div, provider);
    makeSubTitle(div, provider, serviceIndex);
    makeReadMoreButton(div, provider, serviceIndex);
    innerThis.makeRouteButton(div, provider);
    makeDeliveryRadiusWidget(div, provider, serviceIndex);
    makeNextButton(div, provider, serviceIndex);

    const alert = L.DomUtil.create('div');
    addclasses(alert, ['alertdiv']);
    div.appendChild(alert);

    const p2 = L.DomUtil.create('p');
    p2.textContent = 'Please search for a location to route in the panel above';
    alert.appendChild(p2);
    alert.style.display = 'none';
    folder.reattachEvents();
    return div;
  };

  /**
   * @param {Object} HTMLElement on which to place new button.
   * @param {Object} provider information: see swiftmo.providers DB in MongoDB for the correct shape.
   * @description fires MapConstructor#route on click
   * @returns itself
   */
  this.makeRouteButton = (div, provider) => {
    const btn2 = L.DomUtil.create('button', 'sms2');
    btn2.textContent = 'Check route';
    addclasses(btn2, ['btn', 'bounceOnHover', 'checkRoute']);
    div.appendChild(btn2);

    btn2.addEventListener('click', () => {
      const providerLocation = provider.logistics['delivery base location'];
      const index = indexByType.indexOf('clientMarker');
      const clientLocation = (markerTracker[index])
        ? markerTracker[index].providerMarkers[0].getLatLng()
        : undefined;

      if (index === -1) {
        alert(`You need to select a location you will be at by clicking on the map,
        or entering an address or providing your location through the browser`);
      } else {
        this.route([
          { lat: providerLocation.lat, lng: providerLocation.lng },
          { lat: clientLocation.lat, lng: clientLocation.lng}
        ],
        false,
        false);
      }
    });
    return this;
  };

//TODO
  this.createRadius = (coordinates, radius, differentmap, addtomap, checkWithinRadius, customMessage, circle) => {
    return createRadius(coordinates, radius, differentmap, addtomap, checkWithinRadius, customMessage, circle);
  }


  this.returnBounds = () => {
    return map.getBounds();
  };

  this.returnCoordinates = (lat, lng) => {
    return returnCoordinates(lat, lng);
  };

  this.reverseGeocode = (coordinates) => {
    return reverseGeocode(coordinates);
  };

  /* Note that while searchLocation is a method, its typical use is to be called
  through the search button rendered above. It can though be called independantly
  just passing a location string which might be handy */
  /*
  this.searchLocation = (location, mapAsParam) => {
    return searchLocation(location, mapAsParam);
  };
  */

  /* This function attaches events to the locations found for a given input. It could
    be improved by taking params elems to affect and target function ref */
  this.attachEvents = function(parentElement) {
    return attachEvents(parentElement);
  };

  function addclasses (el, classArray) {
    for (let i = 0; i < classArray.length; i++) {
      L.DomUtil.addClass(el, classArray[i]);
    }
  }

  function makeTitle (div, provider) {
    const h3 = L.DomUtil.create('h3');
    h3.textContent = provider['trading name'];
    div.appendChild(h3);
  }

  function makeSubTitle (div, provider, serviceIndex) {
    const p = L.DomUtil.create('p');
    console.log(provider);
    const service = `${provider.services[serviceIndex]['item type']}  ${provider.services[serviceIndex].service}`;
    p.textContent = service.charAt(0).toUpperCase() + service.slice(1);
    div.appendChild(p);
  }

  function makeReadMoreButton (div, provider, serviceIndex) {
    const btn = L.DomUtil.create('button', 'sms2');
    addclasses(btn, ['btn', 'bounceOnHover', 'mapbtn']);
    btn.setAttribute('data-guide', `card-${provider.services[serviceIndex]}`);
    // btn.setAttribute('data-providerCode', provider.data.verificationcode);
    btn.textContent = 'Read more ~';
    div.appendChild(btn);
    const url = encodeURI(`${window.location.origin}/provider?alias=${provider['trading name']}`);
    console.warn(`the url ${url} must lead or show something about the provider`);
    btn.addEventListener('click', (event) => {
      window.location.replace(url);
    });
  }

  function makeDeliveryRadiusWidget (div, provider) {
    if (!provider.logistics['does deliveries']) {
      return;
    }
    const btn4 = L.DomUtil.create('button', 'sms2');
    btn4.textContent = 'Delivery Radius';
    addclasses(btn4, ['btn', 'bounceOnHover', 'deliveryRadius']);
    const coordinates = provider.logistics['delivery base location'];
    console.warn('radius should be stored and returned in meters, not converted'); 
    const radius = parseInt(provider.logistics['delivery radius'] * 1000);
    btn4.dataset.coordinates = JSON.stringify(coordinates);
    btn4.dataset.radius = radius;
    // like this to match guides formating:
    radiusToggle(btn4, { center: coordinates, lengthInMeters: radius });
    div.appendChild(btn4);
  }

  function makeNextButton (div, provider, serviceIndex) {
    const btn3 = L.DomUtil.create('button', 'sms2');
    btn3.textContent = 'next';
    addclasses(btn3, ['btn', 'sms2', 'bounceOnHover', 'btnnext', 'providers',
      'hirechoice', 'selectProvider']);
    btn3.dataset.pageid = '1';
    btn3.dataset.provider = provider.providerID;
    btn3.dataset.logistics = JSON.stringify(provider.logistics);
    btn3.dataset.hirechoice = `${provider.services[serviceIndex]['item type']}`;;
    div.appendChild(btn3);
  }

  /**
   * @param {Object} HTMLElement, a button element
   * @param {Object} circleFeatures Object describing a circle
   * @param {Object} circleFeatures.center {lat, lng}
   * @param {Number} circleFeatures.lengthInMeters Circle radius in meters.
   * @fires L.circle or toggle circle visibility
   * @returns nothing
   * @description checks if a radius has been created, if not, creates it. If the button (btn) option is passed
   * it attaches a fucntion to toggle the radius to the click event on the button
   */
  function radiusToggle (btn, circleFeatures) {
    const radius = L.circle(circleFeatures.center, circleFeatures.lengthInMeters);

    function toggle () {
      if (radius.visible) {
        radius.removeFrom(radiae);
        radius.visible = 0;
      } else {
        radius.addTo(radiae);
        radius.visible = 1;
      }
    }

    if (btn) {
      btn.addEventListener('click', () => {
        toggle();
      });
    }
  }


  function withinRadius (providerCo, mapCo, radius) {
    const lat1 = providerCo.lat;
    const lon1 = providerCo.lng;
    const lat2 = mapCo.lat;
    const lon2 = mapCo.lng;

    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const d = R * c;

    if (d > parseInt(radius) * 1000) {
      locationValid = false;
      return false;
    } else {
      locationValid = true;
      return true;
    }
  }

  const jobColors = [];
  const colors = [];
  function color (jobType) {
    if (jobColors.includes(jobType)) {
      return colors[jobColors.indexOf(jobType)];
    }

    function getRandomInt (max) {
      return Math.floor(Math.random() * max);
    }
    const color = `rgba(${getRandomInt(255)}, ${getRandomInt(255)}, ${getRandomInt(255)}`;
    jobColors.push(jobType);
    colors.push(color);
    return color;
  }

  function returnCoordinates (lat, lng) {
    return (lat && lng) ? {
      lat: parseFloat(lat.toFixed(5)),
      lng: parseFloat(lng.toFixed(5))
    } : null;
  }

  function reverseGeocode (coordinates) {
    console.warn('Use a private geoEncoder');
    // adapt this so it can take coordinates too.
    const nominatimURL = `https://nominatim.openstreetmap.org/reverse?format=json\
  &lat=${returnCoordinates().lat}\
  &lon${returnCoordinates().lng}\
  &zoom=18&addressdetails=1`;

    const xhr = new XMLHttpRequest();
    xhr.open('GET', nominatimURL);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send();
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && xhr.status === 200) {
        const address = JSON.parse(xhr.responseText);
        return address.display_name;
      }
    };
    return this;
  }
}
