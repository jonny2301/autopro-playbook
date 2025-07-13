const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const logger = require('../utils/logger');

class AuthMiddleware {
    // Standard authentication middleware
    static async authenticate(req, res, next) {
        try {
            const token = AuthMiddleware.extractToken(req);
            
            if (!token) {
                return res.status(401).json({
                    error: 'Access denied. No token provided.'
                });
            }

            const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);

            if (!user) {
                return res.status(401).json({
                    error: 'Invalid token. User not found.'
                });
            }

            if (!user.isActive) {
                return res.status(401).json({
                    error: 'Account is deactivated.'
                });
            }

            req.user = user;
            req.userId = user.id;
            next();

        } catch (error) {
            logger.error('Authentication error:', error);
            return res.status(401).json({
                error: 'Invalid token.'
            });
        }
    }

    // Check if user has access to features (free vs paid)
    static checkAccess(requiredTier = 'free') {
        return async (req, res, next) => {
            try {
                const user = req.user;
                
                // Super admin always has access
                if (AuthMiddleware.isSuperAdmin(user)) {
                    req.accessLevel = 'super_admin';
                    return next();
                }

                // Check if user is in free access list
                if (AuthMiddleware.hasFreeAccess(user)) {
                    req.accessLevel = 'free_access';
                    return next();
                }

                // Check subscription status for paid users
                const hasAccess = await AuthMiddleware.checkSubscriptionAccess(user, requiredTier);
                
                if (!hasAccess) {
                    return res.status(403).json({
                        error: 'Access denied. Upgrade your plan to access this feature.',
                        requiredTier,
                        currentTier: user.subscriptionTier || 'free',
                        upgradeUrl: '/api/billing/upgrade'
                    });
                }

                req.accessLevel = user.subscriptionTier || 'free';
                next();

            } catch (error) {
                logger.error('Access check error:', error);
                return res.status(500).json({
                    error: 'Failed to verify access permissions.'
                });
            }
        };
    }

    // Admin only middleware
    static requireAdmin(req, res, next) {
        if (!AuthMiddleware.isSuperAdmin(req.user)) {
            return res.status(403).json({
                error: 'Admin access required.'
            });
        }
        next();
    }

    // Extract JWT token from request
    static extractToken(req) {
        const authHeader = req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }

    // Check if user is super admin (you)
    static isSuperAdmin(user) {
        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
        const superAdminId = process.env.SUPER_ADMIN_USER_ID;
        
        return user.email === superAdminEmail || 
               user.id === superAdminId ||
               user.role === 'super_admin';
    }

    // Check if user has free access
    static hasFreeAccess(user) {
        const freeAccessUsers = process.env.FREE_ACCESS_USERS?.split(',') || [];
        return freeAccessUsers.includes(user.email) || 
               user.role === 'free_access';
    }

    // Check subscription access level
    static async checkSubscriptionAccess(user, requiredTier) {
        const tierHierarchy = {
            'free': 0,
            'starter': 1,
            'professional': 2,
            'enterprise': 3
        };

        const userTierLevel = tierHierarchy[user.subscriptionTier] || 0;
        const requiredTierLevel = tierHierarchy[requiredTier] || 0;

        // Check if subscription is active
        if (user.subscriptionStatus !== 'active' && requiredTier !== 'free') {
            return false;
        }

        // Check if user's tier meets requirement
        return userTierLevel >= requiredTierLevel;
    }

    // Rate limiting based on user tier
    static createTieredRateLimit() {
        const rateLimit = require('express-rate-limit');
        
        return rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: (req) => {
                if (AuthMiddleware.isSuperAdmin(req.user)) {
                    return 10000; // Unlimited for super admin
                }
                
                if (AuthMiddleware.hasFreeAccess(req.user)) {
                    return 5000; // High limit for free access users
                }

                const tierLimits = {
                    'free': 100,
                    'starter': 500,
                    'professional': 2000,
                    'enterprise': 5000
                };

                return tierLimits[req.user?.subscriptionTier] || 50;
            },
            message: (req) => ({
                error: 'Rate limit exceeded',
                tier: req.user?.subscriptionTier || 'free',
                upgradeUrl: '/api/billing/upgrade'
            }),
            standardHeaders: true,
            legacyHeaders: false
        });
    }

    // Usage tracking middleware
    static trackUsage(feature) {
        return async (req, res, next) => {
            try {
                // Skip tracking for super admin and free access users
                if (AuthMiddleware.isSuperAdmin(req.user) || 
                    AuthMiddleware.hasFreeAccess(req.user)) {
                    return next();
                }

                // Track usage for billing purposes
                const Usage = require('../models/Usage');
                await Usage.recordUsage({
                    userId: req.user.id,
                    feature,
                    timestamp: new Date(),
                    metadata: {
                        endpoint: req.originalUrl,
                        method: req.method,
                        userAgent: req.get('User-Agent'),
                        ip: req.ip
                    }
                });

                next();

            } catch (error) {
                logger.error('Usage tracking error:', error);
                // Don't block request if usage tracking fails
                next();
            }
        };
    }

    // Feature flag middleware
    static requireFeature(featureName) {
        return (req, res, next) => {
            const Features = require('../utils/features');
            
            if (!Features.isEnabled(featureName, req.user)) {
                return res.status(403).json({
                    error: `Feature '${featureName}' is not available for your plan`,
                    feature: featureName,
                    upgradeUrl: '/api/billing/upgrade'
                });
            }
            
            next();
        };
    }
}

module.exports = AuthMiddleware.authenticate;
module.exports.checkAccess = AuthMiddleware.checkAccess;
module.exports.requireAdmin = AuthMiddleware.requireAdmin;
module.exports.isSuperAdmin = AuthMiddleware.isSuperAdmin;
module.exports.hasFreeAccess = AuthMiddleware.hasFreeAccess;
module.exports.createTieredRateLimit = AuthMiddleware.createTieredRateLimit;
module.exports.trackUsage = AuthMiddleware.trackUsage;
module.exports.requireFeature = AuthMiddleware.requireFeature;