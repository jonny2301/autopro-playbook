require('dotenv').config();
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { CohereClient } = require('cohere-ai');
const Replicate = require('replicate');
const NodeCache = require('node-cache');
const AIQuotaManager = require('./ai-quota-manager');

class MultiAIManager {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 600 }); // 10 minute cache
        this.providers = {};
        this.costTracker = { monthly: 0, daily: 0 };
        this.quotaManager = new AIQuotaManager();
        
        this.initializeProviders();
        this.setupFallbackOrder();
    }

    initializeProviders() {
        // OpenAI
        if (process.env.OPENAI_API_KEY) {
            this.providers.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }

        // Anthropic Claude
        if (process.env.ANTHROPIC_API_KEY) {
            this.providers.anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY
            });
        }

        // Google Gemini
        if (process.env.GOOGLE_API_KEY) {
            this.providers.google = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        }

        // Cohere
        if (process.env.COHERE_API_KEY) {
            this.providers.cohere = new CohereClient({
                token: process.env.COHERE_API_KEY
            });
        }

        // Replicate
        if (process.env.REPLICATE_API_TOKEN) {
            this.providers.replicate = new Replicate({
                auth: process.env.REPLICATE_API_TOKEN
            });
        }

        // OpenRouter (supports many free models)
        if (process.env.OPENROUTER_API_KEY) {
            this.providers.openrouter = new OpenAI({
                apiKey: process.env.OPENROUTER_API_KEY,
                baseURL: 'https://openrouter.ai/api/v1'
            });
        }
    }

    setupFallbackOrder() {
        this.primaryProvider = process.env.PRIMARY_AI_PROVIDER || 'openai';
        this.fallbackProviders = process.env.FALLBACK_PROVIDERS 
            ? process.env.FALLBACK_PROVIDERS.split(',').map(p => p.trim())
            : ['anthropic', 'google', 'openai'];
    }

    async generateResponse(prompt, options = {}) {
        const cacheKey = `${prompt}_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        // Check cost limits
        if (this.exceedsCostLimit()) {
            return {
                success: false,
                error: 'Monthly cost limit exceeded',
                provider: 'none'
            };
        }

        // Try primary provider first
        let providers = [this.primaryProvider, ...this.fallbackProviders];
        
        // Remove duplicates
        providers = [...new Set(providers)];

        for (const provider of providers) {
            if (!this.providers[provider]) continue;

            try {
                const result = await this.callProvider(provider, prompt, options);
                if (result.success) {
                    this.cache.set(cacheKey, result);
                    this.updateCostTracking(result);
                    return result;
                }
            } catch (error) {
                console.warn(`${provider} failed:`, error.message);
                continue;
            }
        }

        return {
            success: false,
            error: 'All providers failed',
            provider: 'none'
        };
    }

    async callProvider(provider, prompt, options) {
        const config = {
            maxTokens: options.maxTokens || parseInt(process.env.MAX_TOKENS) || 1000,
            temperature: options.temperature || parseFloat(process.env.TEMPERATURE) || 0.7
        };

        // Check quota before making request
        const estimatedCost = this.estimateCost(provider, config.maxTokens);
        if (!this.quotaManager.canMakeRequest(provider, config.maxTokens, estimatedCost)) {
            throw new Error(`Daily quota exceeded for ${provider}`);
        }

        let result;
        try {
            switch (provider) {
                case 'openai':
                    result = await this.callOpenAI(prompt, config);
                    break;
                case 'anthropic':
                    result = await this.callAnthropic(prompt, config);
                    break;
                case 'google':
                    result = await this.callGoogle(prompt, config);
                    break;
                case 'cohere':
                    result = await this.callCohere(prompt, config);
                    break;
                case 'replicate':
                    result = await this.callReplicate(prompt, config);
                    break;
                case 'openrouter':
                    result = await this.callOpenRouter(prompt, config);
                    break;
                default:
                    throw new Error(`Unknown provider: ${provider}`);
            }

            // Record successful usage
            this.quotaManager.recordUsage(provider, result.tokens, result.estimatedCost, true);
            return result;

        } catch (error) {
            // Record failed attempt
            this.quotaManager.recordUsage(provider, 0, 0, false);
            throw error;
        }
    }

    async callOpenAI(prompt, config) {
        const response = await this.providers.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: config.maxTokens,
            temperature: config.temperature
        });

        return {
            success: true,
            response: response.choices[0].message.content,
            provider: 'openai',
            tokens: response.usage.total_tokens,
            estimatedCost: this.estimateCost('openai', response.usage.total_tokens)
        };
    }

    async callAnthropic(prompt, config) {
        const response = await this.providers.anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            messages: [{ role: 'user', content: prompt }]
        });

        return {
            success: true,
            response: response.content[0].text,
            provider: 'anthropic',
            tokens: response.usage.input_tokens + response.usage.output_tokens,
            estimatedCost: this.estimateCost('anthropic', response.usage.input_tokens + response.usage.output_tokens)
        };
    }

    async callGoogle(prompt, config) {
        const model = this.providers.google.getGenerativeModel({ 
            model: process.env.GOOGLE_MODEL || 'gemini-pro' 
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;

        return {
            success: true,
            response: response.text(),
            provider: 'google',
            tokens: response.usage?.totalTokens || 'unknown',
            estimatedCost: this.estimateCost('google', response.usage?.totalTokens || 1000)
        };
    }

    async callCohere(prompt, config) {
        const response = await this.providers.cohere.chat({
            model: process.env.COHERE_MODEL || 'command',
            message: prompt,
            max_tokens: config.maxTokens,
            temperature: config.temperature
        });

        return {
            success: true,
            response: response.text,
            provider: 'cohere',
            tokens: response.meta?.billed_units?.input_tokens + response.meta?.billed_units?.output_tokens || 'unknown',
            estimatedCost: this.estimateCost('cohere', 1000)
        };
    }

    async callReplicate(prompt, config) {
        // Using a popular text generation model
        const output = await this.providers.replicate.run(
            "meta/llama-2-70b-chat:02e509c789964a7ea8736978a43525956ef40397be9033abf9fd2badfe68c9e3",
            {
                input: {
                    prompt: prompt,
                    max_length: config.maxTokens,
                    temperature: config.temperature
                }
            }
        );

        return {
            success: true,
            response: Array.isArray(output) ? output.join('') : output,
            provider: 'replicate',
            tokens: 'unknown',
            estimatedCost: this.estimateCost('replicate', 1000)
        };
    }

    async callOpenRouter(prompt, config) {
        const response = await this.providers.openrouter.chat.completions.create({
            model: process.env.OPENROUTER_MODEL || 'microsoft/wizardlm-2-8x22b:free',
            messages: [{ 
                role: 'user', 
                content: prompt 
            }],
            max_tokens: config.maxTokens,
            temperature: config.temperature
        });

        return {
            success: true,
            response: response.choices[0].message.content,
            provider: 'openrouter',
            tokens: response.usage?.total_tokens || config.maxTokens,
            estimatedCost: 0 // Free models
        };
    }

    estimateCost(provider, tokens) {
        const rates = {
            openai: 0.03 / 1000,      // $0.03 per 1K tokens (GPT-4)
            anthropic: 0.015 / 1000,  // $0.015 per 1K tokens (Claude)
            google: 0.00025 / 1000,   // $0.00025 per 1K tokens (Gemini)
            cohere: 0.02 / 1000,      // $0.02 per 1K tokens
            replicate: 0.05 / 1000,   // Varies by model
            openrouter: 0             // Free models available
        };

        return (rates[provider] || 0.01) * tokens;
    }

    updateCostTracking(result) {
        if (result.estimatedCost) {
            this.costTracker.daily += result.estimatedCost;
            this.costTracker.monthly += result.estimatedCost;
        }
    }

    exceedsCostLimit() {
        const maxSpend = parseFloat(process.env.MAX_MONTHLY_SPEND) || 100;
        return this.costTracker.monthly > maxSpend;
    }

    getStatus() {
        return {
            availableProviders: Object.keys(this.providers),
            primaryProvider: this.primaryProvider,
            fallbackProviders: this.fallbackProviders,
            costTracking: this.costTracker,
            cacheStats: this.cache.getStats()
        };
    }

    async analyzeWorkflow(workflowContent) {
        const prompt = `Analyze this AI workflow and provide optimization suggestions:\n\n${workflowContent}`;
        return await this.generateResponse(prompt);
    }

    async generateWorkflowDescription(workflowName) {
        const prompt = `Generate a detailed description for an AI automation workflow named: ${workflowName}`;
        return await this.generateResponse(prompt);
    }

    async optimizeForCost(prompt, maxCost = 0.01) {
        // Try cheaper providers first if cost optimization is enabled
        if (process.env.ENABLE_COST_OPTIMIZATION === 'true') {
            const cheapProviders = ['google', 'cohere', 'anthropic', 'openai'];
            
            for (const provider of cheapProviders) {
                if (!this.providers[provider]) continue;
                
                const result = await this.callProvider(provider, prompt, { maxTokens: 500 });
                if (result.success && result.estimatedCost <= maxCost) {
                    return result;
                }
            }
        }
        
        return await this.generateResponse(prompt);
    }
}

module.exports = MultiAIManager;