/**
 * Route Export Module
 * Obsługuje eksport tras do różnych formatów (KML, GPX) i integrację z Google Maps
 * 
 * @author Copilot
 * @version 1.0.0
 */

class RouteExporter {
  constructor() {
    // Cache dla geolokalizacji użytkownika
    this.cachedUserLocation = null;
    this.locationCacheTime = null;
    this.LOCATION_CACHE_DURATION = 300000; // 5 minut
    
    // Konfiguracja eksportu
    this.config = {
      kml: {
        defaultLineColor: '#FF0000',
        defaultLineWidth: 3,
        defaultLineOpacity: 0.8
      },
      gpx: {
        trackName: 'Trail Route',
        trackDescription: 'Exported trail route'
      }
    };
  }

  /**
   * Pobiera punkt początkowy i końcowy trasy
   * @param {Object} geojson - GeoJSON z geometrią trasy
   * @returns {Object} { start: [lng,lat], end: [lng,lat] }
   */
  getStartEnd(geojson) {
    if (!geojson || !geojson.geometry) return null;
    
    const geom = geojson.geometry;
    
    if (geom.type === 'LineString') {
      const coords = geom.coordinates;
      return {
        start: coords[0],
        end: coords[coords.length - 1]
      };
    }
    
    if (geom.type === 'MultiLineString') {
      const lines = geom.coordinates;
      if (lines.length === 0) return null;
      
      const firstLine = lines[0];
      const lastLine = lines[lines.length - 1];
      
      return {
        start: firstLine[0],
        end: lastLine[lastLine.length - 1]
      };
    }
    
    return null;
  }

  /**
   * Otwiera Google Maps z nawigacją
   * @param {Object} options - { origin, destination, mode }
   */
  openGoogleDirections({ origin, destination, mode = 'driving' }) {
    let url = 'https://www.google.com/maps/dir/?api=1';
    
    if (origin) {
      url += `&origin=${origin[1]},${origin[0]}`; // lat,lng
    }
    
    if (destination) {
      url += `&destination=${destination[1]},${destination[0]}`; // lat,lng
    }
    
    url += `&travelmode=${mode}`;
    
    window.open(url, '_blank');
  }

