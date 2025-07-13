require('dotenv').config();
const MultiAIManager = require('./multi-ai-manager');
const AIQuotaManager = require('./ai-quota-manager');

class HealthMonitor {
    constructor() {
        this.aiManager = new MultiAIManager();
        this.quotaManager = new AIQuotaManager();
        this.healthHistory = [];
        this.alertThresholds = {
            apiFailureRate: 0.3, // 30% failure rate triggers alert
            responseTime: 10000, // 10 seconds max response time
            memoryUsage: 0.8, // 80% memory usage
            consecutiveFailures: 5
        };
        this.consecutiveFailures = 0;
    }

    async performComprehensiveHealthCheck() {
        const healthCheck = {
            timestamp: new Date().toISOString(),
            checks: {},
            overallStatus: 'healthy',
            alerts: []
        };

        // Test all AI providers
        healthCheck.checks.aiProviders = await this.checkAIProviders();
        
        // Check quota status
        healthCheck.checks.quotas = this.checkQuotaStatus();
        
        // Check system resources
        healthCheck.checks.system = await this.checkSystemResources();
        
        // Check network connectivity
        healthCheck.checks.network = await this.checkNetworkConnectivity();
        
        // Check file system
        healthCheck.checks.filesystem = await this.checkFileSystem();

        // Determine overall status
        healthCheck.overallStatus = this.determineOverallStatus(healthCheck.checks);
        
        // Generate alerts
        healthCheck.alerts = this.generateAlerts(healthCheck.checks);
        
        // Record in history
        this.recordHealthHistory(healthCheck);
        
        return healthCheck;
    }

    async checkAIProviders() {
        const providers = Object.keys(this.aiManager.providers);
        const results = {};
        
        for (const provider of providers) {
            try {
                const startTime = Date.now();
                const result = await this.aiManager.callProvider(provider, 'Health check test', { maxTokens: 10 });
                const responseTime = Date.now() - startTime;
                
                results[provider] = {
                    status: result.success ? 'healthy' : 'unhealthy',
                    responseTime,
                    lastTest: new Date().toISOString(),
                    error: result.success ? null : result.error
                };
                
                this.consecutiveFailures = 0; // Reset on success
                
            } catch (error) {
                results[provider] = {
                    status: 'unhealthy',
                    responseTime: null,
                    lastTest: new Date().toISOString(),
                    error: error.message
                };
                this.consecutiveFailures++;
            }
        }
        
        return results;
    }

    checkQuotaStatus() {
        const quotaStatus = this.quotaManager.getQuotaStatus();
        const alerts = [];
        
        for (const [provider, data] of Object.entries(quotaStatus.providers)) {
            if (data.usage.requests > 90 || data.usage.tokens > 90 || data.usage.cost > 90) {
                alerts.push(`${provider} approaching daily limit`);
            }
        }
        
        return {
            status: alerts.length === 0 ? 'healthy' : 'warning',
            quotaStatus,
            alerts
        };
    }

    async checkSystemResources() {
        const memUsage = process.memoryUsage();
        const memUsedMB = memUsage.heapUsed / 1024 / 1024;
        const memTotalMB = memUsage.heapTotal / 1024 / 1024;
        const memUsagePercent = memUsedMB / memTotalMB;
        
        return {
            status: memUsagePercent < this.alertThresholds.memoryUsage ? 'healthy' : 'warning',
            memory: {
                usedMB: Math.round(memUsedMB),
                totalMB: Math.round(memTotalMB),
                usagePercent: Math.round(memUsagePercent * 100)
            },
            uptime: process.uptime(),
            nodeVersion: process.version
        };
    }

    async checkNetworkConnectivity() {
        const testEndpoints = [
            'https://api.openai.com/v1/models',
            'https://api.anthropic.com',
            'https://generativelanguage.googleapis.com',
            'https://openrouter.ai/api/v1/models'
        ];
        
        const results = {};
        let healthyCount = 0;
        
        for (const endpoint of testEndpoints) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(endpoint, {
                    method: 'HEAD',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                results[endpoint] = {
                    status: response.ok ? 'healthy' : 'unhealthy',
                    statusCode: response.status
                };
                
                if (response.ok) healthyCount++;
                
            } catch (error) {
                results[endpoint] = {
                    status: 'unhealthy',
                    error: error.message
                };
            }
        }
        
        return {
            status: healthyCount > testEndpoints.length / 2 ? 'healthy' : 'unhealthy',
            endpoints: results,
            healthyCount: healthyCount,
            totalCount: testEndpoints.length
        };
    }

