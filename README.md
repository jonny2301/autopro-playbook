# 🤖 Multi-AI Automation Playbook

A comprehensive AI automation platform with 2000+ templates, workflows, and intelligent API routing across multiple AI providers.

## 🚀 Features

### Multi-Provider Support
- **OpenAI** (GPT-4, GPT-3.5)
- **Anthropic Claude** (Claude-3 Sonnet, Haiku)
- **Google Gemini** (Gemini Pro)
- **Cohere** (Command models)
- **Replicate** (Open source models)

### Intelligent Routing
- **Cost-Optimized**: Routes to cheapest available provider
- **Performance**: Routes to fastest/most reliable providers
- **Load-Balanced**: Distributes requests evenly
- **Specialized**: Routes based on task type (coding, analysis, creative)

### Advanced Features
- 🔐 Secure API key management
- 💰 Cost tracking and limits
- 📊 Usage analytics
- ⚡ Response caching
- 🔄 Automatic failover
- 📈 Load balancing

## 🛠️ Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Keys
```bash
cp .env.example .env
# Edit .env with your actual API keys
```

### 3. Run the Application
```bash
# Demo mode
npm start

# CLI mode
node index.js "your prompt here" cost_optimized
```

## 📋 Environment Configuration

```bash
# === Primary Settings ===
PRIMARY_AI_PROVIDER=openai
FALLBACK_PROVIDERS=anthropic,google,cohere

# === API Keys ===
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
COHERE_API_KEY=your_key_here
REPLICATE_API_TOKEN=your_token_here

# === Cost Controls ===
MAX_MONTHLY_SPEND=100
ENABLE_COST_OPTIMIZATION=true

# === Performance ===
ENABLE_LOAD_BALANCING=true
ROTATE_APIS=true
```

## 🎯 Usage Examples

### Basic Usage
```javascript
const { APIRouter } = require('./index');
const router = new APIRouter();

// Cost-optimized routing
const result = await router.routeQuickQuery('Hello world');

// Performance routing
const analysis = await router.routeComplexTask('Analyze this data...');

// Specialized routing
const creative = await router.routeCreativeTask('Write a story...');
```

### CLI Usage
```bash
# Quick query with cost optimization
node index.js "What is AI automation?" cost_optimized

# Complex task with performance routing
node index.js "Analyze workflow efficiency" performance

# Creative task with specialized routing
node index.js "Write a story about robots" specialized
```

## 🛡️ Security Features

- ✅ API keys never committed to Git
- ✅ Environment variable protection
- ✅ Secure .gitignore configuration
- ✅ Cost limit enforcement
- ✅ Usage monitoring

## 📊 Routing Strategies

### Cost-Optimized
Routes to cheapest providers first:
1. Google Gemini ($0.00025/1K tokens)
2. Cohere ($0.02/1K tokens)
3. Anthropic Claude ($0.015/1K tokens)
4. OpenAI GPT-4 ($0.03/1K tokens)

### Performance
Routes to most reliable providers:
1. OpenAI (highest reliability)
2. Anthropic (excellent for analysis)
3. Google (fast responses)
4. Cohere (good for text tasks)

### Specialized
Routes based on task type:
- **Coding**: OpenAI GPT-4
- **Analysis**: Anthropic Claude
- **Creative**: Google Gemini
- **Translation**: Cohere

## 🔧 API Methods

### MultiAIManager
```javascript
const manager = new MultiAIManager();

// Generate response with fallback
await manager.generateResponse(prompt, options);

// Analyze workflow
await manager.analyzeWorkflow(workflowContent);

// Cost-optimized generation
await manager.optimizeForCost(prompt, maxCost);
```

### APIRouter
```javascript
const router = new APIRouter();

// Route with strategy
await router.route(prompt, 'cost_optimized');

// Workflow-specific routing
await router.routeWorkflowAnalysis(content);
await router.routeQuickQuery(query);
await router.routeComplexTask(task);
```

## 📈 Monitoring

### Cost Tracking
- Real-time cost estimation
- Monthly spending limits
- Per-provider cost breakdown

### Usage Analytics
- Request counts per provider
- Success/failure rates
- Response time tracking
- Cache hit rates

## 🔄 Workflow Templates

The repository includes 2000+ AI automation templates:
- Email automation
- Content generation
- Data analysis
- Customer support
- Social media management
- Document processing

## 📦 Dependencies

```json
{
  "openai": "^4.24.1",
  "@anthropic-ai/sdk": "^0.15.0",
  "@google/generative-ai": "^0.2.1",
  "cohere-ai": "^7.7.0",
  "replicate": "^0.22.0",
  "dotenv": "^16.3.1",
  "node-cache": "^5.1.2"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- **Repository**: https://github.com/jonny2301/autopro-playbook
- **Issues**: Report bugs and request features
- **Documentation**: See setup-instructions.md for detailed setup

---

Made with ❤️ for AI automation enthusiasts