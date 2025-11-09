# 🗺️ Google Maps API Setup

## Option 1: Quick Test (No API Key Required)
- Uses Google Maps search URLs
- Works immediately, no registration needed
- Limited to opening new tabs

## Option 2: Full Integration (API Key Required)

### 1. Get Google Maps API Key:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable "Maps JavaScript API" and "Places API"
4. Create API Key in Credentials
5. Restrict API key to your domain

### 2. Update Backend:
```bash
# Edit backend/.env
GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

### 3. Security Best Practices:
- **Domain Restriction**: Limit API key to localhost:3000
- **API Restriction**: Only enable Maps JS API and Places API  
- **Usage Limits**: Set daily quotas
- **Monitor Usage**: Check Google Cloud Console regularly

## Current Implementation:
- ✅ **URL Generation**: Creates Google Maps search links
- ✅ **Location Parsing**: LLM extracts location keywords
- ✅ **Map Integration**: Opens maps in new tab/window
- ⏳ **Embedded Maps**: Ready for API key integration

## Test Commands:
```javascript
// Test location search
fetch('/api/ask', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({message: 'cari restoran sushi terdekat'})
})
```

## Security Note:
Never commit API keys to git! Always use environment variables.