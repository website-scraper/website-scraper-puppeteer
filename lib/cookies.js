import { URL } from 'url';
import setCookieParser from 'set-cookie-parser';

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

function ensureLeadingDot (domain) {
	return domain.startsWith('.') ? domain : `.${domain}`;
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
 * to the given url (RFC 6265 5.1.3 domain-match / 5.1.4 path-match).
 */
function cookieMatchesUrl (cookie, requestUrl) {
	const url = new URL(requestUrl);

	if (cookie.secure && url.protocol !== 'https:') {
		return false;
	}

	if (cookie.domain.startsWith('.')) {
		const domain = cookie.domain.slice(1);
		if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) {
			return false;
		}
	} else if (url.hostname !== cookie.domain) {
		return false;
	}

	const path = cookie.path || '/';
	return url.pathname === path ||
		(url.pathname.startsWith(path) && (path.endsWith('/') || url.pathname[path.length] === '/'));
}

function serializeCookies (cookies) {
	return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

/**
 * Default cookie path for a Set-Cookie header without a Path attribute (RFC 6265 5.1.4)
 */
function defaultPath (pathname) {
	if (!pathname.startsWith('/')) {
		return '/';
	}
	const lastSlashIndex = pathname.lastIndexOf('/');
	return lastSlashIndex === 0 ? '/' : pathname.slice(0, lastSlashIndex);
}

export { parseCookieHeader, parseSetCookieHeader, cookieMatchesUrl, serializeCookies };
