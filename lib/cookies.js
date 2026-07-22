import { URL } from 'url';

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
	const parts = setCookieHeader.split(';');
	const nameValue = parseNameValuePair(parts[0]);
	if (!nameValue) {
		return null;
	}

	const url = new URL(requestUrl);
	const attributes = parseAttributes(parts.slice(1));
	const cookie = {
		name: nameValue.name,
		value: nameValue.value,
		domain: parseDomainAttribute(attributes.domain) || url.hostname,
		path: parsePathAttribute(attributes.path) || defaultPath(url.pathname)
	};

	if ('secure' in attributes) {
		cookie.secure = true;
	}
	if ('httponly' in attributes) {
		cookie.httpOnly = true;
	}

	const expires = parseExpiration(attributes);
	if (expires !== null) {
		cookie.expires = expires;
	}

	return cookie;
}

function parseNameValuePair (pair) {
	const separatorIndex = pair.indexOf('=');
	if (separatorIndex === -1) {
		return null;
	}
	const name = pair.slice(0, separatorIndex).trim();
	if (!name) {
		return null;
	}
	return { name, value: pair.slice(separatorIndex + 1).trim() };
}

function parseAttributes (parts) {
	const attributes = {};
	for (const part of parts) {
		const separatorIndex = part.indexOf('=');
		const key = (separatorIndex === -1 ? part : part.slice(0, separatorIndex)).trim().toLowerCase();
		attributes[key] = separatorIndex === -1 ? '' : part.slice(separatorIndex + 1).trim();
	}
	return attributes;
}

function parseDomainAttribute (domain) {
	if (!domain) {
		return null;
	}
	// a Domain attribute always makes the cookie available to subdomains
	return domain.startsWith('.') ? domain : `.${domain}`;
}

function parsePathAttribute (path) {
	return path && path.startsWith('/') ? path : null;
}

function parseExpiration (attributes) {
	// Max-Age takes precedence over Expires (RFC 6265 5.3)
	const maxAge = parseInt(attributes['max-age'], 10);
	if (!isNaN(maxAge)) {
		return Math.floor(Date.now() / 1000) + maxAge;
	}
	const expires = Date.parse(attributes.expires);
	if (!isNaN(expires)) {
		return Math.floor(expires / 1000);
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
