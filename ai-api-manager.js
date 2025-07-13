require('dotenv').config();
const OpenAI = require('openai');

class AIManager {
    constructor() {
        this.openai = null;
        this.useOpenAI = process.env.USE_OPENAI === 'true';
        this.fallbackToClaude = process.env.FALLBACK_TO_CLAUDE === 'true';
        
        if (this.useOpenAI && process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
    }

    async generateResponse(prompt, options = {}) {
        const config = {
            model: options.model || process.env.OPENAI_MODEL || 'gpt-4',
            maxTokens: options.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
            temperature: options.temperature || parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7
        };

        if (this.useOpenAI && this.openai) {
            try {
                const response = await this.openai.chat.completions.create({
                    model: config.model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: config.maxTokens,
                    temperature: config.temperature
                });
                
                return {
                    success: true,
                    response: response.choices[0].message.content,
                    provider: 'openai',
                    tokens: response.usage.total_tokens
                };
            } catch (error) {
                console.error('OpenAI API Error:', error.message);
                
                if (this.fallbackToClaude) {
                    return this.fallbackToClaude(prompt);
                }
                
                return {
                    success: false,
                    error: error.message,
                    provider: 'openai'
                };
            }
        }
        
        return this.fallbackResponse(prompt);
    }

    fallbackResponse(prompt) {
        return {
            success: false,
            message: 'OpenAI not configured. Please use Claude or configure OpenAI API key.',
            provider: 'none'
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

    getStatus() {
        return {
            openaiConfigured: !!this.openai,
            useOpenAI: this.useOpenAI,
            fallbackEnabled: this.fallbackToClaude
        };
    }
}

module.exports = AIManager;