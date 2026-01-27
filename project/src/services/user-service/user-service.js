import { UserCommandHandler } from './handlers/user-command-handler.js';
import { UserQueryHandler } from './handlers/user-query-handler.js';
import CommandBus from '../../shared/cqrs/command-bus.js';
import QueryBus from '../../shared/cqrs/query-bus.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;

    // Initialize CQRS handlers
    this.commandHandler = new UserCommandHandler(dependencies);
    this.queryHandler = new UserQueryHandler(dependencies);

    // Initialize buses
    this.commandBus = new CommandBus();
    this.queryBus = new QueryBus();

    // Register handlers
    this.registerHandlers();

    this.logger.info('UserService initialized');
  }

  registerHandlers() {
    // Register command handlers
    this.commandBus.registerHandler('CreateUserCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateUserCommand', this.commandHandler);
    this.commandBus.registerHandler('ChangeUserPasswordCommand', this.commandHandler);
    this.commandBus.registerHandler('SuspendUserCommand', this.commandHandler);
    this.commandBus.registerHandler('ActivateUserCommand', this.commandHandler);
    this.commandBus.registerHandler('DeleteUserCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateUserPreferencesCommand', this.commandHandler);
    this.commandBus.registerHandler('VerifyUserEmailCommand', this.commandHandler);
    this.commandBus.registerHandler('ResetUserPasswordCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateUserProfileCommand', this.commandHandler);
    this.commandBus.registerHandler('AddUserRoleCommand', this.commandHandler);
    this.commandBus.registerHandler('RemoveUserRoleCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateUserSecuritySettingsCommand', this.commandHandler);
    this.commandBus.registerHandler('RecordUserLoginCommand', this.commandHandler);
    this.commandBus.registerHandler('RecordUserLogoutCommand', this.commandHandler);
    this.commandBus.registerHandler('UpdateUserLastActivityCommand', this.commandHandler);
    this.commandBus.registerHandler('BulkUpdateUsersCommand', this.commandHandler);
    this.commandBus.registerHandler('MigrateUserDataCommand', this.commandHandler);

    // Register query handlers
    this.queryBus.registerHandler('GetUserQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUsersQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserByEmailQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserProfileQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserAnalyticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserActivityQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserSecuritySettingsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserPreferencesQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUsersByRoleQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUsersByStatusQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserLoginHistoryQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserAuditTrailQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserReportQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserStatisticsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserDashboardDataQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserActivitySummaryQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserEngagementMetricsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserRetentionAnalysisQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserChurnAnalysisQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserLifecycleReportQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserSecurityReportQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserComplianceReportQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserPerformanceMetricsQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserMigrationStatusQuery', this.queryHandler);
    this.queryBus.registerHandler('GetUserBulkOperationStatusQuery', this.queryHandler);
  }

  // User Management Methods
  async createUser(userData) {
    try {
      const userId = uuidv4();
      const command = {
        userId,
        email: userData.email,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        dateOfBirth: userData.dateOfBirth,
        address: userData.address,
        preferences: userData.preferences || {},
        metadata: userData.metadata || {}
      };

      const result = await this.commandBus.execute(command);
      return result;
    } catch (error) {
      this.logger.error('Error creating user:', error);
      throw error;
    }
  }

  async authenticateUser(email, password) {
    try {
      // Get user by email
      const query = { email };
      const userResult = await this.queryBus.execute(query);

      if (!userResult || !userResult.user) {
        throw new Error('Invalid credentials');
      }

      const user = userResult.user;

      // Check if user is active
      if (user.status !== 'active') {
        throw new Error('Account is not active');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          roles: user.roles
        },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '24h' }
      );

      // Record login
      await this.recordLogin(user.id, {
        ipAddress: 'system', // Would be extracted from request
        userAgent: 'system',
        location: null,
        deviceInfo: null,
        sessionId: uuidv4()
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles
        },
        token,
        status: 'authenticated'
      };

    } catch (error) {
      this.logger.error('Error authenticating user:', error);
      throw error;
    }
  }

  async getUser(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user:', error);
      throw error;
    }
  }

  async updateUser(userId, updates, updatedBy) {
    try {
      const command = {
        userId,
        updates,
        updatedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error updating user:', error);
      throw error;
    }
  }

  async changePassword(userId, currentPassword, newPassword, changedBy) {
    try {
      const command = {
        userId,
        currentPassword,
        newPassword,
        changedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error changing password:', error);
      throw error;
    }
  }

  async suspendUser(userId, reason, suspensionEndDate, suspendedBy) {
    try {
      const command = {
        userId,
        reason,
        suspensionEndDate,
        suspendedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error suspending user:', error);
      throw error;
    }
  }

  async activateUser(userId, activatedBy) {
    try {
      const command = {
        userId,
        activatedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error activating user:', error);
      throw error;
    }
  }

  async deleteUser(userId, reason, deletedBy) {
    try {
      const command = {
        userId,
        reason,
        deletedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error deleting user:', error);
      throw error;
    }
  }

  async verifyEmail(userId, verificationToken, verifiedBy) {
    try {
      const command = {
        userId,
        verificationToken,
        verifiedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error verifying email:', error);
      throw error;
    }
  }

  async resetPassword(email, newPassword, resetToken, requestedBy) {
    try {
      const command = {
        email,
        newPassword,
        resetToken,
        requestedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error resetting password:', error);
      throw error;
    }
  }

  async updateProfile(userId, profileData, updatedBy) {
    try {
      const command = {
        userId,
        profileData,
        updatedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error updating profile:', error);
      throw error;
    }
  }

  async updatePreferences(userId, preferences, updatedBy) {
    try {
      const command = {
        userId,
        preferences,
        updatedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error updating preferences:', error);
      throw error;
    }
  }

  async addRole(userId, role, addedBy) {
    try {
      const command = {
        userId,
        role,
        addedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error adding role:', error);
      throw error;
    }
  }

  async removeRole(userId, role, removedBy) {
    try {
      const command = {
        userId,
        role,
        removedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error removing role:', error);
      throw error;
    }
  }

  async updateSecuritySettings(userId, securitySettings, updatedBy) {
    try {
      const command = {
        userId,
        securitySettings,
        updatedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error updating security settings:', error);
      throw error;
    }
  }

  async recordLogin(userId, loginData) {
    try {
      const command = {
        userId,
        ipAddress: loginData.ipAddress,
        userAgent: loginData.userAgent,
        location: loginData.location,
        deviceInfo: loginData.deviceInfo,
        sessionId: loginData.sessionId,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error recording login:', error);
      throw error;
    }
  }

  async recordLogout(userId, sessionId, logoutReason, sessionDuration) {
    try {
      const command = {
        userId,
        sessionId,
        logoutReason,
        sessionDuration,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error recording logout:', error);
      throw error;
    }
  }

  async updateLastActivity(userId, activity) {
    try {
      const command = {
        userId,
        activity,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error updating last activity:', error);
      throw error;
    }
  }

  // Query Methods
  async getUsers(filters = {}, pagination = {}) {
    try {
      const query = {
        page: pagination.page || 1,
        limit: pagination.limit || 10,
        sortBy: pagination.sortBy || 'createdAt',
        sortOrder: pagination.sortOrder || 'desc',
        filters
      };

      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting users:', error);
      throw error;
    }
  }

  async getUserByEmail(email) {
    try {
      const query = { email };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user by email:', error);
      throw error;
    }
  }

  async getUserProfile(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  async getUserAnalytics(userId, dateRange) {
    try {
      const query = { userId, dateRange };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user analytics:', error);
      throw error;
    }
  }

  async getUserActivity(userId, options = {}) {
    try {
      const query = {
        userId,
        limit: options.limit || 50,
        offset: options.offset || 0
      };

      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user activity:', error);
      throw error;
    }
  }

  async getUserSecuritySettings(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user security settings:', error);
      throw error;
    }
  }

  async getUserPreferences(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  async getUsersByRole(role, pagination = {}) {
    try {
      const query = {
        role,
        page: pagination.page || 1,
        limit: pagination.limit || 10
      };

      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting users by role:', error);
      throw error;
    }
  }

  async getUsersByStatus(status, pagination = {}) {
    try {
      const query = {
        status,
        page: pagination.page || 1,
        limit: pagination.limit || 10
      };

      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting users by status:', error);
      throw error;
    }
  }

  async getUserLoginHistory(userId, options = {}) {
    try {
      const query = {
        userId,
        limit: options.limit || 20,
        offset: options.offset || 0
      };

      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user login history:', error);
      throw error;
    }
  }

  async getUserAuditTrail(userId, options = {}) {
    try {
      const query = {
        userId,
        limit: options.limit || 50,
        offset: options.offset || 0,
        eventTypes: options.eventTypes
      };

      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user audit trail:', error);
      throw error;
    }
  }

  async getUserReport(reportType, filters = {}, dateRange) {
    try {
      const query = { reportType, filters, dateRange };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user report:', error);
      throw error;
    }
  }

  async getUserStatistics() {
    try {
      const query = {};
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user statistics:', error);
      throw error;
    }
  }

  async getUserDashboardData(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user dashboard data:', error);
      throw error;
    }
  }

  async getUserActivitySummary(userId, period = '30d') {
    try {
      const query = { userId, period };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user activity summary:', error);
      throw error;
    }
  }

  async getUserEngagementMetrics(userId, dateRange) {
    try {
      const query = { userId, dateRange };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user engagement metrics:', error);
      throw error;
    }
  }

  async getUserRetentionAnalysis(cohort, period = 'monthly') {
    try {
      const query = { cohort, period };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user retention analysis:', error);
      throw error;
    }
  }

  async getUserChurnAnalysis(dateRange) {
    try {
      const query = { dateRange };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user churn analysis:', error);
      throw error;
    }
  }

  async getUserLifecycleReport(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user lifecycle report:', error);
      throw error;
    }
  }

  async getUserSecurityReport(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user security report:', error);
      throw error;
    }
  }

  async getUserComplianceReport(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user compliance report:', error);
      throw error;
    }
  }

  async getUserPerformanceMetrics(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user performance metrics:', error);
      throw error;
    }
  }

  async getUserMigrationStatus(userId) {
    try {
      const query = { userId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user migration status:', error);
      throw error;
    }
  }

  async getUserBulkOperationStatus(operationId) {
    try {
      const query = { operationId };
      return await this.queryBus.execute(query);
    } catch (error) {
      this.logger.error('Error getting user bulk operation status:', error);
      throw error;
    }
  }

  // Bulk Operations
  async bulkUpdateUsers(userIds, updates, updatedBy, reason) {
    try {
      const command = {
        userIds,
        updates,
        updatedBy,
        reason,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error in bulk update users:', error);
      throw error;
    }
  }

  async migrateUserData(userId, migrationData, migratedBy) {
    try {
      const command = {
        userId,
        migrationData,
        migratedBy,
        metadata: {}
      };

      return await this.commandBus.execute(command);
    } catch (error) {
      this.logger.error('Error migrating user data:', error);
      throw error;
    }
  }

  // Utility Methods
  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
      return decoded;
    } catch (error) {
      this.logger.error('Error validating token:', error);
      throw new Error('Invalid token');
    }
  }

  async refreshToken(userId) {
    try {
      const userResult = await this.getUser(userId);
      if (!userResult || !userResult.user) {
        throw new Error('User not found');
      }

      const user = userResult.user;

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          roles: user.roles
        },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '24h' }
      );

      return { token, status: 'refreshed' };
    } catch (error) {
      this.logger.error('Error refreshing token:', error);
      throw error;
    }
  }

  async checkPermission(userId, permission) {
    try {
      const userResult = await this.getUser(userId);
      if (!userResult || !userResult.user) {
        return false;
      }

      const user = userResult.user;
      const roles = user.roles || [];

      // Simple role-based permission check
      const rolePermissions = {
        'admin': ['*'],
        'manager': ['read_users', 'update_users', 'create_reports'],
        'user': ['read_own_profile', 'update_own_profile']
      };

      for (const role of roles) {
        const permissions = rolePermissions[role] || [];
        if (permissions.includes('*') || permissions.includes(permission)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error checking permission:', error);
      return false;
    }
  }

  // Health Check
  async healthCheck() {
    try {
      // Check database connections
      const mysqlHealth = await this.connectionPool.healthCheck();
      const mongoHealth = await this.dualWriter.healthCheck();

      // Check event store
      const eventStoreHealth = await this.eventStore.healthCheck();

      // Check Kafka
      const kafkaHealth = await this.kafkaService.healthCheck();

      return {
        status: 'healthy',
        services: {
          mysql: mysqlHealth,
          mongodb: mongoHealth,
          eventStore: eventStoreHealth,
          kafka: kafkaHealth
        },
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Cleanup method
  async cleanup() {
    try {
      this.logger.info('Cleaning up UserService...');
      // Any cleanup logic here
      this.logger.info('UserService cleanup completed');
    } catch (error) {
      this.logger.error('Error during UserService cleanup:', error);
    }
  }
}