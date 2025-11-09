# LLM Maps App

Aplikasi chat dengan local LLM yang terintegrasi dengan Google Maps untuk pencarian lokasi.

## 📁 Project Structure

```
llm-maps-app/
├── README.md                # Project documentation
├── backend/                 # Backend API server
│   ├── server.js           # Express server dengan Ollama integration
│   ├── package.json        # Backend dependencies
│   ├── .env                # Environment variables
│   └── node_modules/       # Installed packages
├── frontend/               # Frontend web interface
│   └── index.html          # Chat UI dengan map integration
└── docs/                   # Documentation (optional)
```

## 🚀 Quick Start

### 1. Setup Ollama
```bash
brew install ollama
brew services start ollama
ollama pull llama3.2:1b
```

### 2. Setup Backend
```bash
cd backend
npm install
npm run dev
```

### 3. Setup Frontend
Buka browser ke: `http://localhost:3000`

## 🔧 Configuration

### Environment Variables (.env)
```
PORT=3000
OLLAMA_URL=http://localhost:11434
```

## 📡 API Endpoints

- `GET /` - API info
- `POST /api/ask` - Chat dengan LLM
- `GET /api/health` - Health check

## 🗺️ Features

- ✅ Local LLM chat dengan Ollama
- ✅ Location search parsing
- ✅ Google Maps integration
- ✅ Real-time chat interface
- ⏳ Embedded maps (coming soon)

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express
- Ollama (Llama3.2:1b)
- Axios for HTTP requests

**Frontend:**
- Vanilla HTML/CSS/JS
- Google Maps API

**Infrastructure:**
- Local development
- RESTful API design
