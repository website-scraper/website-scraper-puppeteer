import { URL } from 'url';
import setCookieParser from 'set-cookie-parser';
import logger from './logger.js';

/**
 * Parses a request Cookie header ("name1=value1; name2=value2")
 * into a list of {name, value} pairs.
 */
function parseCookieHeader (cookieHeader) {
	return cookieHeader.split(';')
		.map(pair => {
			const separatorIndex = pair.indexOf('=');
			if (separatorIndex === -1) {
				return null;
			}
			return {
				name: pair.slice(0, separatorIndex).trim(),
				value: pair.slice(separatorIndex + 1).trim()
			};
		})
		.filter(cookie => cookie && cookie.name);
}

/**
 * Parses a response Set-Cookie header into a puppeteer CookieData object.
 * Attributes which don't affect scraping (SameSite, Priority, ...) are ignored.
 * Returns null for malformed values.
 */
function parseSetCookieHeader (setCookieHeader, requestUrl) {
	// decodeValues: false keeps values verbatim, so they round-trip
	// into the browser jar and back into Cookie headers unchanged
	const parsed = setCookieParser.parseString(setCookieHeader, { decodeValues: false });
	if (!parsed.name) {
		return null;
	}

	const url = new URL(requestUrl);
	if (parsed.domain && !domainMatches(url.hostname, parsed.domain)) {
		// like browsers do (RFC 6265 5.3 step 6): a response must not set cookies for other domains
		logger.debug(`ignoring cookie ${parsed.name} for ${parsed.domain} set by ${url.hostname}`);
		return null;
	}

	const cookie = {
		name: parsed.name,
		value: parsed.value,
		// a Domain attribute always makes the cookie available to subdomains
		domain: parsed.domain ? ensureLeadingDot(parsed.domain) : url.hostname,
		path: parsed.path && parsed.path.startsWith('/') ? parsed.path : defaultPath(url.pathname)
	};

	if (parsed.secure) {
		cookie.secure = true;
	}
	if (parsed.httpOnly) {
		cookie.httpOnly = true;
	}

	const expires = parseExpiration(parsed);
	if (expires !== null) {
		cookie.expires = expires;
	}

	return cookie;
}

/**
 * A leading dot makes the cookie available to subdomains too. For hosts
 * without subdomains (localhost, IP addresses) Chrome stores it as host-only.
 */
function ensureLeadingDot (domain) {
	return domain.startsWith('.') ? domain : `.${domain}`;
}

/**
 * Checks whether hostname is the given domain or a subdomain of it (RFC 6265 5.1.3)
 */
function domainMatches (hostname, domain) {
	const bareDomain = domain.startsWith('.') ? domain.slice(1) : domain;
	return hostname === bareDomain || hostname.endsWith(`.${bareDomain}`);
}

function parseExpiration ({maxAge, expires}) {
	// Max-Age takes precedence over Expires (RFC 6265 5.3)
	if (maxAge !== undefined) {
		return Math.floor(Date.now() / 1000) + maxAge;
	}
	if (expires && !isNaN(expires.getTime())) {
		return Math.floor(expires.getTime() / 1000);
	}
	return null;
}

/**
 * Checks whether a cookie from the browser jar should be sent
 * to the given URL instance (RFC 6265 5.1.3 domain-match / 5.1.4 path-match).
 */
function cookieMatchesUrl (cookie, url) {
	if (cookie.secure && !isSecureContext(url)) {
		return false;
	}

	if (cookie.domain.startsWith('.')) {
		if (!domainMatches(url.hostname, cookie.domain)) {
			return false;
		}
	} else if (url.hostname !== cookie.domain) {
		return false;
	}

	const path = cookie.path;
	return url.pathname === path ||
		(url.pathname.startsWith(path) && (path.endsWith('/') || url.pathname[path.length] === '/'));
}

/**
 * Like Chrome, treats localhost as potentially trustworthy, so Secure cookies
 * are sent to it over http as well - keeping requests and page renders consistent.
 */
function isSecureContext (url) {
	const hostname = url.hostname;
	return url.protocol === 'https:' ||
		hostname === 'localhost' || hostname.endsWith('.localhost') ||
		hostname === '127.0.0.1' || hostname === '[::1]';
}

function serializeCookies (cookies) {
	return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

/**
 * Creates a cookie jar for got's `cookieJar` option backed by the browser's jar,
 * so plain HTTP requests and puppeteer pages share one source of truth.
 * got calls it for every request and every redirect hop.
 * See https://github.com/sindresorhus/got/blob/main/documentation/2-options.md#cookiejar
 *
 * Reading the browser jar is a round trip copying all cookies, so it is cached:
 * while no page is open the jar only changes through setCookie() below.
 * The plugin calls invalidate() once a page render finished.
 */
function createBrowserCookieJar (browser) {
	let cachedCookies = null;

	function readCookies () {
		if (!cachedCookies) {
			cachedCookies = browser.cookies().catch(error => {
				cachedCookies = null;
				throw error;
			});
		}
		return cachedCookies;
	}

	return {
		async getCookieString (url) {
			const parsedUrl = new URL(url);
			const cookies = (await readCookies()).filter(cookie => cookieMatchesUrl(cookie, parsedUrl));
			return serializeCookies(cookies);
		},

		async setCookie (setCookieHeader, url) {
			const cookie = parseSetCookieHeader(setCookieHeader, url);
			if (cookie) {
				// an already expired cookie removes the stored one, like browser.deleteCookie() does
				await storeBrowserCookie(browser, cookie);
				cachedCookies = null;
			}
		},

		invalidate () {
			cachedCookies = null;
		}
	};
}

/**
 * Stores a cookie into the browser jar. A cookie the browser rejects
 * (e.g. value over 4096 bytes, __Secure-/__Host- prefix with wrong attributes)
 * is dropped with a warning instead of failing the scrape.
 */
async function storeBrowserCookie (browser, cookie) {
	try {
		await browser.setCookie(cookie);
	} catch (error) {
		logger.warn(`ignoring cookie ${cookie.name} for ${cookie.domain}: ${error.message}`);
	}
}

function getCookieHeader (headers) {
	const key = Object.keys(headers).find(isCookieHeaderName);
	return key ? headers[key] : null;
}

function deleteCookieHeader (headers) {
	Object.keys(headers).filter(isCookieHeaderName).forEach(key => delete headers[key]);
}

function isCookieHeaderName (headerName) {
	return headerName.toLowerCase() === 'cookie';
}

/**
 * Default cookie path for a Set-Cookie header without a Path attribute (RFC 6265 5.1.4)
 */
function defaultPath (pathname) {
	const lastSlashIndex = pathname.lastIndexOf('/');
	return lastSlashIndex <= 0 ? '/' : pathname.slice(0, lastSlashIndex);
}

export { parseCookieHeader, parseSetCookieHeader, cookieMatchesUrl, serializeCookies, createBrowserCookieJar, storeBrowserCookie, ensureLeadingDot, getCookieHeader, deleteCookieHeader };
