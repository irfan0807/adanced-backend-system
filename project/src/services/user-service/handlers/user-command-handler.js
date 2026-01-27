import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  UserCreatedEvent,
  UserUpdatedEvent,
  UserPasswordChangedEvent,
  UserSuspendedEvent,
  UserActivatedEvent,
  UserDeletedEvent,
  UserEmailVerifiedEvent,
  UserPasswordResetEvent,
  UserLoginEvent,
  UserLogoutEvent,
  UserProfileUpdatedEvent,
  UserPreferencesUpdatedEvent,
  UserRoleAddedEvent,
  UserRoleRemovedEvent,
  UserSecuritySettingsUpdatedEvent,
  UserLastActivityUpdatedEvent,
  UserBulkUpdatedEvent,
  UserDataMigratedEvent
} from '../events/user-events.js';

export class UserCommandHandler {
  constructor(dependencies) {
    this.connectionPool = dependencies.connectionPool;
    this.dualWriter = dependencies.dualWriter;
    this.eventStore = dependencies.eventStore;
    this.kafkaService = dependencies.kafkaService;
    this.logger = dependencies.logger;
  }

  async handle(command) {
    const commandType = command.constructor.name;

    switch (commandType) {
      case 'CreateUserCommand':
        return await this.handleCreateUser(command);
      case 'UpdateUserCommand':
        return await this.handleUpdateUser(command);
      case 'ChangeUserPasswordCommand':
        return await this.handleChangeUserPassword(command);
      case 'SuspendUserCommand':
        return await this.handleSuspendUser(command);
      case 'ActivateUserCommand':
        return await this.handleActivateUser(command);
      case 'DeleteUserCommand':
        return await this.handleDeleteUser(command);
      case 'UpdateUserPreferencesCommand':
        return await this.handleUpdateUserPreferences(command);
      case 'VerifyUserEmailCommand':
        return await this.handleVerifyUserEmail(command);
      case 'ResetUserPasswordCommand':
        return await this.handleResetUserPassword(command);
      case 'UpdateUserProfileCommand':
        return await this.handleUpdateUserProfile(command);
      case 'AddUserRoleCommand':
        return await this.handleAddUserRole(command);
      case 'RemoveUserRoleCommand':
        return await this.handleRemoveUserRole(command);
      case 'UpdateUserSecuritySettingsCommand':
        return await this.handleUpdateUserSecuritySettings(command);
      case 'RecordUserLoginCommand':
        return await this.handleRecordUserLogin(command);
      case 'RecordUserLogoutCommand':
        return await this.handleRecordUserLogout(command);
      case 'UpdateUserLastActivityCommand':
        return await this.handleUpdateUserLastActivity(command);
      case 'BulkUpdateUsersCommand':
        return await this.handleBulkUpdateUsers(command);
      case 'MigrateUserDataCommand':
        return await this.handleMigrateUserData(command);
      default:
        throw new Error(`Unknown command type: ${commandType}`);
    }
  }

