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
    database: 'SQLite (local dev.db file)',
    orm: 'Prisma Client',
    googleAds: 'Configured (AdSense ca-pub-9482019482019482)',
    timestamp: new Date().toISOString()
  });
});

// Start Server
async function startServer() {
  try {
    console.log('🔄 [Prisma Init]: Checking database schema and seeding local .db file...');
    await seedDatabase();
    console.log('✅ [Prisma Ready]: Local SQLite .db file synced and ready.');

    app.listen(PORT, () => {
      console.log(`🚀 [Server Ready]: Backend with Prisma running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Fatal server startup error:', err);
  }
}

startServer();
