const MultiAIManager = require('./multi-ai-manager');
const APIRouter = require('./api-router');

async function main() {
    console.log('🤖 Multi-AI Automation Playbook Manager\n');
    
    const aiManager = new MultiAIManager();
    const router = new APIRouter();
    
    console.log('📊 System Status:');
    console.log(JSON.stringify(aiManager.getStatus(), null, 2));
    
    // Example usage scenarios
    console.log('\n🚀 Running Example Tests...\n');
    
    try {
        // Test 1: Cost-optimized routing
        console.log('💰 Testing cost-optimized routing...');
        const costResult = await router.routeQuickQuery('What are the benefits of AI automation?');
        if (costResult.success) {
            console.log(`✅ Cost-optimized: ${costResult.provider} (${costResult.tokens} tokens, $${costResult.estimatedCost?.toFixed(4) || 'unknown'})`);
        }
        
        // Test 2: Performance routing
        console.log('\n⚡ Testing performance routing...');
        const perfResult = await router.routeComplexTask('Analyze the efficiency of multi-AI systems in enterprise automation workflows');
        if (perfResult.success) {
            console.log(`✅ Performance: ${perfResult.provider} (${perfResult.tokens} tokens)`);
        }
        
        // Test 3: Specialized routing
        console.log('\n🎯 Testing specialized routing...');
        const specResult = await router.routeCreativeTask('Write a creative story about AI agents collaborating');
        if (specResult.success) {
            console.log(`✅ Specialized: ${specResult.provider} for ${specResult.taskType} task`);
        }
        
        // Show routing statistics
        console.log('\n📈 Routing Statistics:');
        console.log(JSON.stringify(router.getRoutingStats(), null, 2));
        
    } catch (error) {
        console.error('❌ Error during testing:', error.message);
    }
}

// CLI interface
async function runCLI() {
    const args = process.argv.slice(2);
    const router = new APIRouter();
    
    if (args.length === 0) {
        console.log('Usage: node index.js "your prompt here" [strategy]');
        console.log('Strategies: cost_optimized, performance, load_balanced, specialized');
        return;
    }
    
    const prompt = args[0];
    const strategy = args[1] || 'cost_optimized';
    
    console.log(`🤖 Processing with ${strategy} strategy...`);
    
    try {
        const result = await router.route(prompt, strategy);
        
        if (result.success) {
            console.log(`\n✅ Success via ${result.provider}:`);
            console.log(`📝 Response: ${result.response}`);
            console.log(`💰 Cost: $${result.estimatedCost?.toFixed(4) || 'unknown'}`);
            console.log(`🎯 Tokens: ${result.tokens}`);
        } else {
            console.log(`❌ Failed: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Check if running with arguments (CLI mode) or without (demo mode)
if (require.main === module) {
    if (process.argv.length > 2) {
        runCLI();
    } else {
        main();
    }
}

module.exports = { MultiAIManager, APIRouter };