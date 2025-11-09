export interface LocationCoords {
  lat: number;
  lng: number;
  accuracy?: number;
  source: 'gps' | 'network' | 'ip' | 'fallback';
}

export interface LocationError {
  code: number;
  message: string;
  source: string;
}

class GeolocationService {
  private static instance: GeolocationService;
  private cachedLocation: LocationCoords | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Major city coordinates as fallbacks
  private readonly FALLBACK_LOCATIONS = {
    jakarta: { lat: -6.2088, lng: 106.8456, source: 'fallback' as const },
    surabaya: { lat: -7.2575, lng: 112.7521, source: 'fallback' as const },
    bandung: { lat: -6.9175, lng: 107.6191, source: 'fallback' as const },
    medan: { lat: 3.5952, lng: 98.6722, source: 'fallback' as const },
    semarang: { lat: -6.9667, lng: 110.4167, source: 'fallback' as const }
  };

  public static getInstance(): GeolocationService {
    if (!GeolocationService.instance) {
      GeolocationService.instance = new GeolocationService();
    }
    return GeolocationService.instance;
  }

  private constructor() {}

  /**
   * Get user location with multiple fallback strategies
   */
  public async getCurrentLocation(): Promise<LocationCoords> {
    // Check cache first
    if (this.isCacheValid()) {
      console.log('📍 Using cached location');
      return this.cachedLocation!;
    }

    try {
      // Strategy 1: High accuracy GPS
      const gpsLocation = await this.getGPSLocation();
      this.updateCache(gpsLocation);
      return gpsLocation;
    } catch (gpsError) {
      console.warn('GPS failed:', gpsError);

      try {
        // Strategy 2: Network-based location
        const networkLocation = await this.getNetworkLocation();
        this.updateCache(networkLocation);
        return networkLocation;
      } catch (networkError) {
        console.warn('Network location failed:', networkError);

        try {
          // Strategy 3: IP-based location
          const ipLocation = await this.getIPLocation();
          this.updateCache(ipLocation);
          return ipLocation;
        } catch (ipError) {
          console.warn('IP location failed:', ipError);

          // Strategy 4: Fallback to major city
          const fallbackLocation = this.getFallbackLocation();
          console.log('📍 Using fallback location:', fallbackLocation);
          return fallbackLocation;
        }
      }
    }
  }

  /**
   * Get high-accuracy GPS location
   */
  private async getGPSLocation(): Promise<LocationCoords> {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('GPS timeout after 10 seconds'));
      }, 10000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          console.log('✅ GPS location obtained');
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: 'gps'
          });
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(this.formatGeolocationError(error));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 2 * 60 * 1000 // Accept 2-minute old position
        }
      );
    });
  }

  /**
   * Get network-based location (lower accuracy, faster)
   */
  private async getNetworkLocation(): Promise<LocationCoords> {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Network location timeout after 5 seconds'));
      }, 5000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          console.log('✅ Network location obtained');
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: 'network'
          });
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(this.formatGeolocationError(error));
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 5 * 60 * 1000 // Accept 5-minute old position
        }
      );
    });
  }

  /**
   * Get IP-based location using ipapi.co
   */
  private async getIPLocation(): Promise<LocationCoords> {
    try {
      console.log('🌐 Attempting IP-based location...');
      
      const response = await fetch('https://ipapi.co/json/', {
        timeout: 5000
      } as RequestInit);

      if (!response.ok) {
        throw new Error(`IP location API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.latitude || !data.longitude) {
        throw new Error('Invalid IP location data');
      }

      console.log('✅ IP location obtained:', data.city, data.country_name);
      
      return {
        lat: parseFloat(data.latitude),
        lng: parseFloat(data.longitude),
        source: 'ip'
      };
    } catch (error) {
      throw new Error(`IP location failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get fallback location based on timezone or random major city
   */
  private getFallbackLocation(): LocationCoords {
    try {
      // Try to determine location based on timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      if (timezone.includes('Jakarta') || timezone.includes('Asia/Jakarta')) {
        return this.FALLBACK_LOCATIONS.jakarta;
      }
      
      // Default to Jakarta as it's the capital
      return this.FALLBACK_LOCATIONS.jakarta;
    } catch (error) {
      console.warn('Timezone detection failed, using Jakarta');
      return this.FALLBACK_LOCATIONS.jakarta;
    }
  }

  /**
   * Format geolocation error for better debugging
   */
  private formatGeolocationError(error: GeolocationPositionError): Error {
    let message = 'Geolocation failed';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Location access denied by user';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Location information unavailable';
        break;
      case error.TIMEOUT:
        message = 'Location request timed out';
        break;
      default:
        message = error.message || 'Unknown geolocation error';
    }
    
    return new Error(message);
  }

  /**
   * Check if cached location is still valid
   */
  private isCacheValid(): boolean {
    return (
      this.cachedLocation !== null &&
      Date.now() - this.cacheTimestamp < this.CACHE_DURATION
    );
  }

  /**
   * Update location cache
   */
  private updateCache(location: LocationCoords): void {
    this.cachedLocation = location;
    this.cacheTimestamp = Date.now();
    
    // Store in localStorage for persistence across page reloads
    try {
      localStorage.setItem('lastKnownLocation', JSON.stringify({
        location,
        timestamp: this.cacheTimestamp
      }));
    } catch (error) {
      console.warn('Failed to cache location in localStorage:', error);
    }
  }

  /**
   * Try to restore location from localStorage
   */
  public restoreFromCache(): LocationCoords | null {
    try {
      const cached = localStorage.getItem('lastKnownLocation');
      if (!cached) return null;

      const { location, timestamp } = JSON.parse(cached);
      
      // Check if cache is still valid (30 minutes for localStorage)
      if (Date.now() - timestamp < 30 * 60 * 1000) {
        this.cachedLocation = location;
        this.cacheTimestamp = timestamp;
        console.log('📍 Restored location from localStorage');
        return location;
      }
    } catch (error) {
      console.warn('Failed to restore location from localStorage:', error);
    }
    
    return null;
  }

  /**
   * Clear location cache
   */
  public clearCache(): void {
    this.cachedLocation = null;
    this.cacheTimestamp = 0;
    
    try {
      localStorage.removeItem('lastKnownLocation');
    } catch (error) {
      console.warn('Failed to clear localStorage location cache:', error);
    }
  }

  /**
   * Get distance between two coordinates (Haversine formula)
   */
  public static getDistance(coord1: LocationCoords, coord2: LocationCoords): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(coord2.lat - coord1.lat);
    const dLng = this.toRadians(coord2.lng - coord1.lng);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(coord1.lat)) * Math.cos(this.toRadians(coord2.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Watch position with error handling and automatic fallback
   */
  public watchPosition(
    callback: (location: LocationCoords) => void,
    errorCallback?: (error: LocationError) => void
  ): number | null {
    if (!navigator.geolocation) {
      errorCallback?.({
        code: -1,
        message: 'Geolocation not supported',
        source: 'browser'
      });
      return null;
    }

    return navigator.geolocation.watchPosition(
      (position) => {
        const location: LocationCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'gps'
        };
        
        this.updateCache(location);
        callback(location);
      },
      (error) => {
        errorCallback?.({
          code: error.code,
          message: this.formatGeolocationError(error).message,
          source: 'geolocation'
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000 // 1 minute
      }
    );
  }

  /**
   * Stop watching position
   */
  public clearWatch(watchId: number): void {
    navigator.geolocation?.clearWatch(watchId);
  }
}

export default GeolocationService;