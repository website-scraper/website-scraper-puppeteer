import { expect } from 'chai';
import { parseCookieHeader, parseSetCookieHeader, cookieMatchesUrl, serializeCookies, createBrowserCookieJar, ensureLeadingDot, getCookieHeader, deleteCookieHeader } from '../lib/cookies.js';

describe('Cookies', () => {
	describe('parseCookieHeader', () => {
		it('should parse name=value pairs', () => {
			expect(parseCookieHeader('a=1; b=2')).to.eql([
				{ name: 'a', value: '1' },
				{ name: 'b', value: '2' }
			]);
		});

		it('should keep = characters inside values', () => {
			expect(parseCookieHeader('token=abc=def')).to.eql([{ name: 'token', value: 'abc=def' }]);
		});

		it('should skip malformed pairs', () => {
			expect(parseCookieHeader('malformed; a=1; =nameless')).to.eql([{ name: 'a', value: '1' }]);
		});
	});

	describe('parseSetCookieHeader', () => {
		const url = 'https://example.com/shop/cart';

		it('should default domain and path from the request url', () => {
			expect(parseSetCookieHeader('session=xyz', url)).to.eql({
				name: 'session',
				value: 'xyz',
				domain: 'example.com',
				path: '/shop'
			});
		});

		it('should parse attributes', () => {
			const cookie = parseSetCookieHeader('session=xyz; Domain=example.com; Path=/; Secure; HttpOnly', url);
			expect(cookie).to.include({
				name: 'session',
				value: 'xyz',
				domain: '.example.com',
				path: '/',
				secure: true,
				httpOnly: true
			});
		});

		it('should prefer Max-Age over Expires', () => {
			const cookie = parseSetCookieHeader('a=1; Expires=Wed, 01 Jan 2020 00:00:00 GMT; Max-Age=60', url);
			expect(cookie.expires).to.be.greaterThan(Date.now() / 1000);
		});

		it('should parse Expires into a unix timestamp', () => {
			const cookie = parseSetCookieHeader('a=1; Expires=Wed, 01 Jan 2020 00:00:00 GMT', url);
			expect(cookie.expires).to.eql(Date.parse('Wed, 01 Jan 2020 00:00:00 GMT') / 1000);
		});

		it('should return null for malformed headers', () => {
			expect(parseSetCookieHeader('malformed', url)).to.eql(null);
			expect(parseSetCookieHeader('=nameless', url)).to.eql(null);
		});

		it('should accept a Domain covering the request host', () => {
			expect(parseSetCookieHeader('a=1; Domain=example.com', 'https://shop.example.com/').domain).to.eql('.example.com');
			expect(parseSetCookieHeader('a=1; Domain=.example.com', 'https://example.com/').domain).to.eql('.example.com');
		});

		it('should reject a Domain not covering the request host', () => {
			expect(parseSetCookieHeader('session=attacker; Domain=target.com', 'https://ads.example.net/pixel.gif')).to.eql(null);
			expect(parseSetCookieHeader('a=1; Domain=shop.example.com', 'https://example.com/')).to.eql(null);
			expect(parseSetCookieHeader('a=1; Domain=example.com', 'https://badexample.com/')).to.eql(null);
		});
	});

	describe('cookieMatchesUrl', () => {
		const matches = (cookie, url) => cookieMatchesUrl(cookie, new URL(url));

		it('should match host-only cookies only on the exact host', () => {
			const cookie = { name: 'a', value: '1', domain: 'example.com', path: '/' };
			expect(matches(cookie, 'http://example.com/page')).to.eql(true);
			expect(matches(cookie, 'http://sub.example.com/page')).to.eql(false);
			expect(matches(cookie, 'http://other.com/page')).to.eql(false);
		});

		it('should match domain cookies on subdomains', () => {
			const cookie = { name: 'a', value: '1', domain: '.example.com', path: '/' };
			expect(matches(cookie, 'http://example.com/')).to.eql(true);
			expect(matches(cookie, 'http://sub.example.com/')).to.eql(true);
			expect(matches(cookie, 'http://badexample.com/')).to.eql(false);
		});

		it('should match paths on segment boundaries', () => {
			const cookie = { name: 'a', value: '1', domain: 'example.com', path: '/shop' };
			expect(matches(cookie, 'http://example.com/shop')).to.eql(true);
			expect(matches(cookie, 'http://example.com/shop/cart')).to.eql(true);
			expect(matches(cookie, 'http://example.com/shopping')).to.eql(false);
			expect(matches(cookie, 'http://example.com/')).to.eql(false);
		});

		it('should not send secure cookies over http', () => {
			const cookie = { name: 'a', value: '1', domain: 'example.com', path: '/', secure: true };
			expect(matches(cookie, 'http://example.com/')).to.eql(false);
			expect(matches(cookie, 'https://example.com/')).to.eql(true);
		});

		it('should send secure cookies to localhost over http, like Chrome does', () => {
			const secure = domain => ({ name: 'a', value: '1', domain, path: '/', secure: true });
			expect(matches(secure('localhost'), 'http://localhost:3000/')).to.eql(true);
			expect(matches(secure('.localhost'), 'http://app.localhost/')).to.eql(true);
			expect(matches(secure('127.0.0.1'), 'http://127.0.0.1/')).to.eql(true);
			expect(matches(secure('[::1]'), 'http://[::1]/')).to.eql(true);
		});
	});

	describe('ensureLeadingDot', () => {
		it('should add a leading dot once', () => {
			expect(ensureLeadingDot('example.com')).to.eql('.example.com');
			expect(ensureLeadingDot('.example.com')).to.eql('.example.com');
			expect(ensureLeadingDot('localhost')).to.eql('.localhost');
		});
	});

	describe('getCookieHeader', () => {
		it('should find the Cookie header case-insensitively', () => {
			expect(getCookieHeader({ Cookie: 'a=1' })).to.eql('a=1');
			expect(getCookieHeader({ cookie: 'a=1' })).to.eql('a=1');
			expect(getCookieHeader({ Accept: 'text/html' })).to.eql(null);
		});
	});

	describe('deleteCookieHeader', () => {
		it('should delete the Cookie header case-insensitively', () => {
			const headers = { Cookie: 'a=1', cookie: 'b=2', Accept: 'text/html' };
			deleteCookieHeader(headers);
			expect(headers).to.eql({ Accept: 'text/html' });
		});
	});

	describe('serializeCookies', () => {
		it('should serialize cookies into a Cookie header value', () => {
			const cookies = [{ name: 'a', value: '1' }, { name: 'b', value: '2' }];
			expect(serializeCookies(cookies)).to.eql('a=1; b=2');
		});
	});

	describe('createBrowserCookieJar', () => {
		const fakeBrowser = (cookies) => ({
			cookies: async () => cookies,
			setCookie: async (...newCookies) => cookies.push(...newCookies)
		});

		it('should serialize only the cookies which match the url', async () => {
			const jar = createBrowserCookieJar(fakeBrowser([
				{ name: 'a', value: '1', domain: 'example.com', path: '/' },
				{ name: 'b', value: '2', domain: 'other.com', path: '/' },
				{ name: 'c', value: '3', domain: 'example.com', path: '/', secure: true }
			]));
			expect(await jar.getCookieString('http://example.com/page')).to.eql('a=1');
			expect(await jar.getCookieString('https://example.com/page')).to.eql('a=1; c=3');
			expect(await jar.getCookieString('http://unknown.com/')).to.eql('');
		});

		it('should store Set-Cookie headers into the browser', async () => {
			const stored = [];
			const jar = createBrowserCookieJar(fakeBrowser(stored));
			await jar.setCookie('session=xyz; Path=/', 'https://example.com/page');
			expect(stored).to.eql([{ name: 'session', value: 'xyz', domain: 'example.com', path: '/' }]);
		});

		it('should ignore malformed Set-Cookie headers', async () => {
			const stored = [];
			const jar = createBrowserCookieJar(fakeBrowser(stored));
			await jar.setCookie('malformed', 'https://example.com/');
			expect(stored).to.eql([]);
		});

		it('should read the browser jar once until a cookie is stored or the cache is invalidated', async () => {
			let reads = 0;
			const cookies = [{ name: 'a', value: '1', domain: 'example.com', path: '/' }];
			const jar = createBrowserCookieJar({
				cookies: async () => { reads++; return cookies; },
				setCookie: async cookie => cookies.push(cookie)
			});

			await Promise.all([jar.getCookieString('http://example.com/'), jar.getCookieString('http://example.com/a')]);
			await jar.getCookieString('http://example.com/b');
			expect(reads).to.eql(1);

			await jar.setCookie('b=2; Path=/', 'http://example.com/');
			expect(await jar.getCookieString('http://example.com/')).to.eql('a=1; b=2');
			expect(reads).to.eql(2);

			jar.invalidate();
			await jar.getCookieString('http://example.com/');
			expect(reads).to.eql(3);
		});

		it('should read the browser jar for every request with cache disabled', async () => {
			let reads = 0;
			const jar = createBrowserCookieJar({ cookies: async () => { reads++; return []; } }, { cache: false });
			await jar.getCookieString('http://example.com/');
			await jar.getCookieString('http://example.com/');
			expect(reads).to.eql(2);
		});

		it('should not cache a failed read of the browser jar', async () => {
			let fail = true;
			const jar = createBrowserCookieJar({
				cookies: async () => {
					if (fail) {
						throw new Error('browser closed');
					}
					return [];
				}
			});
			await jar.getCookieString('http://example.com/').then(() => { throw new Error('should reject'); }, () => {});
			fail = false;
			expect(await jar.getCookieString('http://example.com/')).to.eql('');
		});

		it('should ignore cookies rejected by the browser', async () => {
			const rejectingBrowser = {
				cookies: async () => [],
				setCookie: async () => { throw new Error('Protocol error (Storage.setCookies): Invalid cookie fields'); }
			};
			const jar = createBrowserCookieJar(rejectingBrowser);
			await jar.setCookie('__Secure-a=1', 'http://example.com/');
		});
	});
});