  async handleCreateUser(command) {
    try {
      // Check if user already exists
      const existingUser = await this.getUserByEmail(command.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(command.password, 12);

      // Create user object
      const user = {
        id: command.userId,
        email: command.email,
        password: hashedPassword,
        firstName: command.firstName,
        lastName: command.lastName,
        phoneNumber: command.phoneNumber,
        dateOfBirth: command.dateOfBirth,
        address: command.address,
        preferences: command.preferences,
        roles: ['user'], // Default role
        status: 'active',
        emailVerified: false,
        securitySettings: {
          twoFactorEnabled: false,
          passwordLastChanged: new Date(),
          loginAttempts: 0,
          lockedUntil: null
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: null,
        lastActivity: new Date(),
        metadata: command.metadata
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(user);

      // Create and store event
      const event = new UserCreatedEvent({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        status: user.status,
        createdAt: user.createdAt,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: user.id,
        value: JSON.stringify(event)
      });

      this.logger.info(`User created: ${user.id}`);
      return { userId: user.id, status: 'created' };

    } catch (error) {
      this.logger.error('Error creating user:', error);
      throw error;
    }
  }

  async handleUpdateUser(command) {
    try {
      const existingUser = await this.getUserById(command.userId);
      if (!existingUser) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...existingUser,
        ...command.updates,
        updatedAt: new Date(),
        updatedBy: command.updatedBy
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserUpdatedEvent({
        userId: command.userId,
        updates: command.updates,
        updatedBy: command.updatedBy,
        previousState: existingUser,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User updated: ${command.userId}`);
      return { userId: command.userId, status: 'updated' };

    } catch (error) {
      this.logger.error('Error updating user:', error);
      throw error;
    }
  }

  async handleChangeUserPassword(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password if provided
      if (command.currentPassword) {
        const isValidPassword = await bcrypt.compare(command.currentPassword, user.password);
        if (!isValidPassword) {
          throw new Error('Current password is incorrect');
        }
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(command.newPassword, 12);

      const updatedUser = {
        ...user,
        password: hashedPassword,
        securitySettings: {
          ...user.securitySettings,
          passwordLastChanged: new Date()
        },
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserPasswordChangedEvent({
        userId: command.userId,
        changedBy: command.changedBy,
        changeReason: command.currentPassword ? 'user_change' : 'admin_reset',
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User password changed: ${command.userId}`);
      return { userId: command.userId, status: 'password_changed' };

    } catch (error) {
      this.logger.error('Error changing user password:', error);
      throw error;
    }
  }

  async handleSuspendUser(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        status: 'suspended',
        suspensionReason: command.reason,
        suspensionEndDate: command.suspensionEndDate,
        suspendedAt: new Date(),
        suspendedBy: command.suspendedBy,
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserSuspendedEvent({
        userId: command.userId,
        reason: command.reason,
        suspendedBy: command.suspendedBy,
        suspensionEndDate: command.suspensionEndDate,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User suspended: ${command.userId}`);
      return { userId: command.userId, status: 'suspended' };

    } catch (error) {
      this.logger.error('Error suspending user:', error);
      throw error;
    }
  }

  async handleActivateUser(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        status: 'active',
        suspensionReason: null,
        suspensionEndDate: null,
        suspendedAt: null,
        suspendedBy: null,
        activatedAt: new Date(),
        activatedBy: command.activatedBy,
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserActivatedEvent({
        userId: command.userId,
        activatedBy: command.activatedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User activated: ${command.userId}`);
      return { userId: command.userId, status: 'activated' };

    } catch (error) {
      this.logger.error('Error activating user:', error);
      throw error;
    }
  }

  async handleDeleteUser(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Soft delete - mark as deleted
      const updatedUser = {
        ...user,
        status: 'deleted',
        deletionReason: command.reason,
        deletedAt: new Date(),
        deletedBy: command.deletedBy,
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserDeletedEvent({
        userId: command.userId,
        reason: command.reason,
        deletedBy: command.deletedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User deleted: ${command.userId}`);
      return { userId: command.userId, status: 'deleted' };

    } catch (error) {
      this.logger.error('Error deleting user:', error);
      throw error;
    }
  }

  async handleUpdateUserPreferences(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        preferences: { ...user.preferences, ...command.preferences },
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserPreferencesUpdatedEvent({
        userId: command.userId,
        preferences: command.preferences,
        updatedBy: command.updatedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User preferences updated: ${command.userId}`);
      return { userId: command.userId, status: 'preferences_updated' };

    } catch (error) {
      this.logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  async handleVerifyUserEmail(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verificationToken: null,
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserEmailVerifiedEvent({
        userId: command.userId,
        verificationToken: command.verificationToken,
        verifiedBy: command.verifiedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User email verified: ${command.userId}`);
      return { userId: command.userId, status: 'email_verified' };

    } catch (error) {
      this.logger.error('Error verifying user email:', error);
      throw error;
    }
  }

  async handleResetUserPassword(command) {
    try {
      const user = await this.getUserByEmail(command.email);
      if (!user) {
        throw new Error('User not found');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(command.newPassword, 12);

      const updatedUser = {
        ...user,
        password: hashedPassword,
        securitySettings: {
          ...user.securitySettings,
          passwordLastChanged: new Date(),
          resetToken: null,
          resetTokenExpires: null
        },
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserPasswordResetEvent({
        userId: user.id,
        resetToken: command.resetToken,
        requestedBy: command.requestedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: user.id,
        value: JSON.stringify(event)
      });

      this.logger.info(`User password reset: ${user.id}`);
      return { userId: user.id, status: 'password_reset' };

    } catch (error) {
      this.logger.error('Error resetting user password:', error);
      throw error;
    }
  }

  async handleUpdateUserProfile(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        ...command.profileData,
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserProfileUpdatedEvent({
        userId: command.userId,
        profileData: command.profileData,
        updatedBy: command.updatedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User profile updated: ${command.userId}`);
      return { userId: command.userId, status: 'profile_updated' };

    } catch (error) {
      this.logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  async handleAddUserRole(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const roles = user.roles || [];
      if (roles.includes(command.role)) {
        throw new Error('User already has this role');
      }

      const updatedUser = {
        ...user,
        roles: [...roles, command.role],
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserRoleAddedEvent({
        userId: command.userId,
        role: command.role,
        addedBy: command.addedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User role added: ${command.userId} - ${command.role}`);
      return { userId: command.userId, role: command.role, status: 'role_added' };

    } catch (error) {
      this.logger.error('Error adding user role:', error);
      throw error;
    }
  }

  async handleRemoveUserRole(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const roles = user.roles || [];
      const updatedRoles = roles.filter(role => role !== command.role);

      if (roles.length === updatedRoles.length) {
        throw new Error('User does not have this role');
      }

      const updatedUser = {
        ...user,
        roles: updatedRoles,
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserRoleRemovedEvent({
        userId: command.userId,
        role: command.role,
        removedBy: command.removedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User role removed: ${command.userId} - ${command.role}`);
      return { userId: command.userId, role: command.role, status: 'role_removed' };

    } catch (error) {
      this.logger.error('Error removing user role:', error);
      throw error;
    }
  }

  async handleUpdateUserSecuritySettings(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        securitySettings: { ...user.securitySettings, ...command.securitySettings },
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserSecuritySettingsUpdatedEvent({
        userId: command.userId,
        securitySettings: command.securitySettings,
        updatedBy: command.updatedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User security settings updated: ${command.userId}`);
      return { userId: command.userId, status: 'security_settings_updated' };

    } catch (error) {
      this.logger.error('Error updating user security settings:', error);
      throw error;
    }
  }

  async handleRecordUserLogin(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        lastLogin: new Date(),
        lastActivity: new Date(),
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserLoginEvent({
        userId: command.userId,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        location: command.location,
        deviceInfo: command.deviceInfo,
        sessionId: command.sessionId,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User login recorded: ${command.userId}`);
      return { userId: command.userId, status: 'login_recorded' };

    } catch (error) {
      this.logger.error('Error recording user login:', error);
      throw error;
    }
  }

  async handleRecordUserLogout(command) {
    try {
      // Create and store event
      const event = new UserLogoutEvent({
        userId: command.userId,
        sessionId: command.sessionId,
        logoutReason: command.logoutReason,
        sessionDuration: command.sessionDuration,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User logout recorded: ${command.userId}`);
      return { userId: command.userId, status: 'logout_recorded' };

    } catch (error) {
      this.logger.error('Error recording user logout:', error);
      throw error;
    }
  }

  async handleUpdateUserLastActivity(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        lastActivity: new Date(),
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserLastActivityUpdatedEvent({
        userId: command.userId,
        activity: command.activity,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      return { userId: command.userId, status: 'activity_updated' };

    } catch (error) {
      this.logger.error('Error updating user last activity:', error);
      throw error;
    }
  }

  async handleBulkUpdateUsers(command) {
    try {
      const results = [];

      for (const userId of command.userIds) {
        try {
          const user = await this.getUserById(userId);
          if (user) {
            const updatedUser = {
              ...user,
              ...command.updates,
              updatedAt: new Date(),
              updatedBy: command.updatedBy
            };

            await this.dualWriter.writeToAllDatabases(updatedUser);
            results.push({ userId, status: 'updated' });
          } else {
            results.push({ userId, status: 'not_found' });
          }
        } catch (error) {
          results.push({ userId, status: 'error', error: error.message });
        }
      }

      // Create and store event
      const event = new UserBulkUpdatedEvent({
        userIds: command.userIds,
        updates: command.updates,
        updatedBy: command.updatedBy,
        reason: command.reason,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: uuidv4(),
        value: JSON.stringify(event)
      });

      this.logger.info(`Bulk user update completed: ${command.userIds.length} users`);
      return { results, status: 'bulk_update_completed' };

    } catch (error) {
      this.logger.error('Error in bulk user update:', error);
      throw error;
    }
  }

  async handleMigrateUserData(command) {
    try {
      const user = await this.getUserById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedUser = {
        ...user,
        ...command.migrationData,
        migratedAt: new Date(),
        migratedBy: command.migratedBy,
        updatedAt: new Date()
      };

      // Write to databases
      await this.dualWriter.writeToAllDatabases(updatedUser);

      // Create and store event
      const event = new UserDataMigratedEvent({
        userId: command.userId,
        migrationData: command.migrationData,
        migratedBy: command.migratedBy,
        metadata: command.metadata
      });

      await this.eventStore.saveEvent(event);
      await this.kafkaService.produce('user-events', {
        key: command.userId,
        value: JSON.stringify(event)
      });

      this.logger.info(`User data migrated: ${command.userId}`);
      return { userId: command.userId, status: 'data_migrated' };

    } catch (error) {
      this.logger.error('Error migrating user data:', error);
      throw error;
    }
  }

  // Helper methods
  async getUserById(userId) {
    try {
      const db = this.connectionPool.getMongoDatabase();
      return await db.collection('users').findOne({ id: userId });
    } catch (error) {
      return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
        return rows[0] || null;
      });
    }
  }

  async getUserByEmail(email) {
    try {
      const db = this.connectionPool.getMongoDatabase();
      return await db.collection('users').findOne({ email });
    } catch (error) {
      return await this.connectionPool.executeWithMySQLConnection(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
      });
    }
  }
}