export class UserCreatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_CREATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.email = data.email;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.phoneNumber = data.phoneNumber;
    this.status = data.status || 'active';
    this.createdAt = data.createdAt || new Date();
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserUpdatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_UPDATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.updates = data.updates;
    this.updatedBy = data.updatedBy;
    this.previousState = data.previousState;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserPasswordChangedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_PASSWORD_CHANGED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.changedBy = data.changedBy;
    this.changeReason = data.changeReason;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserSuspendedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_SUSPENDED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.reason = data.reason;
    this.suspendedBy = data.suspendedBy;
    this.suspensionEndDate = data.suspensionEndDate;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserActivatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_ACTIVATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.activatedBy = data.activatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserDeletedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_DELETED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.reason = data.reason;
    this.deletedBy = data.deletedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserEmailVerifiedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_EMAIL_VERIFIED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.verificationToken = data.verificationToken;
    this.verifiedBy = data.verifiedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserPasswordResetEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_PASSWORD_RESET';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.resetToken = data.resetToken;
    this.requestedBy = data.requestedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserLoginEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_LOGIN';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.location = data.location;
    this.deviceInfo = data.deviceInfo;
    this.sessionId = data.sessionId;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserLogoutEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_LOGOUT';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.logoutReason = data.logoutReason;
    this.sessionDuration = data.sessionDuration;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserProfileUpdatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_PROFILE_UPDATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.profileData = data.profileData;
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserPreferencesUpdatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_PREFERENCES_UPDATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.preferences = data.preferences;
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserRoleAddedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_ROLE_ADDED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.role = data.role;
    this.addedBy = data.addedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserRoleRemovedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_ROLE_REMOVED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.role = data.role;
    this.removedBy = data.removedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserSecuritySettingsUpdatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_SECURITY_SETTINGS_UPDATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.securitySettings = data.securitySettings;
    this.updatedBy = data.updatedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserLastActivityUpdatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_LAST_ACTIVITY_UPDATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.activity = data.activity;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserBulkUpdatedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_BULK_UPDATED';
    this.aggregateId = data.batchId || require('uuid').v4();
    this.userIds = data.userIds;
    this.updates = data.updates;
    this.updatedBy = data.updatedBy;
    this.reason = data.reason;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class UserDataMigratedEvent {
  constructor(data) {
    this.eventId = require('uuid').v4();
    this.eventType = 'USER_DATA_MIGRATED';
    this.aggregateId = data.userId;
    this.userId = data.userId;
    this.migrationData = data.migrationData;
    this.migratedBy = data.migratedBy;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}