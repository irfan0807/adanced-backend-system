import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseConnectionPool from '../../shared/database/connection-pool.js';
import winston from 'winston';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/settlement-migration.log' })
  ]
});

async function runSettlementMigration() {
  const connectionPool = new DatabaseConnectionPool();

  try {
    logger.info('Starting settlement service database migration...');

    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Read migration file
    const migrationPath = path.join(__dirname, 'settlement-migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    logger.info('Migration file loaded successfully');

    // Split SQL commands and execute them
    const commands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    logger.info(`Found ${commands.length} SQL commands to execute`);

    // Execute each command
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.trim()) {
        try {
          logger.info(`Executing command ${i + 1}/${commands.length}...`);
          await connectionPool.executeWithMySQLConnection(async (connection) => {
            await connection.execute(command);
          });
          logger.info(`Command ${i + 1} executed successfully`);
        } catch (error) {
          // Log warning but continue for non-critical errors (like duplicate key/index)
          if (error.code === 'ER_DUP_KEYNAME' || error.code === 'ER_TABLE_EXISTS_ERROR') {
            logger.warn(`Command ${i + 1} skipped (already exists): ${error.message}`);
          } else {
            logger.error(`Error executing command ${i + 1}:`, error);
            throw error;
          }
        }
      }
    }

    logger.info('Settlement service database migration completed successfully!');

    // Verify tables were created
    const tables = [
      'settlements',
      'settlement_transactions',
      'settlement_schedules',
      'settlement_holds',
      'settlement_adjustments',
      'settlement_analytics',
      'settlement_reports',
      'settlement_reconciliation',
      'settlement_audit_log'
    ];

    logger.info('Verifying table creation...');
    for (const table of tables) {
      try {
        await connectionPool.executeWithMySQLConnection(async (connection) => {
          await connection.execute(`SELECT 1 FROM ${table} LIMIT 1`);
        });
        logger.info(`✓ Table ${table} verified`);
      } catch (error) {
        logger.warn(`⚠ Table ${table} verification failed: ${error.message}`);
      }
    }

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close connections
    await connectionPool.close();
    process.exit(0);
  }
}

// Run migration
runSettlementMigration().catch(error => {
  logger.error('Unhandled error during migration:', error);
  process.exit(1);
});