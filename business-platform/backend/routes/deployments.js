const express = require('express');
const router = express.Router();
const Docker = require('dockerode');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { checkAccess, trackUsage } = require('../middleware/auth');
const Deployment = require('../models/Deployment');
const logger = require('../utils/logger');

const docker = new Docker();

class DeploymentController {
    // Get user's deployments
    static async getDeployments(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const deployments = await Deployment.findByUserId(req.user.id, {
                page: parseInt(page),
                limit: parseInt(limit),
                orderBy: 'createdAt',
                order: 'DESC'
            });

            res.json(deployments);

        } catch (error) {
            logger.error('Get deployments error:', error);
            res.status(500).json({ error: 'Failed to retrieve deployments' });
        }
    }

    // Create new deployment
    static async createDeployment(req, res) {
        try {
            const {
                name,
                repository,
                branch = 'main',
                buildCommand = 'npm run build',
                startCommand = 'npm start',
                envVars = {},
                domain,
                framework = 'auto-detect'
            } = req.body;

            if (!name || !repository) {
                return res.status(400).json({
                    error: 'Name and repository URL are required'
                });
            }

            // Check deployment limits based on user tier
            const canDeploy = await DeploymentController.checkDeploymentLimits(req.user);
            if (!canDeploy.allowed) {
                return res.status(403).json({
                    error: canDeploy.reason,
                    upgradeUrl: '/api/billing/upgrade'
                });
            }

            const deploymentId = uuidv4();
            const deployment = await Deployment.create({
                id: deploymentId,
                userId: req.user.id,
                name,
                repository,
                branch,
                buildCommand,
                startCommand,
                envVars,
                domain,
                framework,
                status: 'pending'
            });

            // Start deployment process in background
            DeploymentController.processDeployment(deployment).catch(error => {
                logger.error('Deployment process error:', error);
            });

            res.status(201).json({
                deployment,
                message: 'Deployment started. Check status for updates.'
            });

        } catch (error) {
            logger.error('Create deployment error:', error);
            res.status(500).json({ error: 'Failed to create deployment' });
        }
    }

    // Get deployment details
    static async getDeployment(req, res) {
        try {
            const { id } = req.params;
            const deployment = await Deployment.findById(id);

            if (!deployment) {
                return res.status(404).json({ error: 'Deployment not found' });
            }

            // Check ownership or admin access
            if (deployment.userId !== req.user.id && !req.user.isAdmin) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Get deployment logs
            const logs = await DeploymentController.getDeploymentLogs(id);
            
            res.json({
                ...deployment,
                logs: logs.slice(-100) // Last 100 log entries
            });

        } catch (error) {
            logger.error('Get deployment error:', error);
            res.status(500).json({ error: 'Failed to retrieve deployment' });
        }
    }

    // Redeploy
    static async redeploy(req, res) {
        try {
            const { id } = req.params;
            const deployment = await Deployment.findById(id);

            if (!deployment || deployment.userId !== req.user.id) {
                return res.status(404).json({ error: 'Deployment not found' });
            }

            await Deployment.updateById(id, { 
                status: 'pending',
                lastDeployedAt: new Date()
            });

            // Start redeployment
            const updatedDeployment = await Deployment.findById(id);
            DeploymentController.processDeployment(updatedDeployment).catch(error => {
                logger.error('Redeployment process error:', error);
            });

            res.json({ message: 'Redeployment started' });

        } catch (error) {
            logger.error('Redeploy error:', error);
            res.status(500).json({ error: 'Failed to redeploy' });
        }
    }

    // Delete deployment
    static async deleteDeployment(req, res) {
        try {
            const { id } = req.params;
            const deployment = await Deployment.findById(id);

            if (!deployment || deployment.userId !== req.user.id) {
                return res.status(404).json({ error: 'Deployment not found' });
            }

            // Stop and remove containers
            await DeploymentController.stopDeployment(deployment);
            
            // Remove from database
            await Deployment.deleteById(id);

            res.json({ message: 'Deployment deleted successfully' });

        } catch (error) {
            logger.error('Delete deployment error:', error);
            res.status(500).json({ error: 'Failed to delete deployment' });
        }
    }

    // Get deployment logs
    static async getLogs(req, res) {
        try {
            const { id } = req.params;
            const { lines = 100 } = req.query;
            
            const deployment = await Deployment.findById(id);
            if (!deployment || deployment.userId !== req.user.id) {
                return res.status(404).json({ error: 'Deployment not found' });
            }

            const logs = await DeploymentController.getDeploymentLogs(id, parseInt(lines));
            res.json({ logs });

        } catch (error) {
            logger.error('Get logs error:', error);
            res.status(500).json({ error: 'Failed to retrieve logs' });
        }
    }

    // Process deployment (main deployment logic)
    static async processDeployment(deployment) {
        const deploymentId = deployment.id;
        
        try {
            await DeploymentController.logDeployment(deploymentId, 'info', 'Starting deployment process...');
            
            // Update status
            await Deployment.updateById(deploymentId, { status: 'building' });

            // 1. Clone repository
            await DeploymentController.logDeployment(deploymentId, 'info', 'Cloning repository...');
            const projectPath = await DeploymentController.cloneRepository(deployment);

            // 2. Detect framework if auto-detect
            if (deployment.framework === 'auto-detect') {
                deployment.framework = await DeploymentController.detectFramework(projectPath);
                await Deployment.updateById(deploymentId, { framework: deployment.framework });
            }

            // 3. Build application
            await DeploymentController.logDeployment(deploymentId, 'info', 'Building application...');
            await DeploymentController.buildApplication(deployment, projectPath);

            // 4. Create Docker container
            await DeploymentController.logDeployment(deploymentId, 'info', 'Creating container...');
            const container = await DeploymentController.createContainer(deployment, projectPath);

            // 5. Start container
            await DeploymentController.logDeployment(deploymentId, 'info', 'Starting container...');
            await container.start();

            // 6. Setup domain/proxy
            if (deployment.domain) {
                await DeploymentController.setupDomain(deployment);
            }

            // 7. Update deployment status
            const containerInfo = await container.inspect();
            await Deployment.updateById(deploymentId, {
                status: 'running',
                containerId: container.id,
                url: deployment.domain ? `https://${deployment.domain}` : `http://localhost:${containerInfo.NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort}`,
                deployedAt: new Date()
            });

            await DeploymentController.logDeployment(deploymentId, 'success', 'Deployment completed successfully!');

        } catch (error) {
            logger.error(`Deployment ${deploymentId} failed:`, error);
            await DeploymentController.logDeployment(deploymentId, 'error', `Deployment failed: ${error.message}`);
            await Deployment.updateById(deploymentId, { 
                status: 'failed',
                errorMessage: error.message
            });
        }
    }

    // Clone repository
    static async cloneRepository(deployment) {
        const projectPath = path.join('/tmp/deployments', deployment.id);
        await fs.mkdir(projectPath, { recursive: true });

        const git = simpleGit();
        await git.clone(deployment.repository, projectPath, ['--branch', deployment.branch, '--single-branch']);

        return projectPath;
    }

    // Detect framework
    static async detectFramework(projectPath) {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

            // Detect based on dependencies
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

            if (deps.next) return 'nextjs';
            if (deps.react) return 'react';
            if (deps.vue) return 'vuejs';
            if (deps.angular) return 'angular';
            if (deps.express) return 'express';
            if (deps.fastify) return 'fastify';

            return 'nodejs';

        } catch (error) {
            // Check for other framework indicators
            const files = await fs.readdir(projectPath);
            
            if (files.includes('index.html')) return 'static';
            if (files.includes('Dockerfile')) return 'docker';
            if (files.includes('requirements.txt')) return 'python';
            if (files.includes('go.mod')) return 'go';

            return 'static';
        }
    }

    // Build application
    static async buildApplication(deployment, projectPath) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Install dependencies
        await execAsync('npm install', { cwd: projectPath });

        // Run build command if specified
        if (deployment.buildCommand && deployment.buildCommand !== 'none') {
            await execAsync(deployment.buildCommand, { cwd: projectPath });
        }
    }

    // Create Docker container
    static async createContainer(deployment, projectPath) {
        const dockerfile = await DeploymentController.generateDockerfile(deployment);
        await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfile);

        // Build image
        const imageName = `scalepro-${deployment.id}`;
        const stream = await docker.buildImage({
            context: projectPath,
            src: ['.']
        }, { t: imageName });

        // Wait for build to complete
        await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });

        // Create container
        const container = await docker.createContainer({
            Image: imageName,
            Env: Object.entries(deployment.envVars).map(([key, value]) => `${key}=${value}`),
            ExposedPorts: { '3000/tcp': {} },
            HostConfig: {
                PortBindings: { '3000/tcp': [{ HostPort: '0' }] },
                RestartPolicy: { Name: 'unless-stopped' }
            }
        });

        return container;
    }

    // Generate Dockerfile based on framework
    static async generateDockerfile(deployment) {
        const dockerfiles = {
            'nextjs': `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
            `,
            'react': `
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
            `,
            'nodejs': `
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["${deployment.startCommand || 'npm start'}"]
            `,
            'static': `
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
            `
        };

        return dockerfiles[deployment.framework] || dockerfiles['nodejs'];
    }

    // Check deployment limits
    static async checkDeploymentLimits(user) {
        const currentDeployments = await Deployment.countByUserId(user.id);
        
        const limits = {
            'free': 1,
            'starter': 10,
            'professional': -1, // unlimited
            'enterprise': -1
        };

        const userLimit = limits[user.subscriptionTier] || limits['free'];
        
        if (userLimit === -1) {
            return { allowed: true };
        }

        if (currentDeployments >= userLimit) {
            return {
                allowed: false,
                reason: `Deployment limit reached (${userLimit}). Upgrade your plan for more deployments.`
            };
        }

        return { allowed: true };
    }

    // Logging helper
    static async logDeployment(deploymentId, level, message) {
        // Store in database and log file
        logger.info(`Deployment ${deploymentId}: ${message}`);
        // Could also store in a deployment_logs table
    }

    // Get deployment logs
    static async getDeploymentLogs(deploymentId, lines = 100) {
        // This would typically read from a log file or database
        // For now, return placeholder
        return [
            { timestamp: new Date(), level: 'info', message: 'Deployment logs would appear here' }
        ];
    }

    // Stop deployment
    static async stopDeployment(deployment) {
        if (deployment.containerId) {
            try {
                const container = docker.getContainer(deployment.containerId);
                await container.stop();
                await container.remove();
            } catch (error) {
                logger.warn('Failed to stop container:', error);
            }
        }
    }

    // Setup domain
    static async setupDomain(deployment) {
        // This would integrate with your DNS provider (Cloudflare, etc.)
        // For now, just log the action
        logger.info(`Setting up domain ${deployment.domain} for deployment ${deployment.id}`);
    }
}

// Routes
router.get('/', checkAccess('starter'), trackUsage('deployments_list'), DeploymentController.getDeployments);
router.post('/', checkAccess('starter'), trackUsage('deployments_create'), DeploymentController.createDeployment);
router.get('/:id', checkAccess('starter'), DeploymentController.getDeployment);
router.post('/:id/redeploy', checkAccess('starter'), trackUsage('deployments_redeploy'), DeploymentController.redeploy);
router.delete('/:id', checkAccess('starter'), DeploymentController.deleteDeployment);
router.get('/:id/logs', checkAccess('starter'), DeploymentController.getLogs);

module.exports = router;