require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import modules
const logger = require('./utils/logger');
const dbConfig = require('./config/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const workspaceRoutes = require('./routes/workspaces');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const fileRoutes = require('./routes/files');
const deploymentRoutes = require('./routes/deployments');
const billingRoutes = require('./routes/billing');
const builderRoutes = require('./routes/builder');
const socketHandler = require('./sockets/socketHandler');
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

class ScaleProServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.CORS_ORIGIN || "http://localhost:3000",
                methods: ["GET", "POST"]
            }
        });
        
        this.port = process.env.PORT || 5000;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "ws:", "wss:"]
                }
            }
        }));

        // CORS
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || "http://localhost:3000",
            credentials: true
        }));

        // Compression
        this.app.use(compression());

        // Logging
        this.app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
            message: 'Too many requests from this IP, please try again later.',
            standardHeaders: true,
            legacyHeaders: false
        });
        this.app.use('/api/', limiter);

        // Body parsing
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });
    }

    setupRoutes() {
        // API routes
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/users', authMiddleware, userRoutes);
        this.app.use('/api/workspaces', authMiddleware, workspaceRoutes);
        this.app.use('/api/channels', authMiddleware, channelRoutes);
        this.app.use('/api/messages', authMiddleware, messageRoutes);
        this.app.use('/api/files', authMiddleware, fileRoutes);
        this.app.use('/api/deployments', authMiddleware, deploymentRoutes);
        this.app.use('/api/billing', authMiddleware, billingRoutes);
        this.app.use('/api/builder', authMiddleware, builderRoutes);

        // Stripe webhooks (no auth middleware)
        this.app.use('/webhooks/stripe', express.raw({type: 'application/json'}), require('./routes/webhooks'));

        // Serve static files in production
        if (process.env.NODE_ENV === 'production') {
            this.app.use(express.static('public'));
            this.app.get('*', (req, res) => {
                res.sendFile(path.join(__dirname, 'public', 'index.html'));
            });
        }

        // API documentation
        this.app.get('/api', (req, res) => {
            res.json({
                name: 'ScalePro API',
                version: '1.0.0',
                documentation: '/api/docs',
                endpoints: {
                    auth: '/api/auth',
                    users: '/api/users',
                    workspaces: '/api/workspaces',
                    channels: '/api/channels',
                    messages: '/api/messages',
                    files: '/api/files',
                    deployments: '/api/deployments',
                    billing: '/api/billing',
                    builder: '/api/builder'
                }
            });
        });
    }

    setupSocketHandlers() {
        this.io.use(require('./middleware/socketAuth'));
        this.io.on('connection', (socket) => {
            logger.info(`User connected: ${socket.userId}`);
            socketHandler(socket, this.io);
        });
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Route not found',
                path: req.originalUrl,
                method: req.method
            });
        });

        // Global error handler
        this.app.use(errorHandler);

        // Graceful shutdown
        process.on('SIGTERM', this.gracefulShutdown.bind(this));
        process.on('SIGINT', this.gracefulShutdown.bind(this));
    }

    async start() {
        try {
            // Test database connection
            await dbConfig.testConnection();
            logger.info('Database connection established');

            // Start server
            this.server.listen(this.port, () => {
                logger.info(`🚀 ScalePro server running on port ${this.port}`);
                logger.info(`Environment: ${process.env.NODE_ENV}`);
                logger.info(`CORS origin: ${process.env.CORS_ORIGIN}`);
            });

        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    async gracefulShutdown(signal) {
        logger.info(`Received ${signal}, starting graceful shutdown`);
        
        this.server.close(() => {
            logger.info('HTTP server closed');
            
            // Close database connections
            dbConfig.destroy().then(() => {
                logger.info('Database connections closed');
                process.exit(0);
            });
        });

        // Force close after 10 seconds
        setTimeout(() => {
            logger.error('Forcefully shutting down');
            process.exit(1);
        }, 10000);
    }
}

// Start server
const server = new ScaleProServer();
server.start();

module.exports = ScaleProServer;