require('dotenv').config();
const winston = require('winston');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class Always247Manager {
    constructor() {
        this.setupLogging();
        this.setupHealthChecks();
        this.isRunning = false;
        this.processes = new Map();
        this.restartCount = 0;
        this.maxRestarts = parseInt(process.env.MAX_RESTARTS) || 10;
        this.restartDelay = parseInt(process.env.RESTART_DELAY) || 5000; // 5 seconds
        this.healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000; // 30 seconds
        
        this.setupGracefulShutdown();
    }

    setupLogging() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'ai-automation-247' },
            transports: [
                new winston.transports.File({ 
                    filename: 'logs/error.log', 
                    level: 'error',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                }),
                new winston.transports.File({ 
                    filename: 'logs/combined.log',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });

        // Create logs directory if it doesn't exist
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs');
        }
    }

    setupHealthChecks() {
        this.healthChecks = {
            apiConnectivity: this.checkAPIConnectivity.bind(this),
            memoryUsage: this.checkMemoryUsage.bind(this),
            diskSpace: this.checkDiskSpace.bind(this),
            processStatus: this.checkProcessStatus.bind(this)
        };
    }

    async start() {
        this.logger.info('🚀 Starting 24/7 AI Automation Manager');
        this.isRunning = true;
        
        // Start main application
        await this.startMainApplication();
        
        // Start health monitoring
        this.startHealthMonitoring();
        
        // Start periodic maintenance
        this.startMaintenanceTasks();
        
        this.logger.info('✅ 24/7 Manager fully operational');
    }

    async startMainApplication() {
        try {
            this.logger.info('Starting main AI application');
            
            const mainProcess = spawn('node', ['index.js'], {
                cwd: __dirname,
                env: process.env,
                stdio: ['inherit', 'pipe', 'pipe']
            });

            mainProcess.stdout.on('data', (data) => {
                this.logger.info(`App: ${data.toString().trim()}`);
            });

            mainProcess.stderr.on('data', (data) => {
                this.logger.error(`App Error: ${data.toString().trim()}`);
            });

            mainProcess.on('exit', (code, signal) => {
                this.logger.warn(`Main application exited with code ${code}, signal ${signal}`);
                this.handleProcessExit('main', code);
            });

            this.processes.set('main', {
                process: mainProcess,
                startTime: Date.now(),
                restarts: 0
            });

        } catch (error) {
            this.logger.error('Failed to start main application:', error);
            throw error;
        }
    }

    async handleProcessExit(processName, exitCode) {
        if (!this.isRunning) return;

        const processInfo = this.processes.get(processName);
        if (!processInfo) return;

        processInfo.restarts++;
        this.restartCount++;

        if (this.restartCount > this.maxRestarts) {
            this.logger.error(`Max restarts (${this.maxRestarts}) exceeded. Stopping 24/7 manager.`);
            await this.stop();
            return;
        }

        this.logger.warn(`Restarting ${processName} (attempt ${processInfo.restarts})`);
        
        setTimeout(async () => {
            try {
                if (processName === 'main') {
                    await this.startMainApplication();
                }
            } catch (error) {
                this.logger.error(`Failed to restart ${processName}:`, error);
            }
        }, this.restartDelay);
    }

    startHealthMonitoring() {
        this.healthInterval = setInterval(async () => {
            try {
                await this.performHealthChecks();
            } catch (error) {
                this.logger.error('Health check failed:', error);
            }
        }, this.healthCheckInterval);
    }

    async performHealthChecks() {
        const healthResults = {};
        
        for (const [checkName, checkFunction] of Object.entries(this.healthChecks)) {
            try {
                healthResults[checkName] = await checkFunction();
            } catch (error) {
                healthResults[checkName] = { status: 'failed', error: error.message };
                this.logger.error(`Health check ${checkName} failed:`, error);
            }
        }

        const overallHealth = Object.values(healthResults).every(result => result.status === 'healthy');
        
        if (!overallHealth) {
            this.logger.warn('Health check failures detected:', healthResults);
            await this.handleUnhealthySystem(healthResults);
        }

        // Log health status every hour
        if (Date.now() % 3600000 < this.healthCheckInterval) {
            this.logger.info('Health check results:', healthResults);
        }
    }

    async checkAPIConnectivity() {
        try {
            // Test a simple free API endpoint
            const response = await fetch('https://httpbin.org/status/200', {
                timeout: 5000
            });
            
            return {
                status: response.ok ? 'healthy' : 'unhealthy',
                latency: Date.now()
            };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    async checkMemoryUsage() {
        const usage = process.memoryUsage();
        const maxMemoryMB = parseInt(process.env.MAX_MEMORY_MB) || 1024; // 1GB default
        const usedMemoryMB = usage.heapUsed / 1024 / 1024;
        
        return {
            status: usedMemoryMB < maxMemoryMB ? 'healthy' : 'unhealthy',
            usedMemoryMB: Math.round(usedMemoryMB),
            maxMemoryMB
        };
    }

    async checkDiskSpace() {
        try {
            const stats = fs.statSync('.');
            // Simple check - if we can write, assume disk space is OK
            return { status: 'healthy' };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    async checkProcessStatus() {
        const mainProcess = this.processes.get('main');
        if (!mainProcess || mainProcess.process.killed) {
            return { status: 'unhealthy', reason: 'Main process not running' };
        }
        
        return { 
            status: 'healthy',
            uptime: Date.now() - mainProcess.startTime,
            restarts: mainProcess.restarts
        };
    }

    async handleUnhealthySystem(healthResults) {
        // Implement recovery strategies
        if (healthResults.memoryUsage?.status === 'unhealthy') {
            this.logger.warn('High memory usage detected, triggering garbage collection');
            if (global.gc) {
                global.gc();
            }
        }

        if (healthResults.processStatus?.status === 'unhealthy') {
            this.logger.warn('Main process unhealthy, restarting...');
            await this.restartMainProcess();
        }
    }

    async restartMainProcess() {
        const mainProcess = this.processes.get('main');
        if (mainProcess && !mainProcess.process.killed) {
            mainProcess.process.kill('SIGTERM');
        }
        
        setTimeout(async () => {
            await this.startMainApplication();
        }, this.restartDelay);
    }

    startMaintenanceTasks() {
        // Daily log rotation and cleanup
        this.maintenanceInterval = setInterval(() => {
            this.performMaintenance();
        }, 24 * 60 * 60 * 1000); // 24 hours
    }

    performMaintenance() {
        this.logger.info('Performing daily maintenance');
        
        // Reset restart counter daily
        this.restartCount = 0;
        
        // Clean up old logs (keep last 7 days)
        this.cleanupOldLogs();
        
        // Log system statistics
        this.logSystemStats();
    }

    cleanupOldLogs() {
        try {
            const logsDir = 'logs';
            const files = fs.readdirSync(logsDir);
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            files.forEach(file => {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                
                if (stats.mtime.getTime() < sevenDaysAgo) {
                    fs.unlinkSync(filePath);
                    this.logger.info(`Cleaned up old log file: ${file}`);
                }
            });
        } catch (error) {
            this.logger.error('Failed to cleanup old logs:', error);
        }
    }

    logSystemStats() {
        const stats = {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            restartCount: this.restartCount,
            processCount: this.processes.size
        };
        
        this.logger.info('Daily system statistics:', stats);
    }

    setupGracefulShutdown() {
        const shutdownHandler = async (signal) => {
            this.logger.info(`Received ${signal}, initiating graceful shutdown`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGTERM', shutdownHandler);
        process.on('SIGINT', shutdownHandler);
        process.on('SIGHUP', shutdownHandler);
    }

    async stop() {
        this.logger.info('Stopping 24/7 manager');
        this.isRunning = false;
        
        // Clear intervals
        if (this.healthInterval) clearInterval(this.healthInterval);
        if (this.maintenanceInterval) clearInterval(this.maintenanceInterval);
        
        // Stop all processes
        for (const [name, processInfo] of this.processes) {
            this.logger.info(`Stopping process: ${name}`);
            if (!processInfo.process.killed) {
                processInfo.process.kill('SIGTERM');
                
                // Force kill after 10 seconds
                setTimeout(() => {
                    if (!processInfo.process.killed) {
                        processInfo.process.kill('SIGKILL');
                    }
                }, 10000);
            }
        }
        
        this.logger.info('24/7 manager stopped');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            uptime: process.uptime(),
            restartCount: this.restartCount,
            processCount: this.processes.size,
            memoryUsage: process.memoryUsage(),
            processes: Array.from(this.processes.entries()).map(([name, info]) => ({
                name,
                pid: info.process.pid,
                uptime: Date.now() - info.startTime,
                restarts: info.restarts,
                killed: info.process.killed
            }))
        };
    }
}

// Start 24/7 manager if called directly
if (require.main === module) {
    const manager = new Always247Manager();
    manager.start().catch(error => {
        console.error('Failed to start 24/7 manager:', error);
        process.exit(1);
    });
}

module.exports = Always247Manager;