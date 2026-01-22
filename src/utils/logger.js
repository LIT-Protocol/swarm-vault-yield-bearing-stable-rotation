const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, message, data) {
  const timestamp = formatTimestamp();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level}] ${message}${dataStr}`;
}

export const logger = {
  debug(message, data) {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, data));
    }
  },

  info(message, data) {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', message, data));
    }
  },

  warn(message, data) {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', message, data));
    }
  },

  error(message, data) {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', message, data));
    }
  },

  // Log a swap decision summary
  swapDecision(user, fromToken, toToken, apyImprovement, execute) {
    const action = execute ? 'EXECUTING' : 'SKIPPING';
    this.info(`${action} swap for ${user}: ${fromToken} -> ${toToken} (+${apyImprovement.toFixed(2)}% APY)`);
  },

  // Log rotation run summary
  summary(stats) {
    this.info('=== Rotation Summary ===');
    this.info(`Users checked: ${stats.usersChecked}`);
    this.info(`Swaps executed: ${stats.swapsExecuted}`);
    this.info(`Swaps skipped: ${stats.swapsSkipped}`);
    this.info(`Errors: ${stats.errors}`);
  },
};

export default logger;