    async checkFileSystem() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // Test write capability
            const testFile = path.join(__dirname, 'health-test.tmp');
            fs.writeFileSync(testFile, 'health check');
            fs.unlinkSync(testFile);
            
            // Check log directory
            const logsDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            return {
                status: 'healthy',
                writeable: true,
                logsDirectory: fs.existsSync(logsDir)
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                writeable: false
            };
        }
    }

    determineOverallStatus(checks) {
        const statuses = Object.values(checks).map(check => check.status);
        
        if (statuses.includes('unhealthy')) {
            return 'unhealthy';
        } else if (statuses.includes('warning')) {
            return 'warning';
        } else {
            return 'healthy';
        }
    }

    generateAlerts(checks) {
        const alerts = [];
        
        // Check for consecutive failures
        if (this.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
            alerts.push({
                level: 'critical',
                message: `${this.consecutiveFailures} consecutive AI provider failures detected`,
                timestamp: new Date().toISOString()
            });
        }
        
        // Check AI provider response times
        if (checks.aiProviders) {
            for (const [provider, data] of Object.entries(checks.aiProviders)) {
                if (data.responseTime && data.responseTime > this.alertThresholds.responseTime) {
                    alerts.push({
                        level: 'warning',
                        message: `${provider} response time (${data.responseTime}ms) exceeds threshold`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }
        
        // Check system resources
        if (checks.system && checks.system.memory.usagePercent > 80) {
            alerts.push({
                level: 'warning',
                message: `High memory usage: ${checks.system.memory.usagePercent}%`,
                timestamp: new Date().toISOString()
            });
        }
        
        // Check network connectivity
        if (checks.network && checks.network.status === 'unhealthy') {
            alerts.push({
                level: 'critical',
                message: `Network connectivity issues detected`,
                timestamp: new Date().toISOString()
            });
        }
        
        return alerts;
    }

    recordHealthHistory(healthCheck) {
        this.healthHistory.push(healthCheck);
        
        // Keep only last 100 health checks
        if (this.healthHistory.length > 100) {
            this.healthHistory = this.healthHistory.slice(-100);
        }
    }

    getHealthTrends() {
        if (this.healthHistory.length < 2) {
            return { trend: 'insufficient_data' };
        }
        
        const recent = this.healthHistory.slice(-10);
        const healthyCount = recent.filter(h => h.overallStatus === 'healthy').length;
        const trend = healthyCount / recent.length;
        
        return {
            trend: trend > 0.8 ? 'improving' : trend > 0.5 ? 'stable' : 'declining',
            healthyPercentage: Math.round(trend * 100),
            recentChecks: recent.length,
            alerts: recent.reduce((acc, h) => acc + h.alerts.length, 0)
        };
    }

    async getDetailedReport() {
        const healthCheck = await this.performComprehensiveHealthCheck();
        const trends = this.getHealthTrends();
        
        return {
            currentHealth: healthCheck,
            trends,
            recommendations: this.generateRecommendations(healthCheck, trends),
            lastUpdated: new Date().toISOString()
        };
    }

    generateRecommendations(healthCheck, trends) {
        const recommendations = [];
        
        if (trends.trend === 'declining') {
            recommendations.push('System health is declining - consider investigating recent changes');
        }
        
        if (healthCheck.checks.quotas && healthCheck.checks.quotas.alerts.length > 0) {
            recommendations.push('Some providers approaching quota limits - consider upgrading or redistributing load');
        }
        
        if (healthCheck.checks.system && healthCheck.checks.system.memory.usagePercent > 70) {
            recommendations.push('Memory usage is high - consider restarting the application or optimizing memory usage');
        }
        
        if (this.consecutiveFailures > 0) {
            recommendations.push(`${this.consecutiveFailures} recent failures detected - check API keys and network connectivity`);
        }
        
        const availableProviders = this.quotaManager.getAvailableProviders();
        if (availableProviders.length < 2) {
            recommendations.push('Low provider availability - ensure multiple AI providers are configured and operational');
        }
        
        return recommendations;
    }
}

module.exports = HealthMonitor;