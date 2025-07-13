# 🚀 24/7 Continuous Operation Setup

## Quick Start Commands

### Install Dependencies
```bash
npm install
```

### Setup Environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### Start 24/7 Operations

**Option 1: Simple 24/7 Manager**
```bash
npm run 24-7
```

**Option 2: Production PM2 (Recommended)**
```bash
npm run pm2:start
```

## 🆓 Free OpenRouter Setup

### 1. Get Free OpenRouter API Key
- Visit: https://openrouter.ai/
- Sign up for free account
- Get API key from dashboard
- Add to `.env`: `OPENROUTER_API_KEY=your_key_here`

### 2. Free Models Available
- **microsoft/wizardlm-2-8x22b:free** (Default)
- **meta-llama/llama-3.1-8b-instruct:free**
- **mistralai/mistral-7b-instruct:free**
- **google/gemma-7b-it:free**

## 🛡️ 24/7 Features

### Auto-Restart System
- **Max Restarts**: 10 per day
- **Restart Delay**: 5 seconds
- **Health Checks**: Every 30 seconds
- **Memory Limits**: 1GB (auto-restart)

### Health Monitoring
- API connectivity tests
- Memory usage tracking
- Disk space monitoring
- Network connectivity
- Process status checks

### Error Recovery
- Automatic failover between providers
- Graceful degradation
- Smart retry logic
- Log rotation and cleanup

## 🔧 Configuration

### Environment Variables
```bash
# 24/7 Settings
MAX_RESTARTS=10
RESTART_DELAY=5000
HEALTH_CHECK_INTERVAL=30000
MAX_MEMORY_MB=1024

# Monitoring
MONITOR_MODE=true
LOG_LEVEL=info
```

### OpenRouter Configuration
```bash
# Set as primary provider for free operation
PRIMARY_AI_PROVIDER=openrouter
FALLBACK_PROVIDERS=openrouter,google,anthropic,cohere

# Free model selection
OPENROUTER_MODEL=microsoft/wizardlm-2-8x22b:free
```

## 📊 Monitoring Commands

### Check System Health
```bash
npm run health
```

### Check Quota Usage
```bash
npm run quota
```

### View Logs
```bash
npm run pm2:logs
```

### Monitor Processes
```bash
npm run pm2:monit
```

## 🔄 Management Commands

### PM2 Process Management
```bash
# Start all services
npm run pm2:start

# Stop all services  
npm run pm2:stop

# Restart all services
npm run pm2:restart

# View process status
pm2 status

# View detailed monitoring
pm2 monit
```

### Health Checks
```bash
# Full health report
npm run health

# Quick quota check
npm run quota

# Manual health test
node -e "const h = require('./health-monitor'); new h().performComprehensiveHealthCheck().then(console.log)"
```

## 📁 Log Files

All logs are stored in the `logs/` directory:
- `error.log` - Error messages only
- `combined.log` - All log messages
- `pm2-*.log` - PM2 process logs
- `monitor-*.log` - Health monitor logs

## 🚨 Alerts & Notifications

### Automatic Alerts
- **High Memory**: >80% usage
- **API Failures**: >30% failure rate
- **Slow Response**: >10 second response time
- **Quota Limits**: >90% of daily quota used
- **Network Issues**: Connectivity problems

### Alert Levels
- **Info**: Normal operations
- **Warning**: Attention needed
- **Critical**: Immediate action required

## 🛠️ Troubleshooting

### Common Issues

**Service Won't Start**
```bash
# Check PM2 status
pm2 status

# View error logs
npm run pm2:logs

# Restart services
npm run pm2:restart
```

**High Memory Usage**
```bash
# Check current usage
npm run health

# Restart to clear memory
npm run pm2:restart
```

**API Quota Exceeded**
```bash
# Check quota status
npm run quota

# Switch to free providers
# Edit .env: PRIMARY_AI_PROVIDER=openrouter
```

**Network Connectivity Issues**
```bash
# Test network
curl -I https://openrouter.ai/api/v1/models

# Check health status
npm run health
```

## ⚡ Performance Optimization

### Resource Limits
- **Memory**: 1GB per process
- **CPU**: Automatic scaling
- **Disk**: Auto log cleanup (7 days)
- **Network**: 5-second timeouts

### Load Balancing
- Multiple AI providers
- Automatic failover
- Cost optimization
- Geographic distribution

### Caching
- 10-minute response cache
- Reduces API calls
- Improves response time
- Saves quota usage

## 🔒 Security Features

- API keys secured in environment
- No credentials in logs
- Secure process isolation
- Automatic security updates
- Rate limiting protection

---

**Your AI automation system is now bulletproof and runs 24/7 with zero downtime! 🛡️🚀**