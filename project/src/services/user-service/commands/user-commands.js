export class CreateUserCommand {
  constructor(data) {
    this.userId = data.userId || require('uuid').v4();
    this.email = data.email;
    this.password = data.password;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.phoneNumber = data.phoneNumber;
    this.dateOfBirth = data.dateOfBirth;
    this.address = data.address;
    this.preferences = data.preferences || {};
    this.metadata = data.metadata || {};
    this.createdBy = data.createdBy || 'system';
    this.timestamp = new Date();
  }
}

export class UpdateUserCommand {
  constructor(data) {
    this.userId = data.userId;
    this.updates = data.updates;
    this.updatedBy = data.updatedBy || 'system';
    this.timestamp = new Date();
  }
}

export class ChangeUserPasswordCommand {
  constructor(data) {
    this.userId = data.userId;
    this.currentPassword = data.currentPassword;
    this.newPassword = data.newPassword;
    this.changedBy = data.changedBy || 'user';
    this.timestamp = new Date();
  }
}

export class SuspendUserCommand {
  constructor(data) {
    this.userId = data.userId;
    this.reason = data.reason;
    this.suspendedBy = data.suspendedBy;
    this.suspensionEndDate = data.suspensionEndDate;
    this.timestamp = new Date();
  }
}

export class ActivateUserCommand {
  constructor(data) {
    this.userId = data.userId;
    this.activatedBy = data.activatedBy;
    this.timestamp = new Date();
  }
}

export class DeleteUserCommand {
  constructor(data) {
    this.userId = data.userId;
    this.reason = data.reason;
    this.deletedBy = data.deletedBy;
    this.timestamp = new Date();
  }
}

export class UpdateUserPreferencesCommand {
  constructor(data) {
    this.userId = data.userId;
    this.preferences = data.preferences;
    this.updatedBy = data.updatedBy || 'user';
    this.timestamp = new Date();
  }
}

export class VerifyUserEmailCommand {
  constructor(data) {
    this.userId = data.userId;
    this.verificationToken = data.verificationToken;
    this.verifiedBy = data.verifiedBy || 'system';
    this.timestamp = new Date();
  }
}

export class ResetUserPasswordCommand {
  constructor(data) {
    this.email = data.email;
    this.resetToken = data.resetToken;
    this.newPassword = data.newPassword;
    this.requestedBy = data.requestedBy || 'user';
    this.timestamp = new Date();
  }
}

export class UpdateUserProfileCommand {
  constructor(data) {
    this.userId = data.userId;
    this.profileData = data.profileData;
    this.updatedBy = data.updatedBy || 'user';
    this.timestamp = new Date();
  }
}

export class AddUserRoleCommand {
  constructor(data) {
    this.userId = data.userId;
    this.role = data.role;
    this.addedBy = data.addedBy;
    this.timestamp = new Date();
  }
}

export class RemoveUserRoleCommand {
  constructor(data) {
    this.userId = data.userId;
    this.role = data.role;
    this.removedBy = data.removedBy;
    this.timestamp = new Date();
  }
}

export class UpdateUserSecuritySettingsCommand {
  constructor(data) {
    this.userId = data.userId;
    this.securitySettings = data.securitySettings;
    this.updatedBy = data.updatedBy || 'user';
    this.timestamp = new Date();
  }
}

export class RecordUserLoginCommand {
  constructor(data) {
    this.userId = data.userId;
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.location = data.location;
    this.deviceInfo = data.deviceInfo;
    this.timestamp = new Date();
  }
}

export class RecordUserLogoutCommand {
  constructor(data) {
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.logoutReason = data.logoutReason;
    this.timestamp = new Date();
  }
}

export class UpdateUserLastActivityCommand {
  constructor(data) {
    this.userId = data.userId;
    this.activity = data.activity;
    this.metadata = data.metadata || {};
    this.timestamp = new Date();
  }
}

export class BulkUpdateUsersCommand {
  constructor(data) {
    this.userIds = data.userIds;
    this.updates = data.updates;
    this.updatedBy = data.updatedBy;
    this.reason = data.reason;
    this.timestamp = new Date();
  }
}

export class MigrateUserDataCommand {
  constructor(data) {
    this.userId = data.userId;
    this.migrationData = data.migrationData;
    this.migratedBy = data.migratedBy;
    this.timestamp = new Date();
  }
}