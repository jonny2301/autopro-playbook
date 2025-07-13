const MultiAIManager = require('./multi-ai-manager');

class APIRouter {
    constructor() {
        this.aiManager = new MultiAIManager();
        this.routingStrategies = {
            cost_optimized: this.costOptimizedRouting.bind(this),
            performance: this.performanceRouting.bind(this),
            load_balanced: this.loadBalancedRouting.bind(this),
            specialized: this.specializedRouting.bind(this)
        };
        
        this.requestCounts = {};
        this.responseCache = new Map();
    }

    async route(prompt, strategy = 'cost_optimized', options = {}) {
        const routingFunction = this.routingStrategies[strategy] || this.routingStrategies.cost_optimized;
        return await routingFunction(prompt, options);
    }

    async costOptimizedRouting(prompt, options) {
        // Route to cheapest available provider first
        const providers = this.getProvidersByCost();
        
        for (const provider of providers) {
            try {
                const result = await this.aiManager.callProvider(provider, prompt, options);
                if (result.success) {
                    this.trackRequest(provider);
                    return { ...result, strategy: 'cost_optimized' };
                }
            } catch (error) {
                continue;
            }
        }
        
        return { success: false, error: 'All cost-optimized providers failed' };
    }

    async performanceRouting(prompt, options) {
        // Route to fastest/most reliable providers first
        const providers = ['openai', 'anthropic', 'google', 'cohere'];
        
        for (const provider of providers) {
            if (!this.aiManager.providers[provider]) continue;
            
            try {
                const result = await this.aiManager.callProvider(provider, prompt, options);
                if (result.success) {
                    this.trackRequest(provider);
                    return { ...result, strategy: 'performance' };
                }
            } catch (error) {
                continue;
            }
        }
        
        return { success: false, error: 'All performance providers failed' };
    }

    async loadBalancedRouting(prompt, options) {
        // Distribute requests evenly across providers
        const providers = Object.keys(this.aiManager.providers);
        const leastUsed = this.getLeastUsedProvider(providers);
        
        try {
            const result = await this.aiManager.callProvider(leastUsed, prompt, options);
            if (result.success) {
                this.trackRequest(leastUsed);
                return { ...result, strategy: 'load_balanced' };
            }
        } catch (error) {
            // Fallback to other providers
            return await this.costOptimizedRouting(prompt, options);
        }
    }

    async specializedRouting(prompt, options) {
        // Route based on task type
        const taskType = this.detectTaskType(prompt);
        const provider = this.getSpecializedProvider(taskType);
        
        try {
            const result = await this.aiManager.callProvider(provider, prompt, options);
            if (result.success) {
                this.trackRequest(provider);
                return { ...result, strategy: 'specialized', taskType };
            }
        } catch (error) {
            // Fallback to cost optimized
            return await this.costOptimizedRouting(prompt, options);
        }
    }

    detectTaskType(prompt) {
        const lower = prompt.toLowerCase();
        
        if (lower.includes('code') || lower.includes('programming') || lower.includes('debug')) {
            return 'coding';
        }
        if (lower.includes('analyze') || lower.includes('data') || lower.includes('research')) {
            return 'analysis';
        }
        if (lower.includes('creative') || lower.includes('story') || lower.includes('write')) {
            return 'creative';
        }
        if (lower.includes('translate') || lower.includes('language')) {
            return 'translation';
        }
        
        return 'general';
    }

    getSpecializedProvider(taskType) {
        const specializations = {
            coding: 'openai',        // GPT-4 excels at coding
            analysis: 'anthropic',   // Claude is great for analysis
            creative: 'google',      // Gemini for creative tasks
            translation: 'cohere',   // Cohere for language tasks
            general: 'openai'
        };
        
        return specializations[taskType] || 'openai';
    }

    getProvidersByCost() {
        // Return providers ordered by cost (cheapest first)
        return ['google', 'cohere', 'anthropic', 'openai', 'replicate'];
    }

    getLeastUsedProvider(providers) {
        let leastUsed = providers[0];
        let minCount = this.requestCounts[leastUsed] || 0;
        
        for (const provider of providers) {
            const count = this.requestCounts[provider] || 0;
            if (count < minCount) {
                minCount = count;
                leastUsed = provider;
            }
        }
        
        return leastUsed;
    }

    trackRequest(provider) {
        this.requestCounts[provider] = (this.requestCounts[provider] || 0) + 1;
    }

    getRoutingStats() {
        return {
            requestCounts: this.requestCounts,
            aiManagerStatus: this.aiManager.getStatus(),
            availableStrategies: Object.keys(this.routingStrategies)
        };
    }

    // Workflow-specific routing methods
    async routeWorkflowAnalysis(workflowContent) {
        return await this.route(
            `Analyze this workflow and suggest optimizations:\n${workflowContent}`,
            'specialized',
            { maxTokens: 2000 }
        );
    }

    async routeQuickQuery(query) {
        return await this.route(query, 'cost_optimized', { maxTokens: 500 });
    }

    async routeComplexTask(task) {
        return await this.route(task, 'performance', { maxTokens: 3000 });
    }

    async routeCreativeTask(task) {
        return await this.route(task, 'specialized', { maxTokens: 1500 });
    }
}

module.exports = APIRouter;