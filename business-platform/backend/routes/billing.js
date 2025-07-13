const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const { checkAccess, requireAdmin, isSuperAdmin, hasFreeAccess } = require('../middleware/auth');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const logger = require('../utils/logger');

class BillingController {
    // Get current user's billing info
    static async getBillingInfo(req, res) {
        try {
            const user = req.user;

            // Super admin and free access users don't have billing
            if (isSuperAdmin(user) || hasFreeAccess(user)) {
                return res.json({
                    userType: isSuperAdmin(user) ? 'super_admin' : 'free_access',
                    hasFullAccess: true,
                    subscriptionTier: 'unlimited',
                    message: 'Full platform access - no billing required'
                });
            }

            const billingInfo = await BillingController.getUserBillingInfo(user.id);
            res.json(billingInfo);

        } catch (error) {
            logger.error('Get billing info error:', error);
            res.status(500).json({ error: 'Failed to retrieve billing information' });
        }
    }

    // Get available subscription plans
    static async getPlans(req, res) {
        try {
            const plans = [
                {
                    id: 'starter',
                    name: 'Starter',
                    price: 29,
                    currency: 'usd',
                    interval: 'month',
                    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
                    features: [
                        '5 team members',
                        'Basic communication tools',
                        '10 deployments/month',
                        'Basic web builder',
                        '1GB storage',
                        'Email support'
                    ],
                    limits: {
                        users: 5,
                        deployments: 10,
                        storage: 1024, // MB
                        apiCalls: 1000
                    }
                },
                {
                    id: 'professional',
                    name: 'Professional',
                    price: 99,
                    currency: 'usd',
                    interval: 'month',
                    stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
                    features: [
                        '25 team members',
                        'Advanced communication + video calls',
                        'Unlimited deployments',
                        'Advanced web/app builder',
                        '10GB storage',
                        'AI automation tools',
                        'Priority support'
                    ],
                    limits: {
                        users: 25,
                        deployments: -1, // unlimited
                        storage: 10240, // MB
                        apiCalls: 10000
                    },
                    popular: true
                },
                {
                    id: 'enterprise',
                    name: 'Enterprise',
                    price: 299,
                    currency: 'usd',
                    interval: 'month',
                    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
                    features: [
                        'Unlimited team members',
                        'Full communication suite',
                        'Unlimited everything',
                        'Custom integrations',
                        '100GB storage',
                        'Advanced AI automation',
                        'Custom branding',
                        'Dedicated support',
                        'SLA guarantee'
                    ],
                    limits: {
                        users: -1, // unlimited
                        deployments: -1,
                        storage: 102400, // MB
                        apiCalls: -1
                    }
                }
            ];

            res.json({ plans });

        } catch (error) {
            logger.error('Get plans error:', error);
            res.status(500).json({ error: 'Failed to retrieve plans' });
        }
    }

