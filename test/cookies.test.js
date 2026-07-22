import { expect } from 'chai';
import { parseCookieHeader, parseSetCookieHeader, cookieMatchesUrl, serializeCookies } from '../lib/cookies.js';

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
	});

	describe('cookieMatchesUrl', () => {
		it('should match host-only cookies only on the exact host', () => {
			const cookie = { name: 'a', value: '1', domain: 'example.com', path: '/' };
			expect(cookieMatchesUrl(cookie, 'http://example.com/page')).to.eql(true);
			expect(cookieMatchesUrl(cookie, 'http://sub.example.com/page')).to.eql(false);
			expect(cookieMatchesUrl(cookie, 'http://other.com/page')).to.eql(false);
		});

		it('should match domain cookies on subdomains', () => {
			const cookie = { name: 'a', value: '1', domain: '.example.com', path: '/' };
			expect(cookieMatchesUrl(cookie, 'http://example.com/')).to.eql(true);
			expect(cookieMatchesUrl(cookie, 'http://sub.example.com/')).to.eql(true);
			expect(cookieMatchesUrl(cookie, 'http://badexample.com/')).to.eql(false);
		});

		it('should match paths on segment boundaries', () => {
			const cookie = { name: 'a', value: '1', domain: 'example.com', path: '/shop' };
			expect(cookieMatchesUrl(cookie, 'http://example.com/shop')).to.eql(true);
			expect(cookieMatchesUrl(cookie, 'http://example.com/shop/cart')).to.eql(true);
			expect(cookieMatchesUrl(cookie, 'http://example.com/shopping')).to.eql(false);
			expect(cookieMatchesUrl(cookie, 'http://example.com/')).to.eql(false);
		});

		it('should not send secure cookies over http', () => {
			const cookie = { name: 'a', value: '1', domain: 'example.com', path: '/', secure: true };
			expect(cookieMatchesUrl(cookie, 'http://example.com/')).to.eql(false);
			expect(cookieMatchesUrl(cookie, 'https://example.com/')).to.eql(true);
		});
	});

	describe('serializeCookies', () => {
		it('should serialize cookies into a Cookie header value', () => {
			const cookies = [{ name: 'a', value: '1' }, { name: 'b', value: '2' }];
			expect(serializeCookies(cookies)).to.eql('a=1; b=2');
		});
	});
});