  /**
   * Tworzy slug z nazwy trasy
   */
  createSlug(name) {
    if (!name) return 'trasa';
    
    const polishChars = {
      'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
      'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
    };
    
    return name
      .split('')
      .map(char => polishChars[char] || char)
      .join('')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Eksport dojazdu samochodem do startu szlaku
   */
  async exportDriveToStart(geojson, name, userLocation = null) {
    // Użyj map matching jeśli dostępne
    let finalGeometry = geojson;
    if (typeof mapMatchTrail === 'function') {
      try {
        finalGeometry = await mapMatchTrail(geojson);
      } catch (error) {
        console.warn('Map matching failed for drive export, using original geometry:', error);
      }
    }
    
    const points = this.getStartEnd(finalGeometry);
    if (!points) {
      this.showError('Nie można określić punktów trasy');
      return;
    }
    
    const slug = this.createSlug(name);
    const filename = `dojazd_do_${slug}.kml`;
    
    // Pobierz KML
    await this.exportToKML(finalGeometry, name, filename);
    
    // Otwórz Google Maps
    this.openGoogleDirections({
      origin: userLocation,
      destination: points.start,
      mode: 'driving'
    });
  }

  /**
   * Eksport przejścia pieszo szlakiem
   */
  async exportWalkTrail(geojson, name) {
    // Użyj map matching jeśli dostępne
    let finalGeometry = geojson;
    if (typeof mapMatchTrail === 'function') {
      try {
        finalGeometry = await mapMatchTrail(geojson);
      } catch (error) {
        console.warn('Map matching failed for walk export, using original geometry:', error);
      }
    }
    
    const points = this.getStartEnd(finalGeometry);
    if (!points) {
      this.showError('Nie można określić punktów trasy');
      return;
    }
    
    const slug = this.createSlug(name);
    const filename = `${slug}_pieszo.kml`;
    
    // Pobierz KML
    await this.exportToKML(finalGeometry, name, filename);
    
    // Otwórz Google Maps
    this.openGoogleDirections({
      origin: points.start,
      destination: points.end,
      mode: 'walking'
    });
  }

  /**
   * Metoda logowania z prefiksem
   */
  log(message, level = 'info') {
    const prefix = '[RouteExporter]';
    switch (level) {
      case 'error':
        console.error(prefix, message);
        break;
      case 'warn':
        console.warn(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  }

  /**
   * Pokazuje błąd użytkownikowi
   */
  showError(message, error = null) {
    this.log(`${message}: ${error ? error.message : 'Nieznany błąd'}`, 'error');
    alert(`${message}\n\nSzczegóły błędu: ${error ? error.message : 'Nieznany błąd'}`);
  }

  /**
   * Główna funkcja eksportu trasy
   * @param {Object} geojson - Dane GeoJSON trasy
   * @param {string} name - Nazwa trasy
   * @param {string} format - Format eksportu ('kml', 'gpx', 'png')
   * @param {Object} options - Dodatkowe opcje eksportu
   */
  async exportRoute(geojson, name, format = 'kml', options = {}) {
    try {
      console.log(`Eksportuję trasę "${name}" do formatu ${format.toUpperCase()}`);
      
      switch (format.toLowerCase()) {
        case 'kml':
          return await this.exportToKML(geojson, name, options);
        case 'gpx':
          return await this.exportToGPX(geojson, name, options);
        case 'png':
          return await this.exportToPNG(geojson, name, options);
        default:
          throw new Error(`Nieobsługiwany format eksportu: ${format}`);
      }
    } catch (error) {
      console.error('Błąd podczas eksportu trasy:', error);
      throw error;
    }
  }

  /**
   * Eksport do formatu KML z map matching
   */
  async exportToKML(geojson, name, customFilename = null) {
    try {
      // Użyj map matching jeśli dostępne
      let finalGeometry = geojson;
      if (typeof mapMatchTrail === 'function') {
        try {
          finalGeometry = await mapMatchTrail(geojson);
        } catch (error) {
          console.warn('Map matching failed for KML export, using original geometry:', error);
        }
      }
      
      const coords = this.extractCoordinates(finalGeometry);
      if (!coords || coords.length === 0) {
        throw new Error('Brak współrzędnych do eksportu');
      }

      // Generuj KML bez pokazywania modali
      const kmlContent = this.generateKMLContent(coords, name);
      
      // Użyj custom filename lub domyślnego
      const filename = customFilename || `${this.createSlug(name)}.kml`;
      
      // Pobierz plik
      this.downloadFile(kmlContent, filename, 'application/vnd.google-earth.kml+xml');
      
      this.log(`Eksport KML zakończony: ${filename}`);
      
    } catch (error) {
      this.log(`Błąd podczas eksportu KML: ${error.message}`, 'error');
      this.showError(`Nie udało się wyeksportować KML: ${error.message}`, error);
    }
  }

  /**
   * DEPRECATED - używana przez starą integrację
   */
  async showKMLOptionsLoop(geojson, name, userLocation, options = {}) {
    // Stara implementacja - zostaw dla kompatybilności
    console.warn('showKMLOptionsLoop jest deprecated, użyj nowych funkcji exportDriveToStart/exportWalkTrail');
    await this.exportToKML(geojson, name);
  }

  /**
   * Eksport do formatu GPX
   */
  async exportToGPX(geojson, name, options = {}) {
    try {
      const coords = this.extractCoordinates(geojson);
      if (!coords || coords.length === 0) {
        throw new Error('Brak współrzędnych do eksportu');
      }

      const gpxContent = this.generateGPXContent(coords, name, options);
      this.downloadFile(gpxContent, `${name}.gpx`, 'application/gpx+xml');
      
      return { success: true, format: 'gpx', filename: `${name}.gpx` };
      
    } catch (error) {
      console.error('Błąd eksportu GPX:', error);
      throw error;
    }
  }

  /**
   * Eksport do formatu PNG (screenshot mapy)
   */
  async exportToPNG(geojson, name, options = {}) {
    this.log(`Eksportowanie mapy jako PNG: ${name}`);
    
    try {
      // Sprawdź czy mapa jest dostępna
      if (!window.map || !window.map.getCanvas) {
        throw new Error('Mapa nie jest dostępna');
      }
      
      // Sprawdź czy mamy wymagane dane globalne
      if (!window.currentItem || !window.currentPath) {
        throw new Error('Brak danych trasy (currentItem lub currentPath)');
      }
      
      const map = window.map;
      const currentItem = window.currentItem;
      const currentPath = window.currentPath;
      if (!window.turf) {
        throw new Error('Biblioteka Turf.js nie jest dostępna');
      }
      const turf = window.turf;
      
      this.log('Rozpoczynam zaawansowany eksport PNG...');
      
      // === ORYGINALNY KOD PNG EXPORT Z app.js ===
      
      // Save current view and style props
      const prev = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        casing: map.getPaintProperty('hiking-casing','line-width'),
        colorW: map.getPaintProperty('hiking-color','line-width'),
        progW: (map.getLayer('progress-line') ? map.getPaintProperty('progress-line','line-width') : null)
      };
      
      // Fit to bbox of current path (portrait/landscape padding)
      const bb = turf.bbox(currentPath); // [w,s,e,n]
      const width = map.getCanvas().width, height = map.getCanvas().height;
      const pad = Math.round(Math.min(width, height) * 0.08);
      
      // --- Only selected route on export ---
      const hikingSrc = map.getSource('hiking');
      const restoreHiking = !!hikingSrc;
      let originalHikingData = null;
      
      if(restoreHiking){
        try{
          // Zapisz oryginalne dane źródła
          originalHikingData = hikingSrc._data;
          const singleFC = { type:'FeatureCollection', features:[ currentItem.f ] };
          hikingSrc.setData(singleFC);
          await new Promise(res => map.once('idle', res));
        }catch(e){ /* ignore */ }
      }
      
      // --- Hide animated progress ONLY for export ---
      const restoreVisibility = {};
      function hideForExport(id){
        if(map.getLayer(id)){
          try{
            restoreVisibility[id] = map.getLayoutProperty(id, 'visibility') || 'visible';
            map.setLayoutProperty(id, 'visibility', 'none');
          }catch(e){}
        }
      }
      function restoreAfterExport(){
        for(const id in restoreVisibility){
          try{ map.setLayoutProperty(id, 'visibility', restoreVisibility[id] || 'visible'); }catch(e){}
        }
      }
      hideForExport('anim-line');
      hideForExport('progress-line');
      hideForExport('country-boundaries');
      hideForExport('city-borders');

      try{
        // Thicken lines for export
        map.setPaintProperty('hiking-casing','line-width', 6);
        map.setPaintProperty('hiking-color','line-width', 4.5);
        if(map.getLayer('progress-line')) map.setPaintProperty('progress-line','line-width', 8);
      }catch(e){}
      
      document.body.classList.add('exporting');
      
      // Ensure north-up, flat, and fit
      map.easeTo({bearing:0, pitch:0, duration:0});
      map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: pad, duration: 0 });
      await new Promise(res => map.once('idle', res));
      
      // Compose image
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = map.getCanvas().width;
      canvas.height = map.getCanvas().height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(map.getCanvas(), 0, 0);
      
      // Get color and distance for label
      const color = window.osmcToColor ? window.osmcToColor(currentItem.osmc || currentItem._osmc) : '#FF0000';
      const distKm = turf.length(currentPath);
      
      // Label card (short, multi-line wrapping)  
      const margin = 18*dpr;
      const x = margin, y = margin;
      const padX = 18*dpr, padY = 16*dpr, gap = 12*dpr, swatchW = 20*dpr;

      const titleFont = `${20*dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      const subFont   = `${15*dpr}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      const lineH     = 22*dpr;
      const subLineH  = 18*dpr;
      const maxCardW  = Math.min(canvas.width*0.45, 380*dpr);
      const minCardW  = 260*dpr;
      const innerMax  = maxCardW - (padX*2 + gap + swatchW);

      function wrapText(ctx, text, maxW, maxLines=3){
        if(!text) return [''];
        const words = String(text).split(/\s+/);
        const lines = [];
        let line = '';
        ctx.font = titleFont;
        for(const w of words){
          const test = line ? line + ' ' + w : w;
          if(ctx.measureText(test).width <= maxW){
            line = test;
          }else{
            if(line) lines.push(line);
            line = w;
            if(lines.length === maxLines-1){
              while(ctx.measureText(line + '…').width > maxW && line.length>1){
                line = line.slice(0,-1);
              }
              lines.push(line + '…');
              return lines;
            }
          }
        }
        if(line) lines.push(line);
        return lines.slice(0, maxLines);
      }

      function drawRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      }

      const ctxMeasure = canvas.getContext('2d');
      const titleLines = wrapText(ctxMeasure, name, innerMax, 3);
      ctxMeasure.font = titleFont;
      const longest = titleLines.reduce((w,t)=>Math.max(w, ctxMeasure.measureText(t).width), 0);

      ctxMeasure.font = subFont;
      const distText = `${distKm.toFixed(2)} km`;
      const distW = ctxMeasure.measureText(distText).width;

      const textW = Math.max(longest, distW);
      const cardW = Math.max(minCardW, Math.min(maxCardW, padX*2 + textW + gap + swatchW));
      const cardH = padY*2 + titleLines.length*lineH + 10*dpr + subLineH;

      // Draw card
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      drawRoundedRect(ctx, x, y, cardW, cardH, 12*dpr);
      ctx.fill();

      // Title lines
      ctx.fillStyle = '#111';
      ctx.font = titleFont;
      for(let i=0;i<titleLines.length;i++){
        ctx.fillText(titleLines[i], x+padX, y+padY + (i+0.8)*lineH);
      }
      // Distance
      ctx.font = subFont;
      ctx.fillText(distText, x+padX, y+padY + titleLines.length*lineH + 12*dpr);

      // Color swatch (right side)
      ctx.fillStyle = color;
      ctx.beginPath(); 
      ctx.arc(x+cardW - padX - 8*dpr, y+cardH/2, 8*dpr, 0, Math.PI*2); 
      ctx.fill();

      ctx.restore();
      
      // Download
      const safe = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'');
      const filename = `${safe||'trasa'}.png`;
      const dataURL = canvas.toDataURL('image/png');
      
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataURL;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Restore
      document.body.classList.remove('exporting');
      try{
        map.setPaintProperty('hiking-casing','line-width', prev.casing);
        map.setPaintProperty('hiking-color','line-width', prev.colorW);
        if(map.getLayer('progress-line') && prev.progW!=null) map.setPaintProperty('progress-line','line-width', prev.progW);
      }catch(e){}
      map.easeTo({ center: prev.center, zoom: prev.zoom, pitch: prev.pitch, bearing: prev.bearing, duration: 0 });
    
