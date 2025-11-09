# 🗺️ Google Maps API Setup Guide

## Step 1: Create Google Cloud Account
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with Google account
3. Accept terms and create account

## Step 2: Create New Project
1. Click "Select Project" dropdown
2. Click "New Project"
3. Name: "LLM Maps App"
4. Click "Create"

## Step 3: Enable APIs
1. Go to "APIs & Services" > "Library"
2. Search and enable:
   - **Maps JavaScript API**
   - **Places API** 
   - **Geocoding API**

## Step 4: Create API Key
1. Go to "APIs & Services" > "Credentials"
2. Click "+ Create Credentials"
3. Select "API Key"
4. Copy the API key (starts with AIza...)

## Step 5: Secure API Key
1. Click "Restrict Key"
2. Application restrictions: "HTTP referrers"
3. Add: `localhost:3000/*`
4. API restrictions: Select specific APIs
5. Save

## Step 6: Update Your App
```bash
# Edit backend/.env
GOOGLE_MAPS_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxx
```

## Free Quota:
- $200 credit per month
- ~28,000 map loads
- ~40,000 directions requests
- Perfect for development!