const debug = require('debug');

const appName = 'website-scraper-puppeteer-lambda';
const logLevels = ['error', 'warn', 'info', 'debug', 'log'];

const logger = {};
logLevels.forEach(logLevel => {
	logger[logLevel] = debug(`${appName}:${logLevel}`);
});

module.exports = logger;