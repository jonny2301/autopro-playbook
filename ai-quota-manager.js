require('dotenv').config();
const fs = require('fs');
const path = require('path');

class AIQuotaManager {
    constructor() {
        this.quotaFile = path.join(__dirname, 'quota-usage.json');
        this.limits = this.loadLimits();
        this.usage = this.loadUsage();
        
        // Daily limits for each provider (adjust based on your actual limits)
        this.dailyLimits = {
            openai: {
                requests: parseInt(process.env.OPENAI_DAILY_REQUESTS) || 3000,
                tokens: parseInt(process.env.OPENAI_DAILY_TOKENS) || 100000,
                cost: parseFloat(process.env.OPENAI_DAILY_COST) || 10.00
            },
            anthropic: {
                requests: parseInt(process.env.ANTHROPIC_DAILY_REQUESTS) || 5000,
                tokens: parseInt(process.env.ANTHROPIC_DAILY_TOKENS) || 200000,
                cost: parseFloat(process.env.ANTHROPIC_DAILY_COST) || 15.00
            },
            google: {
                requests: parseInt(process.env.GOOGLE_DAILY_REQUESTS) || 10000,
                tokens: parseInt(process.env.GOOGLE_DAILY_TOKENS) || 1000000,
                cost: parseFloat(process.env.GOOGLE_DAILY_COST) || 5.00
            },
            cohere: {
                requests: parseInt(process.env.COHERE_DAILY_REQUESTS) || 1000,
                tokens: parseInt(process.env.COHERE_DAILY_TOKENS) || 50000,
                cost: parseFloat(process.env.COHERE_DAILY_COST) || 8.00
            },
            replicate: {
                requests: parseInt(process.env.REPLICATE_DAILY_REQUESTS) || 100,
                tokens: parseInt(process.env.REPLICATE_DAILY_TOKENS) || 10000,
                cost: parseFloat(process.env.REPLICATE_DAILY_COST) || 5.00
            }
        };
        
        this.resetDailyUsageIfNeeded();
    }

    loadLimits() {
        return {
            safetyMargin: parseFloat(process.env.QUOTA_SAFETY_MARGIN) || 0.8, // Use only 80% of limits
            emergencyThreshold: parseFloat(process.env.EMERGENCY_THRESHOLD) || 0.95, // Emergency at 95%
            hourlyDistribution: parseFloat(process.env.HOURLY_DISTRIBUTION) || 0.1 // Max 10% per hour
        };
    }

    loadUsage() {
        try {
            if (fs.existsSync(this.quotaFile)) {
                return JSON.parse(fs.readFileSync(this.quotaFile, 'utf8'));
            }
        } catch (error) {
            console.warn('Could not load usage data:', error.message);
        }
        
        return this.initializeUsage();
    }

    initializeUsage() {
        const today = new Date().toISOString().split('T')[0];
        return {
            date: today,
            providers: {}
        };
    }

    saveUsage() {
        try {
            fs.writeFileSync(this.quotaFile, JSON.stringify(this.usage, null, 2));
        } catch (error) {
            console.error('Could not save usage data:', error.message);
        }
    }

    resetDailyUsageIfNeeded() {
        const today = new Date().toISOString().split('T')[0];
        if (this.usage.date !== today) {
            console.log('🔄 Resetting daily usage counters for new day');
            this.usage = this.initializeUsage();
            this.saveUsage();
        }
    }

    canMakeRequest(provider, estimatedTokens = 1000, estimatedCost = 0.01) {
        if (!this.usage.providers[provider]) {
            this.usage.providers[provider] = {
                requests: 0,
                tokens: 0,
                cost: 0
            };
        }

        const providerUsage = this.usage.providers[provider];
        const limits = this.dailyLimits[provider];
        
        if (!limits) {
            console.warn(`No limits defined for provider: ${provider}`);
            return true;
        }

        // Apply safety margin
        const safeRequestLimit = limits.requests * this.limits.safetyMargin;
        const safeTokenLimit = limits.tokens * this.limits.safetyMargin;
        const safeCostLimit = limits.cost * this.limits.safetyMargin;

        // Check if adding this request would exceed limits
        const wouldExceedRequests = (providerUsage.requests + 1) > safeRequestLimit;
        const wouldExceedTokens = (providerUsage.tokens + estimatedTokens) > safeTokenLimit;
        const wouldExceedCost = (providerUsage.cost + estimatedCost) > safeCostLimit;

        if (wouldExceedRequests || wouldExceedTokens || wouldExceedCost) {
            const usage = this.getProviderUsagePercent(provider);
            console.warn(`⚠️ ${provider} approaching limits:`, {
                requests: `${usage.requests.toFixed(1)}%`,
                tokens: `${usage.tokens.toFixed(1)}%`,
                cost: `${usage.cost.toFixed(1)}%`
            });
            return false;
        }

        return true;
    }

