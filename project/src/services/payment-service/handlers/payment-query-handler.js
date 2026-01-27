import {
  GetPaymentQuery,
  GetPaymentsQuery,
  GetPaymentStatisticsQuery,
  GetPaymentMethodsQuery,
  GetSubscriptionsQuery,
  GetRefundsQuery,
  GetDisputesQuery,
  GetFraudAlertsQuery
} from '../queries/payment-queries.js';

export class PaymentQueryHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.logger = dependencies.logger;
  }

  async handle(query) {
    if (query instanceof GetPaymentQuery) {
      return await this.handleGetPayment(query);
    } else if (query instanceof GetPaymentsQuery) {
      return await this.handleGetPayments(query);
    } else if (query instanceof GetPaymentStatisticsQuery) {
      return await this.handleGetPaymentStatistics(query);
    } else if (query instanceof GetPaymentMethodsQuery) {
      return await this.handleGetPaymentMethods(query);
    } else if (query instanceof GetSubscriptionsQuery) {
      return await this.handleGetSubscriptions(query);
    } else if (query instanceof GetRefundsQuery) {
      return await this.handleGetRefunds(query);
    } else if (query instanceof GetDisputesQuery) {
      return await this.handleGetDisputes(query);
    } else if (query instanceof GetFraudAlertsQuery) {
      return await this.handleGetFraudAlerts(query);
    } else {
      throw new Error(`Unknown query type: ${query.constructor.name}`);
    }
  }

  async handleGetPayment(query) {
    try {
      query.validate();

      // Try MySQL first
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT * FROM payments WHERE id = ?',
          [query.paymentId]
        );
        return rows[0];
      });

      if (mysqlResult) {
        return this.formatPayment(mysqlResult);
      }

      // Fallback to MongoDB
      const mongoDB = this.connectionPool.getMongoDatabase();
      const mongoResult = await mongoDB.collection('payments').findOne({
        id: query.paymentId
      });

      return mongoResult ? this.formatPayment(mongoResult) : null;

    } catch (error) {
      this.logger.error('Error getting payment', {
        paymentId: query.paymentId,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetPayments(query) {
    try {
      query.validate();

      const { page, limit, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      // Build WHERE clause
      let whereConditions = [];
      let params = [];

      if (query.customerId) {
        whereConditions.push('customer_id = ?');
        params.push(query.customerId);
      }
      if (query.status) {
        whereConditions.push('status = ?');
        params.push(query.status);
      }
      if (query.paymentMethod) {
        whereConditions.push('payment_method = ?');
        params.push(query.paymentMethod);
      }
      if (query.currency) {
        whereConditions.push('currency = ?');
        params.push(query.currency);
      }
      if (query.minAmount) {
        whereConditions.push('amount >= ?');
        params.push(query.minAmount);
      }
      if (query.maxAmount) {
        whereConditions.push('amount <= ?');
        params.push(query.maxAmount);
      }
      if (query.startDate) {
        whereConditions.push('created_at >= ?');
        params.push(query.startDate);
      }
      if (query.endDate) {
        whereConditions.push('created_at <= ?');
        params.push(query.endDate);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const orderClause = `ORDER BY ${this.mapSortField(sortBy)} ${sortOrder.toUpperCase()}`;

      // Try MySQL first
      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM payments ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM payments ${whereClause}`,
          params
        );

        return {
          payments: rows,
          total: countRows[0].total
        };
      });

      if (mysqlResult.payments.length > 0) {
        return {
          payments: mysqlResult.payments.map(this.formatPayment),
          pagination: {
            page,
            limit,
            total: mysqlResult.total,
            totalPages: Math.ceil(mysqlResult.total / limit)
          }
        };
      }

      // Fallback to MongoDB
      const mongoDB = this.connectionPool.getMongoDatabase();
      const mongoQuery = this.buildMongoQuery(query);

      const total = await mongoDB.collection('payments').countDocuments(mongoQuery);
      const payments = await mongoDB.collection('payments')
        .find(mongoQuery)
        .sort({ [this.mapSortField(sortBy)]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit)
        .skip(offset)
        .toArray();

      return {
        payments: payments.map(this.formatPayment),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting payments', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetPaymentStatistics(query) {
    try {
      query.validate();

      const { groupBy, startDate, endDate, customerId, currency } = query;

      let sql, params = [];

      if (groupBy === 'payment_method') {
        sql = `
          SELECT payment_method, COUNT(*) as count, SUM(amount) as total_amount, AVG(amount) as avg_amount, status
          FROM payments
          WHERE 1=1
        `;
      } else if (groupBy === 'currency') {
        sql = `
          SELECT currency, COUNT(*) as count, SUM(amount) as total_amount, AVG(amount) as avg_amount, status
          FROM payments
          WHERE 1=1
        `;
      } else if (groupBy === 'status') {
        sql = `
          SELECT status, COUNT(*) as count, SUM(amount) as total_amount, AVG(amount) as avg_amount
          FROM payments
          WHERE 1=1
        `;
      } else {
        // Time-based grouping
        const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%Y-%u' : '%Y-%m';
        sql = `
          SELECT DATE_FORMAT(created_at, '${dateFormat}') as period, COUNT(*) as count, SUM(amount) as total_amount, AVG(amount) as avg_amount, status
          FROM payments
          WHERE 1=1
        `;
      }

      if (customerId) {
        sql += ' AND customer_id = ?';
        params.push(customerId);
      }
      if (currency) {
        sql += ' AND currency = ?';
        params.push(currency);
      }
      if (startDate) {
        sql += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND created_at <= ?';
        params.push(endDate);
      }

      if (groupBy === 'payment_method' || groupBy === 'currency') {
        sql += ' GROUP BY ' + groupBy.replace('_', '') + ', status';
      } else if (groupBy === 'status') {
        sql += ' GROUP BY status';
      } else {
        sql += ' GROUP BY period, status ORDER BY period';
      }

      const result = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      });

      // Aggregate results
      const stats = {
        totalPayments: 0,
        totalAmount: 0,
        averageAmount: 0,
        byStatus: {},
        byGroup: {}
      };

      result.forEach(row => {
        stats.totalPayments += row.count;
        stats.totalAmount += parseFloat(row.total_amount || 0);

        if (!stats.byStatus[row.status]) {
          stats.byStatus[row.status] = { count: 0, amount: 0 };
        }
        stats.byStatus[row.status].count += row.count;
        stats.byStatus[row.status].amount += parseFloat(row.total_amount || 0);

        const groupKey = row[groupBy] || row.period || row.status;
        if (!stats.byGroup[groupKey]) {
          stats.byGroup[groupKey] = { count: 0, amount: 0 };
        }
        stats.byGroup[groupKey].count += row.count;
        stats.byGroup[groupKey].amount += parseFloat(row.total_amount || 0);
      });

      stats.averageAmount = stats.totalPayments > 0 ? stats.totalAmount / stats.totalPayments : 0;

      return stats;

    } catch (error) {
      this.logger.error('Error getting payment statistics', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetPaymentMethods(query) {
    try {
      query.validate();

      const { customerId, type, active, page, limit } = query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (customerId) {
        whereConditions.push('customer_id = ?');
        params.push(customerId);
      }
      if (type) {
        whereConditions.push('type = ?');
        params.push(type);
      }
      if (active !== undefined) {
        whereConditions.push('active = ?');
        params.push(active ? 1 : 0);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM payment_methods ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM payment_methods ${whereClause}`,
          params
        );

        return {
          methods: rows,
          total: countRows[0].total
        };
      });

      return {
        paymentMethods: mysqlResult.methods.map(this.formatPaymentMethod),
        pagination: {
          page,
          limit,
          total: mysqlResult.total,
          totalPages: Math.ceil(mysqlResult.total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting payment methods', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetSubscriptions(query) {
    try {
      query.validate();

      const { customerId, status, paymentMethodId, page, limit, sortBy, sortOrder } = query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (customerId) {
        whereConditions.push('customer_id = ?');
        params.push(customerId);
      }
      if (status) {
        whereConditions.push('status = ?');
        params.push(status);
      }
      if (paymentMethodId) {
        whereConditions.push('payment_method_id = ?');
        params.push(paymentMethodId);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const orderClause = `ORDER BY ${this.mapSubscriptionSortField(sortBy)} ${sortOrder.toUpperCase()}`;

      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM subscriptions ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM subscriptions ${whereClause}`,
          params
        );

        return {
          subscriptions: rows,
          total: countRows[0].total
        };
      });

      return {
        subscriptions: mysqlResult.subscriptions.map(this.formatSubscription),
        pagination: {
          page,
          limit,
          total: mysqlResult.total,
          totalPages: Math.ceil(mysqlResult.total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting subscriptions', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetRefunds(query) {
    try {
      query.validate();

      const { paymentId, status, startDate, endDate, page, limit } = query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (paymentId) {
        whereConditions.push('payment_id = ?');
        params.push(paymentId);
      }
      if (status) {
        whereConditions.push('status = ?');
        params.push(status);
      }
      if (startDate) {
        whereConditions.push('created_at >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereConditions.push('created_at <= ?');
        params.push(endDate);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM refunds ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM refunds ${whereClause}`,
          params
        );

        return {
          refunds: rows,
          total: countRows[0].total
        };
      });

      return {
        refunds: mysqlResult.refunds.map(this.formatRefund),
        pagination: {
          page,
          limit,
          total: mysqlResult.total,
          totalPages: Math.ceil(mysqlResult.total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting refunds', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetDisputes(query) {
    try {
      query.validate();

      const { paymentId, status, startDate, endDate, page, limit } = query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (paymentId) {
        whereConditions.push('payment_id = ?');
        params.push(paymentId);
      }
      if (status) {
        whereConditions.push('status = ?');
        params.push(status);
      }
      if (startDate) {
        whereConditions.push('created_at >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereConditions.push('created_at <= ?');
        params.push(endDate);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM disputes ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM disputes ${whereClause}`,
          params
        );

        return {
          disputes: rows,
          total: countRows[0].total
        };
      });

      return {
        disputes: mysqlResult.disputes.map(this.formatDispute),
        pagination: {
          page,
          limit,
          total: mysqlResult.total,
          totalPages: Math.ceil(mysqlResult.total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting disputes', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  async handleGetFraudAlerts(query) {
    try {
      query.validate();

      const { customerId, minRiskScore, maxRiskScore, startDate, endDate, page, limit } = query;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];

      if (customerId) {
        whereConditions.push('customer_id = ?');
        params.push(customerId);
      }
      if (startDate) {
        whereConditions.push('created_at >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereConditions.push('created_at <= ?');
        params.push(endDate);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const mysqlResult = await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT * FROM fraud_alerts ${whereClause} AND risk_score BETWEEN ? AND ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, minRiskScore, maxRiskScore, limit, offset]
        );

        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as total FROM fraud_alerts ${whereClause} AND risk_score BETWEEN ? AND ?`,
          [...params, minRiskScore, maxRiskScore]
        );

        return {
          alerts: rows,
          total: countRows[0].total
        };
      });

      return {
        fraudAlerts: mysqlResult.alerts.map(this.formatFraudAlert),
        pagination: {
          page,
          limit,
          total: mysqlResult.total,
          totalPages: Math.ceil(mysqlResult.total / limit)
        }
      };

    } catch (error) {
      this.logger.error('Error getting fraud alerts', {
        query: query,
        error: error.message
      });
      throw error;
    }
  }

  // Helper methods
  formatPayment(payment) {
    return {
      id: payment.id,
      customerId: payment.customer_id || payment.customerId,
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      paymentMethod: payment.payment_method || payment.paymentMethod,
      paymentMethodId: payment.payment_method_id || payment.paymentMethodId,
      description: payment.description,
      status: payment.status,
      capture: payment.capture,
      gatewayTransactionId: payment.gateway_transaction_id || payment.gatewayTransactionId,
      failureReason: payment.failure_reason || payment.failureReason,
      createdAt: payment.created_at || payment.createdAt,
      updatedAt: payment.updated_at || payment.updatedAt,
      metadata: typeof payment.metadata === 'string' ?
        JSON.parse(payment.metadata) : payment.metadata
    };
  }

  formatPaymentMethod(method) {
    return {
      id: method.id,
      customerId: method.customer_id || method.customerId,
      type: method.type,
      last4: method.last4,
      brand: method.brand,
      expiryMonth: method.expiry_month || method.expiryMonth,
      expiryYear: method.expiry_year || method.expiryYear,
      isDefault: method.is_default || method.isDefault,
      active: method.active,
      createdAt: method.created_at || method.createdAt,
      updatedAt: method.updated_at || method.updatedAt
    };
  }

  formatSubscription(subscription) {
    return {
      id: subscription.id,
      customerId: subscription.customer_id || subscription.customerId,
      paymentMethodId: subscription.payment_method_id || subscription.paymentMethodId,
      amount: parseFloat(subscription.amount),
      currency: subscription.currency,
      interval: subscription.interval,
      intervalCount: subscription.interval_count || subscription.intervalCount,
      description: subscription.description,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start || subscription.currentPeriodStart,
      currentPeriodEnd: subscription.current_period_end || subscription.currentPeriodEnd,
      createdAt: subscription.created_at || subscription.createdAt,
      updatedAt: subscription.updated_at || subscription.updatedAt
    };
  }

  formatRefund(refund) {
    return {
      id: refund.id,
      paymentId: refund.payment_id || refund.paymentId,
      amount: parseFloat(refund.amount),
      reason: refund.reason,
      status: refund.status,
      processedAt: refund.processed_at || refund.processedAt,
      createdAt: refund.created_at || refund.createdAt,
      updatedAt: refund.updated_at || refund.updatedAt
    };
  }

  formatDispute(dispute) {
    return {
      id: dispute.id,
      paymentId: dispute.payment_id || dispute.paymentId,
      disputeId: dispute.dispute_id || dispute.disputeId,
      reason: dispute.reason,
      amount: parseFloat(dispute.amount),
      status: dispute.status,
      createdAt: dispute.created_at || dispute.createdAt,
      updatedAt: dispute.updated_at || dispute.updatedAt
    };
  }

  formatFraudAlert(alert) {
    return {
      id: alert.id,
      paymentId: alert.payment_id || alert.paymentId,
      customerId: alert.customer_id || alert.customerId,
      riskScore: alert.risk_score || alert.riskScore,
      riskFactors: typeof alert.risk_factors === 'string' ?
        JSON.parse(alert.risk_factors) : alert.riskFactors,
      createdAt: alert.created_at || alert.createdAt
    };
  }

  buildMongoQuery(query) {
    const mongoQuery = {};

    if (query.customerId) mongoQuery.customerId = query.customerId;
    if (query.status) mongoQuery.status = query.status;
    if (query.paymentMethod) mongoQuery.paymentMethod = query.paymentMethod;
    if (query.currency) mongoQuery.currency = query.currency;
    if (query.minAmount || query.maxAmount) {
      mongoQuery.amount = {};
      if (query.minAmount) mongoQuery.amount.$gte = query.minAmount;
      if (query.maxAmount) mongoQuery.amount.$lte = query.maxAmount;
    }
    if (query.startDate || query.endDate) {
      mongoQuery.createdAt = {};
      if (query.startDate) mongoQuery.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) mongoQuery.createdAt.$lte = new Date(query.endDate);
    }

    return mongoQuery;
  }

  mapSortField(field) {
    const fieldMap = {
      createdAt: 'created_at',
      amount: 'amount',
      status: 'status',
      updatedAt: 'updated_at'
    };
    return fieldMap[field] || field;
  }

  mapSubscriptionSortField(field) {
    const fieldMap = {
      createdAt: 'created_at',
      nextBillingDate: 'current_period_end',
      amount: 'amount'
    };
    return fieldMap[field] || field;
  }
}