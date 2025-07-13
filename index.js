const AIManager = require('./ai-api-manager');

async function main() {
    const aiManager = new AIManager();
    
    console.log('🤖 AI Automation Playbook Manager');
    console.log('Status:', aiManager.getStatus());
    
    // Example usage
    try {
        const result = await aiManager.generateResponse('Hello, how can I optimize my AI workflows?');
        console.log('\n📝 Response:', result);
        
        if (result.success) {
            console.log(`✅ Generated ${result.tokens || 'unknown'} tokens using ${result.provider}`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { AIManager };