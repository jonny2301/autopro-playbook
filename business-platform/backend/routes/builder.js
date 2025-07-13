const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { checkAccess, trackUsage } = require('../middleware/auth');
const Website = require('../models/Website');
const Template = require('../models/Template');
const Component = require('../models/Component');
const logger = require('../utils/logger');

class BuilderController {
    // Get user's websites
    static async getWebsites(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const websites = await Website.findByUserId(req.user.id, {
                page: parseInt(page),
                limit: parseInt(limit),
                orderBy: 'updatedAt',
                order: 'DESC'
            });

            res.json(websites);

        } catch (error) {
            logger.error('Get websites error:', error);
            res.status(500).json({ error: 'Failed to retrieve websites' });
        }
    }

    // Create new website
    static async createWebsite(req, res) {
        try {
            const {
                name,
                templateId,
                domain,
                settings = {},
                pages = []
            } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Website name is required' });
            }

            // Check website limits
            const canCreate = await BuilderController.checkWebsiteLimits(req.user);
            if (!canCreate.allowed) {
                return res.status(403).json({
                    error: canCreate.reason,
                    upgradeUrl: '/api/billing/upgrade'
                });
            }

            const websiteId = uuidv4();
            
            // Get template data if templateId provided
            let templateData = null;
            if (templateId) {
                templateData = await Template.findById(templateId);
            }

            const website = await Website.create({
                id: websiteId,
                userId: req.user.id,
                name,
                domain,
                templateId,
                settings: {
                    theme: 'default',
                    primaryColor: '#007bff',
                    fontFamily: 'Inter',
                    ...settings
                },
                pages: pages.length > 0 ? pages : (templateData?.pages || [
                    {
                        id: uuidv4(),
                        name: 'Home',
                        path: '/',
                        title: name,
                        components: []
                    }
                ]),
                status: 'draft'
            });

            res.status(201).json(website);

        } catch (error) {
            logger.error('Create website error:', error);
            res.status(500).json({ error: 'Failed to create website' });
        }
    }

    // Get website details
    static async getWebsite(req, res) {
        try {
            const { id } = req.params;
            const website = await Website.findById(id);

            if (!website) {
                return res.status(404).json({ error: 'Website not found' });
            }

            if (website.userId !== req.user.id && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Access denied' });
            }

            res.json(website);

        } catch (error) {
            logger.error('Get website error:', error);
            res.status(500).json({ error: 'Failed to retrieve website' });
        }
    }

    // Update website
    static async updateWebsite(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;

            const website = await Website.findById(id);
            if (!website || website.userId !== req.user.id) {
                return res.status(404).json({ error: 'Website not found' });
            }

            const updatedWebsite = await Website.updateById(id, {
                ...updates,
                updatedAt: new Date()
            });

            res.json(updatedWebsite);

        } catch (error) {
            logger.error('Update website error:', error);
            res.status(500).json({ error: 'Failed to update website' });
        }
    }

    // Publish website
    static async publishWebsite(req, res) {
        try {
            const { id } = req.params;
            const { domain } = req.body;

            const website = await Website.findById(id);
            if (!website || website.userId !== req.user.id) {
                return res.status(404).json({ error: 'Website not found' });
            }

            // Generate static HTML/CSS/JS
            const generatedFiles = await BuilderController.generateWebsiteFiles(website);
            
            // Deploy to hosting (this would integrate with your hosting service)
            const deploymentUrl = await BuilderController.deployWebsite(website, generatedFiles, domain);

            await Website.updateById(id, {
                status: 'published',
                domain: domain || website.domain,
                publishedUrl: deploymentUrl,
                publishedAt: new Date()
            });

            res.json({
                message: 'Website published successfully',
                url: deploymentUrl
            });

        } catch (error) {
            logger.error('Publish website error:', error);
            res.status(500).json({ error: 'Failed to publish website' });
        }
    }

    // Delete website
    static async deleteWebsite(req, res) {
        try {
            const { id } = req.params;
            const website = await Website.findById(id);

            if (!website || website.userId !== req.user.id) {
                return res.status(404).json({ error: 'Website not found' });
            }

            await Website.deleteById(id);
            res.json({ message: 'Website deleted successfully' });

        } catch (error) {
            logger.error('Delete website error:', error);
            res.status(500).json({ error: 'Failed to delete website' });
        }
    }

    // Get available templates
    static async getTemplates(req, res) {
        try {
            const { category, page = 1, limit = 20 } = req.query;
            
            const templates = await Template.findAll({
                category,
                page: parseInt(page),
                limit: parseInt(limit),
                orderBy: 'popularity',
                order: 'DESC'
            });

            res.json(templates);

        } catch (error) {
            logger.error('Get templates error:', error);
            res.status(500).json({ error: 'Failed to retrieve templates' });
        }
    }

    // Get template details
    static async getTemplate(req, res) {
        try {
            const { id } = req.params;
            const template = await Template.findById(id);

            if (!template) {
                return res.status(404).json({ error: 'Template not found' });
            }

            res.json(template);

        } catch (error) {
            logger.error('Get template error:', error);
            res.status(500).json({ error: 'Failed to retrieve template' });
        }
    }

    // Get available components
    static async getComponents(req, res) {
        try {
            const { category, page = 1, limit = 50 } = req.query;
            
            const components = await Component.findAll({
                category,
                page: parseInt(page),
                limit: parseInt(limit),
                orderBy: 'name'
            });

            res.json(components);

        } catch (error) {
            logger.error('Get components error:', error);
            res.status(500).json({ error: 'Failed to retrieve components' });
        }
    }

    // Save page
    static async savePage(req, res) {
        try {
            const { websiteId, pageId } = req.params;
            const pageData = req.body;

            const website = await Website.findById(websiteId);
            if (!website || website.userId !== req.user.id) {
                return res.status(404).json({ error: 'Website not found' });
            }

            // Update the specific page in the website's pages array
            const updatedPages = website.pages.map(page => 
                page.id === pageId ? { ...page, ...pageData, updatedAt: new Date() } : page
            );

            await Website.updateById(websiteId, {
                pages: updatedPages,
                updatedAt: new Date()
            });

            res.json({ message: 'Page saved successfully' });

        } catch (error) {
            logger.error('Save page error:', error);
            res.status(500).json({ error: 'Failed to save page' });
        }
    }

    // Add new page
    static async addPage(req, res) {
        try {
            const { websiteId } = req.params;
            const { name, path, title, components = [] } = req.body;

            const website = await Website.findById(websiteId);
            if (!website || website.userId !== req.user.id) {
                return res.status(404).json({ error: 'Website not found' });
            }

            const newPage = {
                id: uuidv4(),
                name,
                path,
                title,
                components,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const updatedPages = [...website.pages, newPage];

            await Website.updateById(websiteId, {
                pages: updatedPages,
                updatedAt: new Date()
            });

            res.status(201).json(newPage);

        } catch (error) {
            logger.error('Add page error:', error);
            res.status(500).json({ error: 'Failed to add page' });
        }
    }

    // Generate website files
    static async generateWebsiteFiles(website) {
        const files = {
            'index.html': BuilderController.generateHTML(website),
            'styles.css': BuilderController.generateCSS(website),
            'script.js': BuilderController.generateJS(website)
        };

        // Generate additional pages
        website.pages.forEach(page => {
            if (page.path !== '/') {
                files[`${page.path.replace('/', '')}/index.html`] = BuilderController.generatePageHTML(website, page);
            }
        });

        return files;
    }

    // Generate HTML
    static generateHTML(website) {
        const homePage = website.pages.find(page => page.path === '/') || website.pages[0];
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${homePage.title || website.name}</title>
    <link rel="stylesheet" href="styles.css">
    <link href="https://fonts.googleapis.com/css2?family=${website.settings.fontFamily}:wght@300;400;600;700&display=swap" rel="stylesheet">
</head>
<body>
    ${BuilderController.generatePageComponents(homePage)}
    <script src="script.js"></script>
</body>
</html>
        `.trim();
    }

    // Generate CSS
    static generateCSS(website) {
        return `
:root {
    --primary-color: ${website.settings.primaryColor || '#007bff'};
    --font-family: '${website.settings.fontFamily || 'Inter'}', sans-serif;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: var(--font-family);
    line-height: 1.6;
    color: #333;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.btn {
    display: inline-block;
    padding: 12px 24px;
    background: var(--primary-color);
    color: white;
    text-decoration: none;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: all 0.3s ease;
}

.btn:hover {
    opacity: 0.9;
    transform: translateY(-2px);
}

/* Component styles would be generated here based on components used */
        `.trim();
    }

    // Generate JavaScript
    static generateJS(website) {
        return `
// Generated JavaScript for ${website.name}
document.addEventListener('DOMContentLoaded', function() {
    console.log('Website loaded: ${website.name}');
    
    // Add any interactive functionality here
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            // Add click analytics or other functionality
        });
    });
});
        `.trim();
    }

    // Generate page components HTML
    static generatePageComponents(page) {
        if (!page.components || page.components.length === 0) {
            return '<div class="container"><h1>Welcome to your website!</h1></div>';
        }

        return page.components.map(component => {
            return BuilderController.generateComponentHTML(component);
        }).join('\n');
    }

    // Generate component HTML
    static generateComponentHTML(component) {
        const componentTemplates = {
            'header': `
                <header class="header" style="${component.styles || ''}">
                    <div class="container">
                        <h1>${component.content?.title || 'Website Title'}</h1>
                        <nav>${component.content?.navigation || ''}</nav>
                    </div>
                </header>
            `,
            'hero': `
                <section class="hero" style="${component.styles || ''}">
                    <div class="container">
                        <h1>${component.content?.title || 'Hero Title'}</h1>
                        <p>${component.content?.subtitle || 'Hero subtitle'}</p>
                        ${component.content?.buttonText ? `<a href="${component.content?.buttonUrl || '#'}" class="btn">${component.content.buttonText}</a>` : ''}
                    </div>
                </section>
            `,
            'text': `
                <div class="text-component" style="${component.styles || ''}">
                    <div class="container">
                        ${component.content?.html || component.content?.text || 'Text content'}
                    </div>
                </div>
            `,
            'image': `
                <div class="image-component" style="${component.styles || ''}">
                    <img src="${component.content?.src || ''}" alt="${component.content?.alt || ''}" />
                </div>
            `
        };

        return componentTemplates[component.type] || `<div>Unknown component: ${component.type}</div>`;
    }

    // Deploy website (placeholder for actual deployment logic)
    static async deployWebsite(website, files, domain) {
        // This would integrate with your hosting service
        // For now, return a placeholder URL
        const subdomain = domain || `${website.name.toLowerCase().replace(/\s+/g, '-')}-${website.id.slice(0, 8)}`;
        return `https://${subdomain}.scalepro.app`;
    }

    // Check website limits
    static async checkWebsiteLimits(user) {
        const currentWebsites = await Website.countByUserId(user.id);
        
        const limits = {
            'free': 1,
            'starter': 5,
            'professional': 25,
            'enterprise': -1 // unlimited
        };

        const userLimit = limits[user.subscriptionTier] || limits['free'];
        
        if (userLimit === -1) {
            return { allowed: true };
        }

        if (currentWebsites >= userLimit) {
            return {
                allowed: false,
                reason: `Website limit reached (${userLimit}). Upgrade your plan for more websites.`
            };
        }

        return { allowed: true };
    }
}

// Routes
router.get('/websites', checkAccess('free'), BuilderController.getWebsites);
router.post('/websites', checkAccess('free'), trackUsage('websites_create'), BuilderController.createWebsite);
router.get('/websites/:id', checkAccess('free'), BuilderController.getWebsite);
router.put('/websites/:id', checkAccess('free'), trackUsage('websites_update'), BuilderController.updateWebsite);
router.post('/websites/:id/publish', checkAccess('starter'), trackUsage('websites_publish'), BuilderController.publishWebsite);
router.delete('/websites/:id', checkAccess('free'), BuilderController.deleteWebsite);

router.get('/templates', BuilderController.getTemplates);
router.get('/templates/:id', BuilderController.getTemplate);
router.get('/components', BuilderController.getComponents);

router.put('/websites/:websiteId/pages/:pageId', checkAccess('free'), trackUsage('pages_update'), BuilderController.savePage);
router.post('/websites/:websiteId/pages', checkAccess('free'), trackUsage('pages_create'), BuilderController.addPage);

module.exports = router;