    // Create checkout session for subscription
    static async createCheckoutSession(req, res) {
        try {
            const { planId, successUrl, cancelUrl } = req.body;
            const user = req.user;

            // Don't allow super admin or free access users to create subscriptions
            if (isSuperAdmin(user) || hasFreeAccess(user)) {
                return res.status(400).json({
                    error: 'Billing not required for your account type'
                });
            }

            const planPriceIds = {
                'starter': process.env.STRIPE_STARTER_PRICE_ID,
                'professional': process.env.STRIPE_PROFESSIONAL_PRICE_ID,
                'enterprise': process.env.STRIPE_ENTERPRISE_PRICE_ID
            };

            const priceId = planPriceIds[planId];
            if (!priceId) {
                return res.status(400).json({ error: 'Invalid plan selected' });
            }

            // Create or get Stripe customer
            let customer = await BillingController.getOrCreateStripeCustomer(user);

            const session = await stripe.checkout.sessions.create({
                customer: customer.id,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                success_url: successUrl || `${process.env.PLATFORM_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl || `${process.env.PLATFORM_URL}/billing/cancel`,
                metadata: {
                    userId: user.id,
                    planId: planId
                },
                subscription_data: {
                    metadata: {
                        userId: user.id,
                        planId: planId
                    }
                }
            });

            res.json({
                sessionId: session.id,
                url: session.url
            });

        } catch (error) {
            logger.error('Create checkout session error:', error);
            res.status(500).json({ error: 'Failed to create checkout session' });
        }
    }

    // Get customer portal URL
    static async getCustomerPortal(req, res) {
        try {
            const user = req.user;

            if (isSuperAdmin(user) || hasFreeAccess(user)) {
                return res.status(400).json({
                    error: 'Billing portal not available for your account type'
                });
            }

            const customer = await BillingController.getOrCreateStripeCustomer(user);

            const session = await stripe.billingPortal.sessions.create({
                customer: customer.id,
                return_url: `${process.env.PLATFORM_URL}/billing`
            });

            res.json({ url: session.url });

        } catch (error) {
            logger.error('Get customer portal error:', error);
            res.status(500).json({ error: 'Failed to create billing portal session' });
        }
    }

    // Get invoices
    static async getInvoices(req, res) {
        try {
            const user = req.user;

            if (isSuperAdmin(user) || hasFreeAccess(user)) {
                return res.json({ invoices: [] });
            }

            const invoices = await Invoice.findByUserId(user.id);
            res.json({ invoices });

        } catch (error) {
            logger.error('Get invoices error:', error);
            res.status(500).json({ error: 'Failed to retrieve invoices' });
        }
    }

    // Cancel subscription
    static async cancelSubscription(req, res) {
        try {
            const user = req.user;

            if (isSuperAdmin(user) || hasFreeAccess(user)) {
                return res.status(400).json({
                    error: 'No subscription to cancel'
                });
            }

            const subscription = await Subscription.findActiveByUserId(user.id);
            if (!subscription) {
                return res.status(404).json({ error: 'No active subscription found' });
            }

            // Cancel at period end
            await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                cancel_at_period_end: true
            });

            await subscription.update({
                cancelAtPeriodEnd: true,
                cancelledAt: new Date()
            });

            res.json({ message: 'Subscription will be cancelled at the end of the billing period' });

        } catch (error) {
            logger.error('Cancel subscription error:', error);
            res.status(500).json({ error: 'Failed to cancel subscription' });
        }
    }

    // Admin: Get all billing data
    static async getAllBillingData(req, res) {
        try {
            const { page = 1, limit = 50 } = req.query;

            const billingData = await Subscription.getPaginated({
                page: parseInt(page),
                limit: parseInt(limit),
                include: ['user', 'invoices']
            });

            // Add revenue analytics
            const analytics = await BillingController.getBillingAnalytics();

            res.json({
                ...billingData,
                analytics
            });

        } catch (error) {
            logger.error('Get all billing data error:', error);
            res.status(500).json({ error: 'Failed to retrieve billing data' });
        }
    }

    // Helper: Get or create Stripe customer
    static async getOrCreateStripeCustomer(user) {
        if (user.stripeCustomerId) {
            try {
                return await stripe.customers.retrieve(user.stripeCustomerId);
            } catch (error) {
                logger.warn('Stripe customer not found, creating new one');
            }
        }

        const customer = await stripe.customers.create({
            email: user.email,
            name: user.fullName,
            metadata: {
                userId: user.id
            }
        });

        await User.updateById(user.id, {
            stripeCustomerId: customer.id
        });

        return customer;
    }

    // Helper: Get user billing info
    static async getUserBillingInfo(userId) {
        const subscription = await Subscription.findActiveByUserId(userId);
        const invoices = await Invoice.findByUserId(userId, { limit: 5 });

        return {
            subscription,
            recentInvoices: invoices,
            hasActiveSubscription: !!subscription,
            subscriptionTier: subscription?.planId || 'free'
        };
    }

    // Helper: Get billing analytics
    static async getBillingAnalytics() {
        const [
            totalRevenue,
            monthlyRevenue,
            subscriptionCounts,
            churnRate
        ] = await Promise.all([
            Invoice.getTotalRevenue(),
            Invoice.getMonthlyRevenue(),
            Subscription.getCountsByPlan(),
            Subscription.getChurnRate()
        ]);

        return {
            totalRevenue,
            monthlyRevenue,
            subscriptionCounts,
            churnRate
        };
    }
}

// Routes
router.get('/info', BillingController.getBillingInfo);
router.get('/plans', BillingController.getPlans);
router.post('/checkout', BillingController.createCheckoutSession);
router.get('/portal', BillingController.getCustomerPortal);
router.get('/invoices', BillingController.getInvoices);
router.post('/cancel', BillingController.cancelSubscription);

// Admin routes
router.get('/admin/all', requireAdmin, BillingController.getAllBillingData);

module.exports = router;