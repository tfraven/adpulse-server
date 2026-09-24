const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { seedDatabase } = require('./config/seed');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Health Check & Database Info
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    database: 'Neon PostgreSQL (Production Cloud DB)',
    orm: 'Prisma Client',
    googleAds: 'Configured (AdSense ca-pub-4715061326676029)',
    timestamp: new Date().toISOString()
  });
});

let isInitialized = false;

// Start Server / Init DB
async function initServer() {
  if (isInitialized) return;
  try {
    console.log('🔄 [Prisma Init]: Verifying database schema & seeding initial catalog...');
    await seedDatabase();
    isInitialized = true;
    console.log('✅ [Prisma Ready]: Database synced and ready.');
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

// Start listening if running directly
if (process.env.VERCEL !== '1') {
  initServer().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 [Server Ready]: Backend with Prisma running on http://localhost:${PORT}`);
    });
  });
} else {
  // Ensure DB seed runs in serverless environment
  initServer();
}

module.exports = app;
