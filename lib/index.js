import { URL } from 'url';
import puppeteer from '@website-scraper/puppeteer-version-wrapper';
import logger from './logger.js';
import scrollToBottomBrowser from './browserUtils/scrollToBottom.js';
import { parseCookieHeader, parseSetCookieHeader, cookieMatchesUrl, serializeCookies } from './cookies.js';

class PuppeteerPlugin {
	constructor ({
		launchOptions = {},
		gotoOptions = {},
		scrollToBottom = null,
	} = {}) {
		this.launchOptions = launchOptions;
		this.gotoOptions = gotoOptions;
		this.scrollToBottom = scrollToBottom;
		this.browser = null;
		this.headers = {};
		this.cookieSeededHosts = new Set();

		logger.info('init plugin', { launchOptions, scrollToBottom });
	}

	apply (registerAction) {
		registerAction('beforeStart', async () => {
			this.browser = await puppeteer.launch(this.launchOptions);
		});

		registerAction('beforeRequest', async ({resource, requestOptions}) => {
			const url = resource.getUrl();
			const headers = Object.assign({}, requestOptions.headers);

			await this.seedBrowserCookies(url, headers);
			await this.applyBrowserCookies(url, headers);

			if (hasValues(headers)) {
				// puppeteer pages receive cookies from the browser jar, not from headers,
				// so that Cookie is not leaked to third-party requests made by the page
				this.headers = omitCookieHeader(headers);
			}

			return {requestOptions: Object.assign({}, requestOptions, {headers})};
		});

		registerAction('afterResponse', async ({response}) => {
			await this.storeResponseCookies(response);

			const contentType = response.headers['content-type'];
			const isHtml = contentType && contentType.split(';')[0] === 'text/html';
			if (isHtml) {
				const url = response.url;
				const page = await this.browser.newPage();

				if (hasValues(this.headers)) {
					logger.info('set headers to puppeteer page', this.headers);
					await page.setExtraHTTPHeaders(this.headers);
				}

				await page.goto(url, this.gotoOptions);

				if (this.scrollToBottom) {
					await scrollToBottom(page, this.scrollToBottom.timeout, this.scrollToBottom.viewportN);
				}

				const content = await page.content();
				await page.close();

				// page.content() returns an already-decoded string, so we
				// tell website-scraper to save it as utf8. Returning a binary
				// string instead corrupts non-latin1 characters on disk.
				// See https://github.com/website-scraper/node-website-scraper#afterresponse
				return {
					body: content,
					encoding: 'utf8'
				};
			} else {
				return response.body;
			}
		});

		registerAction('afterFinish', () => this.browser && this.browser.close());
	}

	/**
	 * Sets cookies from the configured Cookie request header into the browser jar,
	 * so puppeteer pages send them too. Done once per host - afterwards the jar,
	 * which receives rotated/refreshed cookies, is the source of truth.
	 * See https://github.com/website-scraper/website-scraper-puppeteer/issues/115
	 */
	async seedBrowserCookies (url, headers) {
		const hostname = new URL(url).hostname;
		if (this.cookieSeededHosts.has(hostname)) {
			return;
		}
		this.cookieSeededHosts.add(hostname);

		const cookieHeader = getCookieHeader(headers);
		if (!cookieHeader) {
			return;
		}

		const cookies = parseCookieHeader(cookieHeader)
			.map(({name, value}) => ({name, value, domain: hostname, path: '/'}));
		if (cookies.length > 0) {
			logger.info(`seed browser cookies for host ${hostname}`, cookies.map(cookie => cookie.name));
			await this.browser.setCookie(...cookies);
		}
	}

	/**
	 * Replaces the request Cookie header with current cookies from the browser jar.
	 * Pages opened in puppeteer may rotate session cookies (via Set-Cookie or js),
	 * which invalidates the initially configured ones.
	 */
	async applyBrowserCookies (url, headers) {
		const cookies = (await this.browser.cookies()).filter(cookie => cookieMatchesUrl(cookie, url));
		if (cookies.length > 0) {
			deleteCookieHeader(headers);
			headers.cookie = serializeCookies(cookies);
		}
	}

	/**
	 * Stores Set-Cookie headers from plain HTTP responses into the browser jar,
	 * so cookies set on non-html resources are not lost either.
	 */
	async storeResponseCookies (response) {
		const setCookieHeaders = response.headers['set-cookie'];
		if (!setCookieHeaders || setCookieHeaders.length === 0) {
			return;
		}

		const cookies = setCookieHeaders
			.map(setCookieHeader => parseSetCookieHeader(setCookieHeader, response.url))
			.filter(Boolean);
		const now = Date.now() / 1000;
		const alive = cookies.filter(cookie => cookie.expires === undefined || cookie.expires > now);
		const expired = cookies.filter(cookie => cookie.expires !== undefined && cookie.expires <= now);

		if (alive.length > 0) {
			await this.browser.setCookie(...alive);
		}
		if (expired.length > 0) {
			await this.browser.deleteCookie(...expired);
		}
	}
}

function hasValues (obj) {
	return obj && Object.keys(obj).length > 0;
}

function getCookieHeader (headers) {
	const key = Object.keys(headers).find(headerName => headerName.toLowerCase() === 'cookie');
	return key ? headers[key] : null;
}

function deleteCookieHeader (headers) {
	Object.keys(headers)
		.filter(headerName => headerName.toLowerCase() === 'cookie')
		.forEach(headerName => delete headers[headerName]);
}

function omitCookieHeader (headers) {
	const result = Object.assign({}, headers);
	deleteCookieHeader(result);
	return result;
}

async function scrollToBottom (page, timeout, viewportN) {
	logger.info(`scroll puppeteer page to bottom ${viewportN} times with timeout = ${timeout}`);

	await page.evaluate(scrollToBottomBrowser, timeout, viewportN);
}

export default PuppeteerPlugin;
