const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');

const app = express();
app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', env.trustProxy); // needed behind Render, a tunnel, or any reverse proxy
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:', 'blob:'],
      'object-src': ["'self'", 'blob:'], // lets the browser's PDF viewer open an original file
      'frame-src': ["'self'", 'blob:'],
      'upgrade-insecure-requests': null, // must stay off or plain-HTTP use on a local network breaks
    },
  },
}));
app.use(cors({
  origin: env.clientOrigin,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '100kb' }));

const limiter = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter(15 * 60 * 1000, 600));
app.use('/api/auth/login', limiter(15 * 60 * 1000, 20));
app.use('/api/auth/register', limiter(60 * 60 * 1000, 30));
app.use('/api/org/bootstrap', limiter(60 * 60 * 1000, 20));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/auth.routes'));
app.use('/api', require('./routes/org.routes'));
app.use('/api', require('./routes/claims.routes'));
app.use('/api', require('./routes/queries.routes'));
app.use('/api', require('./routes/payments.routes'));
app.use('/api', require('./routes/packets.routes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// If the frontend has been built (frontend/dist), serve it from this same server: one program, one port.
const serveWeb = fs.existsSync(path.join(env.webDir, 'index.html'));
if (serveWeb) {
  app.use(express.static(env.webDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => res.sendFile(path.join(env.webDir, 'index.html')));
}
app.locals.serveWeb = serveWeb;

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(require('./middleware/errorHandler'));

module.exports = app;
