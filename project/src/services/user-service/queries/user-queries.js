export class GetUserQuery {
  constructor(data) {
    this.userId = data.userId;
    this.includeSensitive = data.includeSensitive || false;
    this.fields = data.fields || null;
    this.timestamp = new Date();
  }
}

export class GetUsersQuery {
  constructor(data) {
    this.filters = data.filters || {};
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.sort = data.sort || { field: 'createdAt', order: 'desc' };
    this.includeSensitive = data.includeSensitive || false;
    this.fields = data.fields || null;
    this.timestamp = new Date();
  }
}

export class GetUserByEmailQuery {
  constructor(data) {
    this.email = data.email;
    this.includeSensitive = data.includeSensitive || false;
    this.timestamp = new Date();
  }
}

export class GetUserProfileQuery {
  constructor(data) {
    this.userId = data.userId;
    this.includePrivate = data.includePrivate || false;
    this.timestamp = new Date();
  }
}

export class GetUserActivityQuery {
  constructor(data) {
    this.userId = data.userId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.activityType = data.activityType;
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.timestamp = new Date();
  }
}

export class GetUserLoginHistoryQuery {
  constructor(data) {
    this.userId = data.userId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.ipAddress = data.ipAddress;
    this.deviceType = data.deviceType;
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.timestamp = new Date();
  }
}

export class GetUserSessionsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.activeOnly = data.activeOnly || false;
    this.includeExpired = data.includeExpired || false;
    this.timestamp = new Date();
  }
}

export class GetUserRolesQuery {
  constructor(data) {
    this.userId = data.userId;
    this.includePermissions = data.includePermissions || false;
    this.timestamp = new Date();
  }
}

export class GetUsersByRoleQuery {
  constructor(data) {
    this.role = data.role;
    this.status = data.status || 'active';
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.timestamp = new Date();
  }
}

export class GetUserStatisticsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.timeRange = data.timeRange || '30d';
    this.metrics = data.metrics || ['loginCount', 'activityCount', 'sessionDuration'];
    this.timestamp = new Date();
  }
}

export class GetUserAnalyticsQuery {
  constructor(data) {
    this.analyticsType = data.analyticsType; // 'registration', 'activity', 'engagement', 'security'
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.groupBy = data.groupBy || 'day';
    this.filters = data.filters || {};
    this.timestamp = new Date();
  }
}

export class GetUserSecurityEventsQuery {
  constructor(data) {
    this.userId = data.userId;
    this.eventType = data.eventType;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.severity = data.severity;
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.timestamp = new Date();
  }
}

export class GetUserPreferencesQuery {
  constructor(data) {
    this.userId = data.userId;
    this.category = data.category;
    this.timestamp = new Date();
  }
}

export class GetUserDashboardQuery {
  constructor(data) {
    this.userId = data.userId;
    this.timeRange = data.timeRange || '7d';
    this.includeStats = data.includeStats || true;
    this.includeActivity = data.includeActivity || true;
    this.includeSecurity = data.includeSecurity || false;
    this.timestamp = new Date();
  }
}

export class GetUsersReportQuery {
  constructor(data) {
    this.reportType = data.reportType; // 'active_users', 'new_registrations', 'user_activity', 'security_report'
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.filters = data.filters || {};
    this.format = data.format || 'json';
    this.groupBy = data.groupBy;
    this.timestamp = new Date();
  }
}

export class GetUserAuditTrailQuery {
  constructor(data) {
    this.userId = data.userId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.actionType = data.actionType;
    this.performedBy = data.performedBy;
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.timestamp = new Date();
  }
}

export class GetUserVerificationStatusQuery {
  constructor(data) {
    this.userId = data.userId;
    this.includeTokenDetails = data.includeTokenDetails || false;
    this.timestamp = new Date();
  }
}

export class GetUserMigrationHistoryQuery {
  constructor(data) {
    this.userId = data.userId;
    this.migrationType = data.migrationType;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.timestamp = new Date();
  }
}

export class GetUsersBulkQuery {
  constructor(data) {
    this.userIds = data.userIds;
    this.includeSensitive = data.includeSensitive || false;
    this.fields = data.fields || null;
    this.timestamp = new Date();
  }
}

export class SearchUsersQuery {
  constructor(data) {
    this.searchTerm = data.searchTerm;
    this.searchFields = data.searchFields || ['email', 'firstName', 'lastName', 'phoneNumber'];
    this.filters = data.filters || {};
    this.pagination = data.pagination || { page: 1, limit: 50 };
    this.sort = data.sort || { field: 'createdAt', order: 'desc' };
    this.timestamp = new Date();
  }
}