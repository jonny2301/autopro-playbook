const fs = require('fs');
const path = require('path');

class WorkflowOrganizer {
    constructor(baseDir = './additional-workflows') {
        this.baseDir = baseDir;
        this.categories = {
            'email-automation': ['email', 'gmail', 'outlook', 'autoresponder', 'reply'],
            'social-media': ['telegram', 'twitter', 'instagram', 'social', 'discord', 'whatsapp'],
            'data-analysis': ['analyze', 'data', 'analytics', 'insights', 'research', 'extract'],
            'content-generation': ['generate', 'create', 'write', 'content', 'blog', 'post'],
            'ai-chatbots': ['chatbot', 'chat', 'bot', 'assistant', 'conversation'],
            'document-processing': ['pdf', 'document', 'parse', 'extract', 'transcribe'],
            'workflow-automation': ['automate', 'workflow', 'process', 'pipeline', 'trigger'],
            'image-video': ['image', 'video', 'photo', 'visual', 'dalle', 'flux'],
            'database-integration': ['database', 'supabase', 'postgres', 'airtable', 'mongodb'],
            'monitoring-alerts': ['monitor', 'alert', 'notification', 'tracking', 'security'],
            'voice-audio': ['voice', 'audio', 'speech', 'transcribe', 'elevenlabs'],
            'ecommerce': ['shop', 'product', 'commerce', 'payment', 'store'],
            'productivity': ['calendar', 'schedule', 'task', 'notion', 'productivity'],
            'hr-recruitment': ['hr', 'recruitment', 'cv', 'resume', 'candidate', 'job'],
            'advanced-ai': ['rag', 'embedding', 'vector', 'langchain', 'openai', 'claude']
        };
        
        this.stats = {
            totalFiles: 0,
            categorized: 0,
            uncategorized: 0,
            categories: {}
        };
    }

    async organizeWorkflows() {
        console.log('🔄 Starting workflow organization...\n');
        
        // Create category directories
        for (const category of Object.keys(this.categories)) {
            const categoryDir = path.join('workflows', category);
            if (!fs.existsSync(categoryDir)) {
                fs.mkdirSync(categoryDir, { recursive: true });
            }
            this.stats.categories[category] = 0;
        }

        // Create uncategorized directory
        const uncategorizedDir = path.join('workflows', 'uncategorized');
        if (!fs.existsSync(uncategorizedDir)) {
            fs.mkdirSync(uncategorizedDir, { recursive: true });
        }

        // Process files
        const files = this.getWorkflowFiles();
        this.stats.totalFiles = files.length;

        for (const file of files) {
            await this.categorizeFile(file);
        }

        this.generateIndex();
        this.printStats();
    }

    getWorkflowFiles() {
        if (!fs.existsSync(this.baseDir)) {
            console.log(`❌ Directory ${this.baseDir} not found`);
            return [];
        }

        return fs.readdirSync(this.baseDir)
            .filter(file => file.endsWith('.txt') || file.endsWith('.md'))
            .map(file => path.join(this.baseDir, file));
    }

    async categorizeFile(filePath) {
        const fileName = path.basename(filePath).toLowerCase();
        const content = this.readFileContent(filePath);
        
        // Try to categorize based on filename and content
        const category = this.determineCategory(fileName, content);
        
        if (category) {
            const destPath = path.join('workflows', category, path.basename(filePath));
            fs.copyFileSync(filePath, destPath);
            this.stats.categories[category]++;
            this.stats.categorized++;
        } else {
            const destPath = path.join('workflows', 'uncategorized', path.basename(filePath));
            fs.copyFileSync(filePath, destPath);
            this.stats.uncategorized++;
        }
    }

    readFileContent(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8').toLowerCase();
        } catch (error) {
            return '';
        }
    }

    determineCategory(fileName, content) {
        const text = fileName + ' ' + content.substring(0, 500); // First 500 chars
        
        for (const [category, keywords] of Object.entries(this.categories)) {
            for (const keyword of keywords) {
                if (text.includes(keyword)) {
                    return category;
                }
            }
        }
        
        return null;
    }

    generateIndex() {
        let indexContent = '# 🤖 AI Automation Workflow Index\n\n';
        indexContent += `Total Workflows: **${this.stats.totalFiles}**\n`;
        indexContent += `Categorized: **${this.stats.categorized}**\n`;
        indexContent += `Uncategorized: **${this.stats.uncategorized}**\n\n`;

        // Generate category sections
        for (const [category, count] of Object.entries(this.stats.categories)) {
            if (count > 0) {
                indexContent += `## ${this.formatCategoryName(category)} (${count} workflows)\n\n`;
                
                const categoryDir = path.join('workflows', category);
                if (fs.existsSync(categoryDir)) {
                    const files = fs.readdirSync(categoryDir);
                    for (const file of files.slice(0, 10)) { // Show first 10
                        const name = file.replace(/\.[^/.]+$/, ""); // Remove extension
                        indexContent += `- [${name}](workflows/${category}/${file})\n`;
                    }
                    if (files.length > 10) {
                        indexContent += `- ... and ${files.length - 10} more\n`;
                    }
                }
                indexContent += '\n';
            }
        }

        // Add search and usage instructions
        indexContent += this.generateUsageInstructions();

        fs.writeFileSync('WORKFLOW_INDEX.md', indexContent);
    }

    generateUsageInstructions() {
        return `
## 🔍 How to Use This Index

### Quick Search
Use your browser's search function (Ctrl+F / Cmd+F) to find specific workflows.

### Categories Explained
- **Email Automation**: Automated email processing, responses, and management
- **Social Media**: Bots and automation for social platforms
- **Data Analysis**: Extract insights from various data sources
- **Content Generation**: AI-powered content creation
- **AI Chatbots**: Conversational AI implementations
- **Document Processing**: PDF, text, and document handling
- **Workflow Automation**: General process automation
- **Image/Video**: Visual content processing and generation
- **Database Integration**: Connect and manage databases
- **Monitoring/Alerts**: System monitoring and notifications
- **Voice/Audio**: Speech processing and generation
- **E-commerce**: Online store automation
- **Productivity**: Tools for enhanced productivity
- **HR/Recruitment**: Human resources automation
- **Advanced AI**: RAG, embeddings, and complex AI workflows

### Running Workflows
1. Navigate to the specific workflow file
2. Follow the setup instructions in each workflow
3. Use the multi-AI API system for intelligent routing
4. Monitor costs and performance through the dashboard

### API Integration
All workflows can leverage the multi-AI provider system:
\`\`\`bash
# Cost-optimized routing
node index.js "workflow prompt" cost_optimized

# Performance routing
node index.js "workflow prompt" performance

# Specialized routing
node index.js "workflow prompt" specialized
\`\`\`

---
*Generated automatically by WorkflowOrganizer*
`;
    }

    formatCategoryName(category) {
        return category
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    printStats() {
        console.log('📊 Organization Complete!\n');
        console.log(`Total files processed: ${this.stats.totalFiles}`);
        console.log(`Successfully categorized: ${this.stats.categorized}`);
        console.log(`Uncategorized: ${this.stats.uncategorized}\n`);
        
        console.log('📁 Category breakdown:');
        for (const [category, count] of Object.entries(this.stats.categories)) {
            if (count > 0) {
                console.log(`  ${this.formatCategoryName(category)}: ${count} workflows`);
            }
        }
        
        console.log('\n✅ Index generated: WORKFLOW_INDEX.md');
    }
}

// Run if called directly
if (require.main === module) {
    const organizer = new WorkflowOrganizer();
    organizer.organizeWorkflows();
}

module.exports = WorkflowOrganizer;