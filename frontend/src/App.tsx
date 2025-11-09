import React, { useState, useRef, useEffect } from 'react';

interface MapData {
  searchQuery: string;
  mapUrl: string;
  embedUrl: string;
  recommendations?: Array<{
    name: string;
    mapUrl: string;
  }>;
}

interface ApiResponse {
  reply: string;
  userMessage: string;
  mapData?: MapData;
  timestamp: string;
}

function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [responses, setResponses] = useState<ApiResponse[]>([]);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const mapCounter = useRef(0);
  const [pendingMaps, setPendingMaps] = useState<Array<{searchQuery: string, mapId: string}>>([]);

  useEffect(() => {
    // Add global error handler for Google Maps errors
    const originalError = console.error;
    console.error = (...args) => {
      const errorStr = args.join(' ');
      if (errorStr.includes('zJ') || errorStr.includes('Google Maps')) {
        console.warn('🗺️ Google Maps API Error detected:', errorStr);
        // Force fallback mode
        setMapsLoaded(true);
      } else {
        originalError.apply(console, args);
      }
    };

    // Add global unhandled promise rejection handler
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason && event.reason.toString().includes('zJ')) {
        console.warn('🗺️ Google Maps Promise Error detected:', event.reason);
        event.preventDefault(); // Prevent error from appearing in console
        setMapsLoaded(true);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    loadGoogleMaps();

    // Cleanup
    return () => {
      console.error = originalError;
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Handle pending maps after DOM updates
  useEffect(() => {
    if (pendingMaps.length > 0) {
      console.log('📋 Processing pending maps:', pendingMaps);
      
      pendingMaps.forEach(({searchQuery, mapId}, index) => {
        setTimeout(() => {
          console.log(`⚡ Processing pending map ${index + 1}:`, {searchQuery, mapId});
          
          // Try multiple selectors to find the element
          let element = document.getElementById(mapId);
          
          if (!element) {
            // Try finding by partial ID match
            const allMapDivs = document.querySelectorAll('[id*="map-"]');
            console.log('🔍 All map divs found:', Array.from(allMapDivs).map(el => el.id));
            
            // Get the last created map element
            element = allMapDivs[allMapDivs.length - 1] as HTMLElement;
          }
          
          if (element) {
            console.log('✅ Found element for map, force updating content...');
            
            // Directly update the content instead of calling initializeMap
            element.innerHTML = `
              <div style="
                width: 100%; height: 100%; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 15px;
                display: flex; align-items: center; justify-content: center;
                flex-direction: column; color: white; text-align: center; padding: 30px;
                position: relative; overflow: hidden;
              ">
                <div style="
                  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                  background-image: 
                    linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px);
                  background-size: 20px 20px; opacity: 0.3;
                "></div>
                
                <div style="position: relative; z-index: 2;">
                  <div style="font-size: 64px; margin-bottom: 20px;">🗺️</div>
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: 600;">
                    Hasil Pencarian
                  </h2>
                  <p style="margin: 0 0 20px 0; font-size: 16px; opacity: 0.9;">
                    <strong>"${searchQuery}"</strong>
                  </p>
                  <a href="https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}" target="_blank" style="
                    background: rgba(255,255,255,0.2); 
                    backdrop-filter: blur(10px);
                    color: white; 
                    padding: 16px 32px; 
                    text-decoration: none; 
                    border-radius: 25px; 
                    display: inline-block; 
                    font-weight: bold;
                    font-size: 16px;
                    border: 2px solid rgba(255,255,255,0.3);
                    transition: all 0.3s ease;
                  " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
                     onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                    🔍 Buka di Google Maps →
                  </a>
                  <p style="margin: 16px 0 0 0; font-size: 12px; opacity: 0.7;">
                    ✨ Free Trial Mode - Direct ke Google Maps
                  </p>
                </div>
              </div>
            `;
            
            console.log('🎨 Map content updated successfully!');
          } else {
            console.log('❌ Still no map element found after all attempts');
          }
        }, (index + 1) * 1000); // Longer delay
      });
      
      // Clear pending maps after processing
      setTimeout(() => setPendingMaps([]), 2000);
    }
  }, [responses]); // Trigger after responses update

  const loadGoogleMaps = async () => {
    try {
      // Clean up any existing Google Maps scripts and instances
      const existingScripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
      existingScripts.forEach(script => script.remove());
      
      // Clear existing Google Maps objects
      if ((window as any).google) {
        delete (window as any).google;
      }
      if ((window as any).mapsReady) {
        delete (window as any).mapsReady;
      }

      const response = await fetch('http://localhost:3000/api/maps-config');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.warn('⚠️ Maps API config error:', errorData.message);
        setMapsLoaded(true);
        return;
      }
      
      const config = await response.json();
      
      if (!config.apiKey) {
        console.warn('⚠️ No API key provided, using sandbox mode');
        setMapsLoaded(true); 
        return;
      }
      
      // Create unique callback name to prevent conflicts
      const callbackName = `mapsReady${Date.now()}`;
      
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${config.apiKey}&libraries=places,geometry&callback=${callbackName}`;
      script.defer = true;
      script.id = 'google-maps-script';
      
      // Add error handler for script loading
      script.onerror = () => {
        console.error('❌ Failed to load Google Maps API - check your API key');
        setMapsLoaded(true);
      };
      
      (window as any)[callbackName] = () => {
        setMapsLoaded(true);
        console.log('✅ Google Maps loaded successfully!');
        // Clean up callback after use
        delete (window as any)[callbackName];
      };
      
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to load Google Maps:', error);
      setMapsLoaded(true);
    }
  };

  const getServiceTags = (query: string) => {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('atm')) {
      return `
        <span style="background: #e8f4fd; color: #0066cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">🏧 ATM</span>
        <span style="background: #f0f9ff; color: #0088cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">💳 Bank</span>
        <span style="background: #fff2e8; color: #cc6600; padding: 4px 8px; border-radius: 12px; font-size: 11px;">📍 Terdekat</span>
      `;
    } else if (lowerQuery.includes('restoran') || lowerQuery.includes('restaurant')) {
      return `
        <span style="background: #e8f4fd; color: #0066cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">🍽️ Restoran</span>
        <span style="background: #f0f9ff; color: #0088cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">🍕 Food</span>
        <span style="background: #fff2e8; color: #cc6600; padding: 4px 8px; border-radius: 12px; font-size: 11px;">📍 Terdekat</span>
      `;
    } else if (lowerQuery.includes('rumah sakit') || lowerQuery.includes('hospital')) {
      return `
        <span style="background: #e8f4fd; color: #0066cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">🏥 Hospital</span>
        <span style="background: #f0f9ff; color: #0088cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">⚕️ Medical</span>
        <span style="background: #fff2e8; color: #cc6600; padding: 4px 8px; border-radius: 12px; font-size: 11px;">📍 Terdekat</span>
      `;
    } else if (lowerQuery.includes('apotek') || lowerQuery.includes('pharmacy')) {
      return `
        <span style="background: #e8f4fd; color: #0066cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">💊 Apotek</span>
        <span style="background: #f0f9ff; color: #0088cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">💉 Pharmacy</span>
        <span style="background: #fff2e8; color: #cc6600; padding: 4px 8px; border-radius: 12px; font-size: 11px;">📍 Terdekat</span>
      `;
    } else {
      return `
        <span style="background: #e8f4fd; color: #0066cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">🗺️ Lokasi</span>
        <span style="background: #f0f9ff; color: #0088cc; padding: 4px 8px; border-radius: 12px; font-size: 11px;">📍 Terdekat</span>
        <span style="background: #fff2e8; color: #cc6600; padding: 4px 8px; border-radius: 12px; font-size: 11px;">🏢 Places</span>
      `;
    }
  };

  const initializeMap = async (searchQuery: string, mapId: string) => {
    console.log('🗺️ Initializing map for:', searchQuery, 'with ID:', mapId);
    
    // Use a more robust element finder with retries
    let mapElement = document.getElementById(mapId);
    let retries = 0;
    
    while (!mapElement && retries < 5) {
      console.log(`🔄 Retry ${retries + 1}: Looking for element ${mapId}...`);
      await new Promise(resolve => setTimeout(resolve, 200));
      mapElement = document.getElementById(mapId);
      retries++;
    }
    
    if (!mapElement) {
      console.error('❌ Map element not found after retries:', mapId);
      // Try to find any map element as fallback
      const allMapElements = document.querySelectorAll('[id*="map-"]');
      console.log('🔍 Available map elements:', Array.from(allMapElements).map(el => el.id));
      
      if (allMapElements.length > 0) {
        mapElement = allMapElements[allMapElements.length - 1] as HTMLElement;
        console.log('📍 Using fallback element:', mapElement.id);
      } else {
        return;
      }
    }

    console.log('✅ Map element found, clearing content...');
    
    // Force clear any existing content completely
    mapElement.innerHTML = '';
    
    // Aggressively remove ALL Google Maps related elements
    const existingGoogleElements = document.querySelectorAll('[class*="gm-"], [class*="gmnoprint"], [class*="gm_"], [id*="gm-"], [class*="pac-"], [class*="place-"]');
    existingGoogleElements.forEach(el => {
      try {
        if (el && el.parentNode && !mapElement.contains(el)) {
          el.remove();
        }
      } catch (e) {
        // Ignore errors when removing elements
      }
    });
    
    // Clear any lingering map-related divs
    const mapDivs = document.querySelectorAll('div[style*="position: absolute"][style*="z-index"]');
    mapDivs.forEach(div => {
      if (div && div.className && div.className.includes('gm')) {
        try {
          div.remove();
        } catch (e) {
          // Ignore errors
        }
      }
    });

    console.log('🔍 Checking Google Maps availability...');
    console.log('- google object:', typeof google);
    console.log('- google.maps:', typeof google?.maps);
    console.log('- google.maps.places:', typeof google?.maps?.places);

    // Always show fallback for free trial - simpler approach
    console.log('💡 Showing Google Maps link fallback...');
    mapElement.innerHTML = `
      <div style="
        width: 100%; height: 100%; 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 15px;
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; color: white; text-align: center; padding: 30px;
        position: relative; overflow: hidden;
      ">
        <!-- Background pattern -->
        <div style="
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background-image: 
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px);
          background-size: 20px 20px; opacity: 0.3;
        "></div>
        
        <div style="position: relative; z-index: 2;">
          <div style="font-size: 64px; margin-bottom: 20px;">🗺️</div>
          <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: 600;">
            Hasil Pencarian
          </h2>
          <p style="margin: 0 0 20px 0; font-size: 16px; opacity: 0.9;">
            <strong>"${searchQuery}"</strong>
          </p>
          <a href="https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}" target="_blank" style="
            background: rgba(255,255,255,0.2); 
            backdrop-filter: blur(10px);
            color: white; 
            padding: 16px 32px; 
            text-decoration: none; 
            border-radius: 25px; 
            display: inline-block; 
            font-weight: bold;
            font-size: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            transition: all 0.3s ease;
          " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
             onmouseout="this.style.background='rgba(255,255,255,0.2)'">
            🔍 Buka di Google Maps →
          </a>
          <p style="margin: 16px 0 0 0; font-size: 12px; opacity: 0.7;">
            ✨ Free Trial Mode - Direct ke Google Maps
          </p>
        </div>
      </div>
    `;
    
    console.log('✅ Fallback map displayed!');
    return;

    try {
      // Get user location first, fallback to Jakarta
      const defaultLocation = { lat: -6.2088, lng: 106.8456 };
      let userLocation = defaultLocation;

      // Try to get user's current location
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              enableHighAccuracy: false
            });
          });
          userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          console.log('📍 Using user location:', userLocation);
        } catch (geoError) {
          console.log('📍 Using default Jakarta location');
        }
      }

      // Create map with error handling
      let map;
      try {
        map = new google.maps.Map(mapElement, {
          zoom: 14,
          center: userLocation,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'on' }]
            }
          ]
        });
      } catch (mapError) {
        console.error('Google Maps creation failed:', mapError);
        throw new Error('Google Maps initialization failed');
      }

      // Check if Places service is available before using
      if (!google.maps.places || !google.maps.places.PlacesService) {
        throw new Error('Places API not available');
      }

      // Create Places service with error handling
      let service;
      try {
        service = new google.maps.places.PlacesService(map);
      } catch (serviceError) {
        console.error('Places service creation failed:', serviceError);
        throw new Error('Places service unavailable');
      }
      const request: google.maps.places.TextSearchRequest = {
        query: searchQuery,
        location: userLocation,
        radius: 5000,
        fields: ['name', 'geometry', 'formatted_address', 'rating', 'place_id']
      };

      // Add timeout for Places API
      const searchTimeout = setTimeout(() => {
        mapElement.innerHTML = `
          <div style="
            width: 100%; height: 100%; background: #f8d7da; border-radius: 15px;
            display: flex; align-items: center; justify-content: center;
            flex-direction: column; color: #721c24; text-align: center; padding: 20px;
          ">
            <div style="font-size: 48px; margin-bottom: 16px;">⏱️</div>
            <h3>Search Timeout</h3>
            <p>Failed to load places for: <strong>${searchQuery}</strong></p>
          </div>
        `;
      }, 10000);

      // Search for places with comprehensive error handling
      service.textSearch(request, (results, status) => {
        clearTimeout(searchTimeout);
        
        // Handle different API status codes
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          console.log(`✅ Found ${results.length} places for: ${searchQuery}`);
          
          // Center map on first result or keep user location
          if (results[0]) {
            map.setCenter(results[0].geometry!.location);
            map.setZoom(15);
          }

          // Add markers for each place with null safety
          results.slice(0, 10).forEach((place, index) => {
            if (place && place.geometry && place.geometry.location && place.name) {
              try {
                const marker = new google.maps.Marker({
                  position: place.geometry.location,
                  map: map,
                  title: place.name || 'Unknown Place',
                  label: {
                    text: (index + 1).toString(),
                    color: 'white',
                    fontWeight: 'bold'
                  },
                  animation: google.maps.Animation.DROP
                });

                // Safe content generation
                const placeName = place.name || 'Unknown Place';
                const placeAddress = place.formatted_address || 'Address not available';
                const placeRating = place.rating || null;
                const placeId = place.place_id || '';

                const infoContent = `
                  <div style="max-width: 200px; padding: 8px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #333;">${placeName}</h3>
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #666; line-height: 1.4;">${placeAddress}</p>
                    ${placeRating ? `<div style="margin: 4px 0; font-size: 12px;"><span style="color: #ff9800;">⭐</span> ${placeRating}</div>` : ''}
                    ${placeId ? `
                      <div style="margin-top: 8px;">
                        <a href="https://www.google.com/maps/place/?q=place_id:${placeId}" target="_blank" style="
                          background: #4285f4; color: white; padding: 4px 8px; text-decoration: none; 
                          border-radius: 4px; font-size: 11px; display: inline-block;
                        ">Open in Maps</a>
                      </div>
                    ` : ''}
                  </div>
                `;

                const infoWindow = new google.maps.InfoWindow({
                  content: infoContent
                });

                marker.addListener('click', () => {
                  infoWindow.open(map, marker);
                });

                // Auto-open first marker
                if (index === 0) {
                  setTimeout(() => {
                    infoWindow.open(map, marker);
                  }, 1000);
                }
              } catch (markerError) {
                console.warn('Error creating marker:', markerError);
              }
            }
          });

        } else {
          // Handle different error statuses
          let errorMsg = 'Places search failed';
          let errorIcon = '⚠️';
          let errorColor = '#856404';
          let bgColor = '#fff3cd';
          
          switch (status) {
            case google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
              errorMsg = 'No places found';
              errorIcon = '🔍';
              break;
            case google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT:
              errorMsg = 'API quota exceeded';
              errorIcon = '⏱️';
              errorColor = '#721c24';
              bgColor = '#f8d7da';
              break;
            case google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
              errorMsg = 'Places API access denied';
              errorIcon = '🚫';
              errorColor = '#721c24';
              bgColor = '#f8d7da';
              break;
            case google.maps.places.PlacesServiceStatus.INVALID_REQUEST:
              errorMsg = 'Invalid search request';
              errorIcon = '❌';
              break;
            default:
              console.warn('Places search failed with status:', status);
          }
          
          mapElement.innerHTML = `
            <div style="
              width: 100%; height: 100%; background: ${bgColor}; border-radius: 15px;
              display: flex; align-items: center; justify-content: center;
              flex-direction: column; color: ${errorColor}; text-align: center; padding: 20px;
            ">
              <div style="font-size: 48px; margin-bottom: 16px;">${errorIcon}</div>
              <h3>${errorMsg}</h3>
              <p style="margin-bottom: 16px;">You can still search on Google Maps directly</p>
              <a href="https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}" target="_blank" style="
                background: #4285f4; color: white; padding: 12px 20px; text-decoration: none; 
                border-radius: 8px; display: inline-block; font-weight: bold;
              ">🔍 Search "${searchQuery}" on Google Maps</a>
            </div>
          `;
        }
      });

    } catch (error) {
      console.error('Map initialization error:', error);
      mapElement.innerHTML = `
        <div style="
          width: 100%; height: 100%; background: #f8d7da; border-radius: 15px;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; color: #721c24; text-align: center; padding: 20px;
        ">
          <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
          <h3>Map Error</h3>
          <p>Failed to load map for: ${searchQuery}</p>
        </div>
      `;
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    
    try {
      // Add retry mechanism for network errors
      let response;
      let retries = 3;
      
      while (retries > 0) {
        try {
          response = await fetch('http://localhost:3000/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: query }),
            timeout: 10000
          } as RequestInit);
          break;
        } catch (fetchError) {
          retries--;
          if (retries === 0) throw fetchError;
          console.log(`Retrying... ${retries} attempts left`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!response || !response.ok) {
        throw new Error(`Server error: ${response?.status || 'Network failed'}`);
      }

      const data: ApiResponse = await response.json();
      setResponses(prev => [...prev, data]);
      
      if (data.mapData && data.mapData.searchQuery) {
        mapCounter.current++;
        const mapId = `map-${mapCounter.current}-${Date.now()}`;
        
        console.log('🎯 Map data detected:', {
          searchQuery: data.mapData.searchQuery,
          mapId: mapId,
          mapsLoaded: mapsLoaded
        });
        
        // Add to pending maps to be processed after DOM update
        setPendingMaps(prev => [...prev, {
          searchQuery: data.mapData!.searchQuery,
          mapId: mapId
        }]);
        
        console.log('📝 Added to pending maps queue');
      } else {
        console.log('❌ No map data in response:', data);
      }
      
      setQuery('');
    } catch (error) {
      console.error('Search failed:', error);
      setResponses(prev => [...prev, {
        reply: '❌ Maaf, terjadi kesalahan. Pastikan server backend berjalan di port 3000.',
        userMessage: query,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const quickSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    setTimeout(() => handleSearch(), 0);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ 
            fontSize: '3rem', 
            fontWeight: '600', 
            color: 'white', 
            marginBottom: '12px',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            Mau Kemana Hari Ini?
          </h1>
          <p style={{ 
            fontSize: '1.2rem', 
            color: 'rgba(255, 255, 255, 0.9)', 
            fontWeight: '300' 
          }}>
            Tanya saja, kami akan carikan tempatnya untuk Anda
          </p>
        </div>

        {/* Search Input */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ position: 'relative', background: 'white', borderRadius: '25px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Contoh: Cari restoran sushi terdekat..."
              style={{
                width: '100%',
                padding: '20px 60px 20px 25px',
                border: 'none',
                fontSize: '1.1rem',
                outline: 'none',
                background: 'transparent',
                borderRadius: '25px'
              }}
              disabled={loading}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'linear-gradient(45deg, #667eea, #764ba2)',
                border: 'none',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '1.2rem',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? '...' : '→'}
            </button>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', marginTop: '20px', color: 'white' }}>
              <span>Mencari lokasi untuk Anda...</span>
            </div>
          )}
        </div>

        {/* Quick Suggestions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginBottom: '30px' }}>
          {[
            { emoji: '🍽️', text: 'Restoran Terdekat', query: 'restoran terdekat' },
            { emoji: '🏧', text: 'ATM Terdekat', query: 'ATM terdekat' },
            { emoji: '🏥', text: 'Rumah Sakit', query: 'rumah sakit terdekat' },
            { emoji: '💊', text: 'Apotek 24 Jam', query: 'apotek 24 jam' },
            { emoji: '⛽', text: 'SPBU', query: 'SPBU terdekat' }
          ].map((suggestion, index) => (
            <button
              key={index}
              onClick={() => quickSearch(suggestion.query)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                padding: '10px 18px',
                borderRadius: '25px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                backdropFilter: 'blur(10px)'
              }}
            >
              {suggestion.emoji} {suggestion.text}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {responses.map((response, index) => {
            const mapId = response.mapData ? `map-${index + 1}-${response.timestamp}` : '';
            return (
              <div key={index} style={{ 
                background: 'white', 
                borderRadius: '20px', 
                padding: '25px', 
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)' 
              }}>
                <div style={{ marginBottom: '15px' }}>
                  <p style={{ fontSize: '1.1rem', lineHeight: '1.6', color: '#333' }}>
                    <span style={{ fontWeight: '600', color: '#667eea' }}>🤖 Asisten:</span> {response.reply}
                  </p>
                </div>

                {response.mapData && response.mapData.searchQuery && (
                  <>
                    <div style={{ 
                      width: '100%', 
                      height: '400px', 
                      background: '#f8f9fa', 
                      borderRadius: '15px',
                      marginBottom: '15px',
                      overflow: 'hidden',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      border: '2px solid #007bff' // Debug border
                    }}>
                      <div
                        id={mapId}
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#666',
                          fontSize: '1.1rem',
                          background: '#e9ecef' // Debug background
                        }}
                        ref={(el) => {
                          if (el) {
                            console.log('📍 Map element created in DOM:', {
                              id: mapId,
                              element: el,
                              innerHTML: el.innerHTML
                            });
                          }
                        }}
                      >
                        🗺️ Loading map untuk: {response.mapData.searchQuery}
                      </div>
                    </div>

                    {/* Recommendations */}
                    {response.mapData.recommendations && Array.isArray(response.mapData.recommendations) && response.mapData.recommendations.length > 1 && (
                      <div style={{ marginBottom: '15px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>📍 Rekomendasi Lokasi:</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {response.mapData.recommendations.map((rec, idx) => (
                            rec && rec.name && rec.mapUrl ? (
                              <a
                                key={idx}
                                href={rec.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  background: '#f8f9fa',
                                  color: '#333',
                                  padding: '8px 12px',
                                  textDecoration: 'none',
                                  borderRadius: '15px',
                                  fontSize: '12px',
                                  border: '1px solid #e0e0e0',
                                  display: 'inline-block'
                                }}
                              >
                                📍 {rec.name}
                              </a>
                            ) : null
                          ))}
                        </div>
                      </div>
                    )}

                    {response.mapData.mapUrl && (
                      <div style={{ textAlign: 'center' }}>
                        <a
                          href={response.mapData.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: 'linear-gradient(45deg, #667eea, #764ba2)',
                            color: 'white',
                            padding: '12px 24px',
                            textDecoration: 'none',
                            borderRadius: '25px',
                            display: 'inline-block',
                            marginTop: '10px'
                          }}
                        >
                          🗺️ Buka di Google Maps
                        </a>
                      </div>
                    )}
                  </>
                )}

                {!response.mapData && (
                  <div style={{ 
                    padding: '20px', 
                    background: '#f8f9fa', 
                    borderRadius: '10px', 
                    textAlign: 'center', 
                    color: '#666' 
                  }}>
                    💭 Tidak terdeteksi sebagai query lokasi. Coba: "cari restoran", "dimana ATM terdekat", dll.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;