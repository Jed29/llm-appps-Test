const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

async function queryLLM(prompt) {
  try {
    const openWebUIResponse = await axios.post(`${process.env.OPEN_WEBUI_URL}/api/v1/chat/completions`, {
      model: 'tinyllama', 
      messages: [{ role: 'user', content: prompt }],
      stream: false
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return openWebUIResponse.data.choices[0].message.content;
  } catch (openWebUIError) {
    try {
      const ollamaResponse = await axios.post('http://localhost:11434/api/generate', {
        model: 'tinyllama',
        prompt: prompt,
        stream: false
      });
      return ollamaResponse.data.response;
    } catch (ollamaError) {
      return 'LLM service unavailable';
    }
  }
}

app.post('/api/ask', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const normalizedMessage = message.toLowerCase().trim();
    let searchType = null;
    let responseText = "Saya akan membantu Anda.";
    
    if (normalizedMessage.includes('atm')) {
      searchType = 'ATM';
      responseText = "Saya akan carikan ATM untuk Anda.";
    } else if (normalizedMessage.match(/restoran|restaurant|makan|kuliner|tempat makan|warung|cafe|gultik/i)) {
      searchType = 'restaurants';
      responseText = "Saya akan carikan restoran untuk Anda.";
    } else if (normalizedMessage.match(/apotek|pharmacy|obat|farmasi/i)) {
      searchType = 'pharmacy';
      responseText = "Saya akan carikan apotek untuk Anda.";
    } else if (normalizedMessage.match(/spbu|gas station|bensin|pertamina|shell|pom/i)) {
      searchType = 'gas station';
      responseText = "Saya akan carikan SPBU untuk Anda.";
    } else if (normalizedMessage.match(/rumah sakit|hospital|rs |klinik/i)) {
      searchType = 'hospitals';
      responseText = "Saya akan carikan rumah sakit untuk Anda.";
    } else if (normalizedMessage.match(/hotel|penginapan|homestay/i)) {
      searchType = 'hotels';
      responseText = "Saya akan carikan hotel untuk Anda.";
    }
    
    let llmResponse = responseText;
    if (!searchType) {
      try {
        llmResponse = await queryLLM(`Analyze: "${message}". If location search, respond: "Saya akan carikan [item] untuk Anda. LOCATION_SEARCH:[type]" where type is ATM, restaurants, pharmacy, gas station, hospitals, or hotels. If not location search, respond helpfully in Indonesian.`);
        if (llmResponse.includes('LOCATION_SEARCH:')) {
          const match = llmResponse.match(/LOCATION_SEARCH:([^\n"]*)/);
          if (match) searchType = match[1].trim();
        }
      } catch (error) {
        llmResponse = "Maaf, silakan coba lagi.";
      }
    } else {
      llmResponse = `${responseText} LOCATION_SEARCH:${searchType}`;
    }
    
    let mapData = null;
    
    if (searchType) {
      mapData = {
        searchQuery: searchType,
        mapUrl: `https://www.google.com/maps/search/${encodeURIComponent(searchType)}`,
        embedUrl: `https://www.google.com/maps/embed/v1/search?key=${process.env.GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY'}&q=${encodeURIComponent(searchType)}`
      };
    }
    
    const cleanResponse = llmResponse.replace(/LOCATION_SEARCH:.*/, '').trim();
    
    res.json({ 
      reply: cleanResponse,
      userMessage: message,
      mapData: mapData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.get('/api/maps-config', (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY') {
    return res.status(500).json({ error: 'API key not configured' });
  }
  res.json({ apiKey: apiKey });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});