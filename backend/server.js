const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const { body, validationResult, query } = require('express-validator');
const winston = require('winston');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'llm-maps-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const askLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute for /api/ask
  message: {
    error: 'Too many chat requests, please slow down.',
    retryAfter: '1 minute'
  }
});

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per 15 minutes at full speed
  delayMs: 500 // slow down subsequent requests by 500ms per request
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "maps.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "maps.gstatic.com", "*.googleapis.com"],
      connectSrc: ["'self'", "maps.googleapis.com"]
    }
  }
}));

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Apply rate limiting
app.use('/api/', apiLimiter);
app.use('/api/', speedLimiter);
app.use('/api/ask', askLimiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// Input sanitization helper
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, 500); // Limit length to 500 chars
};

// Enhanced LLM query with better error handling
async function queryLLM(prompt) {
  const sanitizedPrompt = sanitizeInput(prompt);
  
  if (!sanitizedPrompt) {
    logger.error('Empty or invalid prompt provided to queryLLM');
    return 'Invalid input provided';
  }

  try {
    logger.info('Querying Open WebUI', { promptLength: sanitizedPrompt.length });
    
    const openWebUIResponse = await axios.post(`${process.env.OPEN_WEBUI_URL}/api/v1/chat/completions`, {
      model: 'tinyllama', 
      messages: [{ role: 'user', content: sanitizedPrompt }],
      stream: false
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000 // Increased timeout
    });
    
    if (openWebUIResponse.data?.choices?.[0]?.message?.content) {
      return openWebUIResponse.data.choices[0].message.content;
    } else {
      throw new Error('Invalid response format from Open WebUI');
    }
  } catch (openWebUIError) {
    logger.warn('Open WebUI failed, trying Ollama', { error: openWebUIError.message });
    
    try {
      const ollamaResponse = await axios.post('http://localhost:11434/api/generate', {
        model: 'tinyllama',
        prompt: sanitizedPrompt,
        stream: false
      }, {
        timeout: 15000
      });
      
      if (ollamaResponse.data?.response) {
        return ollamaResponse.data.response;
      } else {
        throw new Error('Invalid response format from Ollama');
      }
    } catch (ollamaError) {
      logger.error('Both LLM services failed', { 
        openWebUIError: openWebUIError.message,
        ollamaError: ollamaError.message 
      });
      return 'LLM service unavailable. Please try again later.';
    }
  }
}

// Validation middleware for /api/ask
const validateAskRequest = [
  body('message')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be between 1 and 500 characters')
    .escape(), // Prevent XSS
  body('userLocation')
    .optional()
    .isObject()
    .withMessage('User location must be an object'),
  body('userLocation.lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('userLocation.lng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
];

app.post('/api/ask', validateAskRequest, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed for /api/ask', { errors: errors.array(), ip: req.ip });
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: errors.array() 
      });
    }

    const { message, userLocation } = req.body;
    const clientIP = req.ip;
    
    logger.info('Processing ask request', { 
      messageLength: message.length, 
      hasLocation: !!userLocation,
      locationSource: userLocation?.source,
      ip: clientIP 
    });
    
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
    logger.error('Server error in /api/ask', { 
      error: error.message, 
      stack: error.stack,
      ip: req.ip 
    });
    
    // Don't expose internal error details
    res.status(500).json({ 
      error: 'Internal server error. Please try again later.',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  logger.info('Health check requested', { ip: req.ip });
  res.json(healthCheck);
});

app.get('/api/maps-config', (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey.length < 10) {
      logger.warn('Invalid Google Maps API key requested', { ip: req.ip });
      return res.status(500).json({ 
        error: 'Google Maps API key not properly configured',
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('Maps config requested', { ip: req.ip });
    res.json({ 
      apiKey: apiKey,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in /api/maps-config', { error: error.message, ip: req.ip });
    res.status(500).json({ 
      error: 'Failed to retrieve maps configuration',
      timestamp: new Date().toISOString()
    });
  }
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error', { 
    error: error.message, 
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip 
  });
  
  res.status(500).json({
    error: 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('404 - Route not found', { url: req.url, ip: req.ip });
  res.status(404).json({
    error: 'Route not found',
    url: req.url,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

app.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info('Security features enabled: Rate limiting, Helmet, Input validation');
  console.log(`Server running on http://localhost:${PORT}`);
});