    recordUsage(provider, tokens, cost, success = true) {
        if (!this.usage.providers[provider]) {
            this.usage.providers[provider] = {
                requests: 0,
                tokens: 0,
                cost: 0,
                successful: 0,
                failed: 0
            };
        }

        const providerUsage = this.usage.providers[provider];
        providerUsage.requests += 1;
        providerUsage.tokens += tokens || 0;
        providerUsage.cost += cost || 0;
        
        if (success) {
            providerUsage.successful = (providerUsage.successful || 0) + 1;
        } else {
            providerUsage.failed = (providerUsage.failed || 0) + 1;
        }

        this.saveUsage();
        
        // Log warning if approaching limits
        const usage = this.getProviderUsagePercent(provider);
        if (usage.requests > 70 || usage.tokens > 70 || usage.cost > 70) {
            console.warn(`⚠️ ${provider} usage warning:`, {
                requests: `${usage.requests.toFixed(1)}%`,
                tokens: `${usage.tokens.toFixed(1)}%`,
                cost: `$${providerUsage.cost.toFixed(4)} (${usage.cost.toFixed(1)}%)`
            });
        }
    }

    getProviderUsagePercent(provider) {
        const providerUsage = this.usage.providers[provider] || { requests: 0, tokens: 0, cost: 0 };
        const limits = this.dailyLimits[provider];
        
        if (!limits) return { requests: 0, tokens: 0, cost: 0 };

        return {
            requests: (providerUsage.requests / limits.requests) * 100,
            tokens: (providerUsage.tokens / limits.tokens) * 100,
            cost: (providerUsage.cost / limits.cost) * 100
        };
    }

    getAvailableProviders() {
        return Object.keys(this.dailyLimits).filter(provider => {
            const usage = this.getProviderUsagePercent(provider);
            return usage.requests < 80 && usage.tokens < 80 && usage.cost < 80;
        });
    }

    getBestProvider() {
        const available = this.getAvailableProviders();
        if (available.length === 0) {
            console.warn('⚠️ All providers approaching daily limits!');
            return null;
        }

        // Sort by lowest usage percentage (across all metrics)
        return available.sort((a, b) => {
            const usageA = this.getProviderUsagePercent(a);
            const usageB = this.getProviderUsagePercent(b);
            
            const avgUsageA = (usageA.requests + usageA.tokens + usageA.cost) / 3;
            const avgUsageB = (usageB.requests + usageB.tokens + usageB.cost) / 3;
            
            return avgUsageA - avgUsageB;
        })[0];
    }

    getQuotaStatus() {
        const status = {
            date: this.usage.date,
            providers: {},
            recommendations: []
        };

        for (const [provider, limits] of Object.entries(this.dailyLimits)) {
            const usage = this.getProviderUsagePercent(provider);
            const providerData = this.usage.providers[provider] || { requests: 0, tokens: 0, cost: 0 };
            
            status.providers[provider] = {
                usage: usage,
                absolute: providerData,
                limits: limits,
                available: usage.requests < 80 && usage.tokens < 80 && usage.cost < 80
            };
        }

        // Generate recommendations
        const available = this.getAvailableProviders();
        if (available.length === 0) {
            status.recommendations.push('⚠️ All providers approaching limits - consider upgrading plans');
        } else if (available.length < 3) {
            status.recommendations.push(`💡 Only ${available.length} providers available - route carefully`);
        }

        const bestProvider = this.getBestProvider();
        if (bestProvider) {
            status.recommendations.push(`🎯 Best provider: ${bestProvider}`);
        }

        return status;
    }

    generateDailyReport() {
        const status = this.getQuotaStatus();
        
        console.log('\n📊 Daily AI Usage Report');
        console.log('========================');
        console.log(`Date: ${status.date}\n`);

        for (const [provider, data] of Object.entries(status.providers)) {
            console.log(`${provider.toUpperCase()}:`);
            console.log(`  Requests: ${data.absolute.requests}/${data.limits.requests} (${data.usage.requests.toFixed(1)}%)`);
            console.log(`  Tokens: ${data.absolute.tokens}/${data.limits.tokens} (${data.usage.tokens.toFixed(1)}%)`);
            console.log(`  Cost: $${data.absolute.cost.toFixed(4)}/$${data.limits.cost} (${data.usage.cost.toFixed(1)}%)`);
            console.log(`  Status: ${data.available ? '✅ Available' : '⚠️ Near Limit'}`);
            console.log('');
        }

        if (status.recommendations.length > 0) {
            console.log('Recommendations:');
            status.recommendations.forEach(rec => console.log(`  ${rec}`));
        }

        return status;
    }
}

module.exports = AIQuotaManager;