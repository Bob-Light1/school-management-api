require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { apiLimiter } = require('./middleware/rate-limiter/rate-limiter');

const app = express();

// CORS Configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Specific Origin
  credentials: true, // Authorize credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // Autorized method
  allowedHeaders: ['Content-Type', 'Authorization'], // authorized Headers
  exposedHeaders: ['Authorization'], // Exposed Headers
  optionsSuccessStatus: 200 // For old versions of browser
};

app.use(cors(corsOptions));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Trust proxy (important for rate limiting)
app.set('trust proxy', 1);

// ROUTERS IMPORT
const campusRouter = require("./routers/campus.router");

// MONGODB CONNECTION
mongoose
  .connect(process.env.MONGODB_URI)
  .then(db => {
    console.log('MongoDB is connected successfully.');
  })
  .catch(e => {
    console.log("MongoDB error:", e);
  });

// API Limiter
app.use('/api/', apiLimiter);

// ROUTERS
app.use("/api/campus", campusRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// RUN SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`CORS enabled for: ${corsOptions.origin}`);
});