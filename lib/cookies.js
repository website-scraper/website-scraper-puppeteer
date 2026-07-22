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
	const nameValuePair = parts[0];
	const separatorIndex = nameValuePair.indexOf('=');
	if (separatorIndex === -1) {
		return null;
	}
	const name = nameValuePair.slice(0, separatorIndex).trim();
	if (!name) {
		return null;
	}

	const url = new URL(requestUrl);
	const cookie = {
		name,
		value: nameValuePair.slice(separatorIndex + 1).trim(),
		domain: url.hostname,
		path: defaultPath(url.pathname)
	};

	let maxAge = null;
	let expires = null;

	for (const attribute of parts.slice(1)) {
		const attributeSeparatorIndex = attribute.indexOf('=');
		const key = (attributeSeparatorIndex === -1 ? attribute : attribute.slice(0, attributeSeparatorIndex)).trim().toLowerCase();
		const value = attributeSeparatorIndex === -1 ? '' : attribute.slice(attributeSeparatorIndex + 1).trim();

		switch (key) {
			case 'domain':
				if (value) {
					// a Domain attribute always makes the cookie available to subdomains
					cookie.domain = value.startsWith('.') ? value : `.${value}`;
				}
				break;
			case 'path':
				if (value.startsWith('/')) {
					cookie.path = value;
				}
				break;
			case 'max-age': {
				const seconds = parseInt(value, 10);
				if (!isNaN(seconds)) {
					maxAge = seconds;
				}
				break;
			}
			case 'expires': {
				const timestamp = Date.parse(value);
				if (!isNaN(timestamp)) {
					expires = Math.floor(timestamp / 1000);
				}
				break;
			}
			case 'secure':
				cookie.secure = true;
				break;
			case 'httponly':
				cookie.httpOnly = true;
				break;
			default:
				break;
		}
	}

	// Max-Age takes precedence over Expires (RFC 6265 5.3)
	if (maxAge !== null) {
		cookie.expires = Math.floor(Date.now() / 1000) + maxAge;
	} else if (expires !== null) {
		cookie.expires = expires;
	}

	return cookie;
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