      // Restore full routes on map
      try{
        const hikingSrc2 = map.getSource('hiking');
        if(hikingSrc2 && originalHikingData){ 
          hikingSrc2.setData(originalHikingData); 
          await new Promise(res => map.once('idle', res)); 
        } else if(hikingSrc2 && window.hikingData) {
          // Fallback do window.hikingData jeśli jest dostępne
          hikingSrc2.setData(window.hikingData); 
          await new Promise(res => map.once('idle', res)); 
        }
      }catch(e){}
      
      // Restore visibility
      restoreAfterExport();
      
      // Force restore cyan line if function exists
      if (typeof window.forceRestoreCyan === 'function') {
        window.forceRestoreCyan();
      }
      
      this.log(`PNG wyeksportowany pomyślnie: ${filename}`);
      
      // Show success notification
      if (window.showCustomModal) {
        setTimeout(async () => {
          await window.showCustomModal({
            title: 'Pobieranie zakończone',
            message: `Obraz PNG trasy "${name}" został pobrany.`,
            confirmText: 'OK',
            showCancel: false
          });
        }, 500);
      }
      
      return { success: true, filename: filename };
      
    } catch (error) {
      this.log(`Błąd eksportu PNG: ${error.message}`, 'error');
      console.error('Szczegóły błędu PNG:', error);
      this.showError('Nie udało się wyeksportować obrazu PNG', error);
      throw error;
    }
  }

  /**
   * Wyciąga współrzędne z różnych formatów GeoJSON
   */
  extractCoordinates(geojson) {
    let coords = [];
    
    if (geojson.type === 'Feature') {
      if (geojson.geometry.type === 'LineString') {
        coords = geojson.geometry.coordinates;
      } else if (geojson.geometry.type === 'MultiLineString') {
        coords = geojson.geometry.coordinates.flat();
      }
    } else if (geojson.type === 'LineString') {
      coords = geojson.coordinates;
    } else if (geojson.type === 'MultiLineString') {
      coords = geojson.coordinates.flat();
    }
    
    return coords;
  }

  /**
   * Pobiera aktualną lokalizację użytkownika z cache'owaniem
   */
  getCurrentUserLocation(useCache = true) {
    return new Promise((resolve, reject) => {
      // Sprawdź cache
      if (useCache && this.cachedUserLocation && this.locationCacheTime && 
          (Date.now() - this.locationCacheTime < this.LOCATION_CACHE_DURATION)) {
        resolve(this.cachedUserLocation);
        return;
      }
      
      if (!navigator.geolocation) {
        reject(new Error('Geolokalizacja nie jest obsługiwana przez tę przeglądarkę'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          
          // Zapisz do cache
          this.cachedUserLocation = location;
          this.locationCacheTime = Date.now();
          
          resolve(location);
        },
        (error) => {
          let errorMessage = 'Błąd geolokalizacji: ';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage += 'Dostęp do lokalizacji został odrzucony przez użytkownika.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += 'Informacje o lokalizacji są niedostępne.';
              break;
            case error.TIMEOUT:
              errorMessage += 'Przekroczono limit czasu żądania lokalizacji.';
              break;
            default:
              errorMessage += 'Wystąpił nieznany błąd.';
              break;
          }
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minut
        }
      );
    });
  }

  /**
   * Generuje zawartość pliku KML
   */
  generateKMLContent(coords, name, userLocation = null, options = {}) {
    const { lineColor = this.config.kml.defaultLineColor, 
            lineWidth = this.config.kml.defaultLineWidth } = options;
    
    let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${this.escapeXML(name)}</name>
    <description>Trasa wyeksportowana z Interaktywnej Mapy Turystycznej</description>
    
    <Style id="trailStyle">
      <LineStyle>
        <color>ff${lineColor.substring(1).split('').reverse().join('')}</color>
        <width>${lineWidth}</width>
      </LineStyle>
    </Style>`;

    // Dodaj lokalizację użytkownika jako punkt startowy
    if (userLocation && this.isValidLocation(userLocation)) {
      kmlContent += `
    <Placemark>
      <name>Punkt startowy (Twoja lokalizacja)</name>
      <description>Lokalizacja użytkownika</description>
      <Point>
        <coordinates>${userLocation.longitude},${userLocation.latitude},0</coordinates>
      </Point>
    </Placemark>`;
    }
    
    // Dodaj główną trasę
    kmlContent += `
    <Placemark>
      <name>${this.escapeXML(name)}</name>
      <description>Główna trasa turystyczna</description>
      <styleUrl>#trailStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>`;
    
    // Dodaj wszystkie punkty trasy
    coords.forEach(coord => {
      kmlContent += `${coord[0]},${coord[1]},0 `;
    });
    
    kmlContent += `</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
    
    return kmlContent;
  }

  /**
   * Generuje KML tylko z dojazdem samochodem do początku szlaku
   */
  generateMultiStageKMLContent(coords, name, userLocation, options = {}) {
    const { lineColor = this.config.kml.defaultLineColor, 
            lineWidth = this.config.kml.defaultLineWidth } = options;
    
    const trailStart = coords[0];
    
    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Dojazd do szlaku "${this.escapeXML(name)}"</name>
    <description>Trasa samochodowa z Twojej lokalizacji do początku szlaku</description>
    
    <!-- Style dla trasy samochodowej -->
    <Style id="drivingStyle">
      <LineStyle>
        <color>ff0000ff</color> <!-- Czerwony dla dojazdu samochodem -->
        <width>5</width>
      </LineStyle>
    </Style>
    
    <Style id="startPoint">
      <IconStyle>
        <color>ff00ff00</color>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/grn-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>
    
    <Style id="destinationPoint">
      <IconStyle>
        <color>ff0000ff</color>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>
    
    <!-- Punkty trasy -->
    <Placemark>
      <name>🚗 Start - Twoja lokalizacja</name>
      <description>Punkt początkowy dojazdu samochodem</description>
      <styleUrl>#startPoint</styleUrl>
      <Point>
        <coordinates>${userLocation.longitude},${userLocation.latitude},0</coordinates>
      </Point>
    </Placemark>
    
    <Placemark>
      <name>🅿️ Cel - Początek szlaku "${this.escapeXML(name)}"</name>
      <description>Miejsce docelowe - początek szlaku pieszego</description>
      <styleUrl>#destinationPoint</styleUrl>
      <Point>
        <coordinates>${trailStart[0]},${trailStart[1]},0</coordinates>
      </Point>
    </Placemark>
    
    <!-- Trasa samochodowa -->
    <Placemark>
      <name>Dojazd samochodem do szlaku "${this.escapeXML(name)}"</name>
      <description>Użyj nawigacji samochodowej do dojazdu. Ta linia jest orientacyjna - skorzystaj z rzeczywistej nawigacji GPS.</description>
      <styleUrl>#drivingStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${userLocation.longitude},${userLocation.latitude},0
          ${trailStart[0]},${trailStart[1]},0
        </coordinates>
      </LineString>
    </Placemark>
    
  </Document>
</kml>`;
    
    return kmlContent;
  }

  /**
   * Generuje zawartość pliku GPX
   */
  generateGPXContent(coords, name, options = {}) {
    const { trackName = this.config.gpx.trackName,
            trackDescription = this.config.gpx.trackDescription } = options;
    
    let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Interaktywna Mapa Turystyczna">
  <trk>
    <name>${this.escapeXML(name)}</name>
    <desc>${this.escapeXML(trackDescription)}</desc>
    <trkseg>`;
    
    coords.forEach(coord => {
      gpxContent += `
      <trkpt lat="${coord[1]}" lon="${coord[0]}">
        <ele>0</ele>
      </trkpt>`;
    });
    
    gpxContent += `
    </trkseg>
  </trk>
</gpx>`;
    
    return gpxContent;
  }

  /**
   * Oferuje integrację z Google Maps
   */
  async offerGoogleMapsIntegration(geojson, name, userLocation, showCustomModal = null, drivingOnly = false) {
    try {
      // Sprawdź czy funkcja showCustomModal jest dostępna
      const modalFn = showCustomModal || (typeof window !== 'undefined' && window.showCustomModal);
      if (typeof modalFn !== 'function') {
        console.warn('showCustomModal nie jest dostępna - pomijam integrację z Google Maps');
        return;
      }

      setTimeout(async () => {
        const openInGoogleMaps = await modalFn({
          title: 'Otworzyć w Google Maps?',
          message: `Plik KML został pobrany. Czy chcesz również otworzyć tę trasę w Google Maps?`,
          confirmText: 'Otwórz w Google Maps',
          cancelText: 'Nie, dziękuję'
        });
        
        if (openInGoogleMaps) {
          await this.openRouteInGoogleMaps(geojson, name, userLocation, modalFn, drivingOnly);
        }
      }, 500);
      
    } catch (error) {
      console.warn('Błąd podczas oferowania integracji Google Maps:', error);
    }
  }

  /**
   * Otwiera trasę w Google Maps
   */
  async openRouteInGoogleMaps(geojson, name, userLocation = null, showCustomModal = null, drivingOnly = false) {
    try {
      const coords = this.extractCoordinates(geojson);
      if (!coords || coords.length === 0) {
        throw new Error("Nie udało się znaleźć współrzędnych trasy");
      }
      
      const trailStartPoint = coords[0];
      const trailEndPoint = coords[coords.length - 1];
      
      // Jeśli mamy lokalizację użytkownika
      if (userLocation && this.isValidLocation(userLocation)) {
        const origin = encodeURIComponent(`${userLocation.latitude},${userLocation.longitude}`);
        const destination = encodeURIComponent(`${trailStartPoint[1]},${trailStartPoint[0]}`);
        
        if (drivingOnly) {
          // NOWA LOGIKA: Tylko dojazd samochodem do początku szlaku (2 punkty)
          const googleMapsUrl = `https://www.google.com/maps/dir/${origin}/${destination}/?travelmode=driving`;
          window.open(googleMapsUrl, '_blank');
          
          this.showRouteInfo(name, 'driving-only', showCustomModal);
        } else {
          // NOWA LOGIKA: Tylko trasa piesza z 2 punktami (początek → koniec szlaku)
          const startPoint = encodeURIComponent(`${trailStartPoint[1]},${trailStartPoint[0]}`);
          const endPoint = encodeURIComponent(`${trailEndPoint[1]},${trailEndPoint[0]}`);
          
          const googleMapsUrl = `https://www.google.com/maps/dir/${startPoint}/${endPoint}/?travelmode=walking`;
          window.open(googleMapsUrl, '_blank');
          
          this.showRouteInfo(name, 'multimodal', showCustomModal);
        }
        
      } else {
        // Bez lokalizacji użytkownika - tylko trasa piesza
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${trailStartPoint[1]},${trailStartPoint[0]}&destination=${trailEndPoint[1]},${trailEndPoint[0]}&travelmode=walking`;
        window.open(googleMapsUrl, '_blank');
        
        this.showRouteInfo(name, 'walking-only', showCustomModal);
      }
      
    } catch (error) {
      console.error("Błąd podczas otwierania Google Maps:", error);
      alert("Nie udało się otworzyć trasy w Google Maps.");
    }
  }

  /**
   * Pokazuje informację o otwartej trasie
   */
  showRouteInfo(name, routeType, showCustomModal = null) {
    const modalFn = showCustomModal || (typeof window !== 'undefined' && window.showCustomModal);
    if (typeof modalFn !== 'function') return;
    
    setTimeout(() => {
      let message;
      
      switch (routeType) {
        case 'driving-only':
          message = `🚗 Google Maps pokaże dojazd samochodem do szlaku "${name}":

📍 Start: Twoja lokalizacja
🅿️ Cel: Początek szlaku

Nawigacja samochodowa do miejsca, gdzie możesz rozpocząć wędrówkę pieszą.`;
          break;
          
        case 'multimodal':
          message = `Google Maps pokaże trasę z 3 punktami:
📍 Start: Twoja lokalizacja
🚗 Parking: Początek szlaku "${name}"
🎯 Meta: Koniec szlaku

Google automatycznie zasugeruje najlepszy transport dla każdego odcinka.`;
          break;
          
        case 'walking-only':
        default:
          message = `Otwarto trasę pieszą "${name}" w Google Maps.`;
          break;
      }
      
      modalFn({
        title: 'Trasa otwarta w Google Maps',
        message: message,
        confirmText: 'OK',
        cancelText: null
      });
    }, 500);
  }

  /**
   * Waliduje lokalizację użytkownika
   */
  isValidLocation(location) {
    if (!location || typeof location !== 'object') return false;
    
    const lat = parseFloat(location.latitude);
    const lng = parseFloat(location.longitude);
    
    return !isNaN(lat) && !isNaN(lng) && 
           lat >= -90 && lat <= 90 && 
           lng >= -180 && lng <= 180;
  }

  /**
   * Pobiera plik na dysk użytkownika
   */
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Zwolnij pamięć
    setTimeout(() => window.URL.revokeObjectURL(url), 100);
  }

  /**
   * Escapuje znaki specjalne XML
   */
  escapeXML(str) {
    return str.replace(/[&<>"']/g, (match) => {
      switch (match) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return match;
      }
    });
  }

  /**
   * Czyści cache geolokalizacji
   */
  clearLocationCache() {
    this.cachedUserLocation = null;
    this.locationCacheTime = null;
  }

  /**
   * Ustawia konfigurację modułu
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Eksportuj klasę dla użycia w innych modułach
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RouteExporter;
} else {
  window.RouteExporter = RouteExporter;
}