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
   * Eksport do formatu KML
   */
  async exportToKML(geojson, name, options = {}) {
    try {
      const coords = this.extractCoordinates(geojson);
      if (!coords || coords.length === 0) {
        throw new Error('Brak współrzędnych do eksportu');
      }

      // Pobierz lokalizację użytkownika
      let userLocation = null;
      let addDriving = false;
      let filename = name;
      
      try {
        userLocation = await this.getCurrentUserLocation();
        
        // Zapytaj użytkownika czy chce dodać dojazd
        const modalFn = options.showCustomModal || (typeof window !== 'undefined' && window.showCustomModal);
        if (typeof modalFn === 'function') {
          addDriving = await modalFn({
            title: 'Typ pliku KML',
            message: `Czy chcesz wygenerować KML z dojazdem samochodem z Twojej aktualnej lokalizacji do szlaku "${name}"?`,
            confirmText: 'Tak, z dojazdem',
            cancelText: 'Nie, tylko szlak'
          });
          
          if (addDriving) {
            filename = `${name}_z_dojazdem`;
          }
        }
      } catch (error) {
        console.warn('Nie udało się uzyskać lokalizacji użytkownika:', error);
      }

      // Generuj KML
      const kmlContent = addDriving && userLocation ? 
        this.generateMultiStageKMLContent(coords, name, userLocation, options) :
        this.generateKMLContent(coords, name, null, options);
      
      // Pobierz plik
      this.downloadFile(kmlContent, `${filename}.kml`, 'application/vnd.google-earth.kml+xml');
      
      // Opcjonalnie otwórz w Google Maps
      await this.offerGoogleMapsIntegration(geojson, name, addDriving ? userLocation : null, options.showCustomModal);
      
      return { success: true, format: 'kml', filename: `${filename}.kml` };
      
    } catch (error) {
      console.error('Błąd eksportu KML:', error);
      throw error;
    }
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
      
      // Poczekaj na załadowanie wszystkich warstw mapy
      await new Promise((resolve) => {
        if (window.map.loaded()) {
          resolve();
        } else {
          window.map.once('load', resolve);
        }
      });
      
      // Poczekaj aż mapa będzie bezczynna (wszystkie dane załadowane)
      await new Promise((resolve) => {
        if (window.map.isSourceLoaded('composite')) {
          resolve();
        } else {
          window.map.once('idle', resolve);
        }
      });
      
      // Uzyskaj canvas mapy
      const canvas = window.map.getCanvas();
      
      // Konwertuj na DataURL
      const dataURL = canvas.toDataURL('image/png', 1.0);
      
      // Utwórz link do pobrania
      const link = document.createElement('a');
      link.download = `${name}.png`;
      link.href = dataURL;
      
      // Dodaj do dokumentu, kliknij i usuń
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.log(`PNG wyeksportowany pomyślnie: ${name}.png`);
      return { success: true, filename: `${name}.png` };
      
    } catch (error) {
      this.log(`Błąd eksportu PNG: ${error.message}`, 'error');
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
   * Generuje wieloetapowy KML z dojazdem samochodem + szlak pieszy
   */
  generateMultiStageKMLContent(coords, name, userLocation, options = {}) {
    const { lineColor = this.config.kml.defaultLineColor, 
            lineWidth = this.config.kml.defaultLineWidth } = options;
    
    const trailStart = coords[0];
    const trailEnd = coords[coords.length - 1];
    
    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${this.escapeXML(name)} - Pełna podróż</name>
    <description>Wieloetapowa trasa: dojazd samochodem + szlak pieszy</description>
    
    <!-- Style dla różnych segmentów -->
    <Style id="drivingStyle">
      <LineStyle>
        <color>ff0000ff</color> <!-- Czerwony dla dojazdu samochodem -->
        <width>5</width>
      </LineStyle>
    </Style>
    
    <Style id="walkingStyle">
      <LineStyle>
        <color>ff00ff00</color> <!-- Zielony dla szlaku pieszego -->
        <width>4</width>
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
    
    <Style id="trailStartPoint">
      <IconStyle>
        <color>ff0000ff</color>
        <scale>1.1</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>
    
    <Style id="endPoint">
      <IconStyle>
        <color>ffff0000</color>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png</href>
        </Icon>
      </IconStyle>
    </Style>
    
    <!-- Punkty oznaczające -->
    <Placemark>
      <name>🚗 Start - Twoja lokalizacja</name>
      <description>Punkt początkowy podróży (dojazd samochodem)</description>
      <styleUrl>#startPoint</styleUrl>
      <Point>
        <coordinates>${userLocation.longitude},${userLocation.latitude},0</coordinates>
      </Point>
    </Placemark>
    
    <Placemark>
      <name>🅿️ Parking - Początek szlaku "${this.escapeXML(name)}"</name>
      <description>Tu zostawiasz samochód i zaczynasz wędrówkę pieszo</description>
      <styleUrl>#trailStartPoint</styleUrl>
      <Point>
        <coordinates>${trailStart[0]},${trailStart[1]},0</coordinates>
      </Point>
    </Placemark>
    
    <Placemark>
      <name>🎯 Meta - Koniec szlaku "${this.escapeXML(name)}"</name>
      <description>Meta wędrówki pieszej</description>
      <styleUrl>#endPoint</styleUrl>
      <Point>
        <coordinates>${trailEnd[0]},${trailEnd[1]},0</coordinates>
      </Point>
    </Placemark>
    
    <!-- Linia dojazdu (orientacyjna) -->
    <Placemark>
      <name>Dojazd samochodem</name>
      <description>Użyj nawigacji samochodowej, aby dojechać z punktu startowego do początku szlaku. Ta linia jest tylko orientacyjna - użyj rzeczywistej nawigacji drogowej.</description>
      <styleUrl>#drivingStyle</styleUrl>
      <LineString>
        <coordinates>
          ${userLocation.longitude},${userLocation.latitude},0
          ${trailStart[0]},${trailStart[1]},0
        </coordinates>
      </LineString>
    </Placemark>
    
    <!-- Szlak pieszy -->
    <Placemark>
      <name>Szlak pieszy - ${this.escapeXML(name)}</name>
      <description>Trasa wędrówki pieszej</description>
      <styleUrl>#walkingStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
${coords.map(coord => `          ${coord[0]},${coord[1]},0`).join('\n')}
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
  async offerGoogleMapsIntegration(geojson, name, userLocation, showCustomModal = null) {
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
          message: 'Plik został pobrany. Czy chcesz również otworzyć tę trasę w Google Maps?',
          confirmText: 'Otwórz w Google Maps',
          cancelText: 'Nie, dziękuję'
        });
        
        if (openInGoogleMaps) {
          await this.openRouteInGoogleMaps(geojson, name, userLocation, modalFn);
        }
      }, 500);
      
    } catch (error) {
      console.warn('Błąd podczas oferowania integracji Google Maps:', error);
    }
  }

  /**
   * Otwiera trasę w Google Maps
   */
  async openRouteInGoogleMaps(geojson, name, userLocation = null, showCustomModal = null) {
    try {
      const coords = this.extractCoordinates(geojson);
      if (!coords || coords.length === 0) {
        throw new Error("Nie udało się znaleźć współrzędnych trasy");
      }
      
      const trailStartPoint = coords[0];
      const trailEndPoint = coords[coords.length - 1];
      
      // Jeśli mamy lokalizację użytkownika, użyj wielomodalnej trasy
      if (userLocation && this.isValidLocation(userLocation)) {
        const origin = encodeURIComponent(`${userLocation.latitude},${userLocation.longitude}`);
        const waypoint = encodeURIComponent(`${trailStartPoint[1]},${trailStartPoint[0]}`);
        const destination = encodeURIComponent(`${trailEndPoint[1]},${trailEndPoint[0]}`);
        
        const googleMapsUrl = `https://www.google.com/maps/dir/${origin}/${waypoint}/${destination}/`;
        window.open(googleMapsUrl, '_blank');
        
        // Pokaż informację użytkownikowi
        this.showRouteInfo(name, true, showCustomModal);
        
      } else {
        // Bez lokalizacji użytkownika - tylko trasa piesza
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${trailStartPoint[1]},${trailStartPoint[0]}&destination=${trailEndPoint[1]},${trailEndPoint[0]}&travelmode=walking`;
        window.open(googleMapsUrl, '_blank');
        
        this.showRouteInfo(name, false, showCustomModal);
      }
      
    } catch (error) {
      console.error("Błąd podczas otwierania Google Maps:", error);
      alert("Nie udało się otworzyć trasy w Google Maps.");
    }
  }

  /**
   * Pokazuje informację o otwartej trasie
   */
  showRouteInfo(name, hasUserLocation, showCustomModal = null) {
    const modalFn = showCustomModal || (typeof window !== 'undefined' && window.showCustomModal);
    if (typeof modalFn !== 'function') return;
    
    setTimeout(() => {
      const message = hasUserLocation 
        ? `Google Maps pokaże trasę z 3 punktami:
📍 Start: Twoja lokalizacja
🚗 Parking: Początek szlaku "${name}"
🎯 Meta: Koniec szlaku

Google automatycznie zasugeruje najlepszy transport dla każdego odcinka.`
        : `Otwarto trasę pieszą "${name}" w Google Maps.`;
      
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