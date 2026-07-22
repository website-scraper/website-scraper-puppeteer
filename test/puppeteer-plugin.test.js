import { expect } from 'chai';
import http from 'http';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
import fs from 'fs-extra';
import scrape from 'website-scraper';
import PuppeteerPlugin from '../lib/index.js';

const directory = './test/tmp';
const SERVE_WEBSITE_PORT = 4567;

describe('Puppeteer plugin test', () => {
	let result, content, server;

	before('start webserver', () => server = startWebserver(SERVE_WEBSITE_PORT));
	after('stop webserver', () => server.close())

	describe('Dynamic content', () => {
		before('scrape website', async () => {
			result = await scrape({
				urls: [`http://localhost:${SERVE_WEBSITE_PORT}`],
				directory: directory,
				plugins: [ new PuppeteerPlugin({
					scrollToBottom: { timeout: 50, viewportN: 10 }
				}) ]
			});
		});
		before('get content from file', () => {
			content = fs.readFileSync(`${directory}/${result[0].filename}`).toString();
		});
		after('delete dir', () => fs.removeSync(directory));

		it('should have 1 item in result array', () => {
			expect(result.length).eql(1);
		});

		it('should render dymanic website', async () => {
			expect(content).to.contain('<div id="root">Hello world from JS!</div>');
		});

		it('should render special characters correctly', async () => {
			expect(content).to.contain('<div id="special-characters-test">7년 동안 한국에서 살았어요. Слава Україні!</div>');
		});
	});

	// Regression test for https://github.com/website-scraper/website-scraper-puppeteer/issues/115
	// The page js rotates the session cookie; the rotated cookie must be used
	// for subsequent requests instead of the initially configured one.
	describe('Session cookie rotated by page js', () => {
		const SESSION_SERVER_PORT = 4568;
		let sessionServer, files;

		before('start session webserver', () => sessionServer = startSessionRotatingWebserver(SESSION_SERVER_PORT));
		after('stop session webserver', () => sessionServer.close());

		before('scrape website', async () => {
			await scrape({
				urls: [`http://localhost:${SESSION_SERVER_PORT}/`],
				directory: directory,
				recursive: true,
				requestConcurrency: 1,
				request: {
					headers: { Cookie: 'session=token-1' }
				},
				urlFilter: url => url.startsWith(`http://localhost:${SESSION_SERVER_PORT}`),
				plugins: [ new PuppeteerPlugin({
					// wait for the session-rotating fetch() to complete before the page is closed
					gotoOptions: { waitUntil: 'networkidle0' }
				}) ]
			});
		});
		before('get content from files', () => {
			files = {
				index: fs.readFileSync(`${directory}/index.html`).toString(),
				page2: fs.readFileSync(`${directory}/page2.html`).toString()
			};
		});
		after('delete dir', () => fs.removeSync(directory));

		it('should stay logged in on the first page', () => {
			expect(files.index).to.contain('LOGGED-IN');
		});

		it('should stay logged in on subsequent pages', () => {
			expect(files.page2).to.contain('LOGGED-IN');
		});
	});

	describe('CJK content with charset only in meta tag', () => {
		let cjkResult, cjkContent;

		before('scrape website', async () => {
			cjkResult = await scrape({
				urls: [`http://localhost:${SERVE_WEBSITE_PORT}/cjk.html`],
				directory: directory,
				plugins: [ new PuppeteerPlugin() ]
			});
		});
		before('get content from file', () => {
			cjkContent = fs.readFileSync(`${directory}/${cjkResult[0].filename}`).toString();
		});
		after('delete dir', () => fs.removeSync(directory));

		// Regression test for https://github.com/website-scraper/website-scraper-puppeteer/pull/103
		// Saving the page as a binary string corrupted these characters on disk.
		it('should save CJK characters without corruption', () => {
			expect(cjkContent).to.contain('<div id="cjk-characters-test">磁致伸缩位移传感器 影响大跨度桥梁施工控制的因素</div>');
		});
	});
});

// Simulates a website which rotates the session cookie via an ajax call
// (like WordPress heartbeat / WooCommerce fragments do). Rotation invalidates
// the previous token, and presenting a stale token destroys the whole session
// (like WordPress security plugins do on suspected session hijacking).
function startSessionRotatingWebserver (port) {
	const validTokens = new Set(['token-1']);
	const seenTokens = new Set(['token-1']);
	let tokenCounter = 1;

	const server = http.createServer((req, res) => {
		const tokenMatch = (req.headers.cookie || '').match(/session=([^;]+)/);
		const token = tokenMatch ? tokenMatch[1] : null;

		if (token && seenTokens.has(token) && !validTokens.has(token)) {
			validTokens.clear(); // stale token reuse -> destroy session
		}
		const loggedIn = token && validTokens.has(token);

		if (req.url === '/refresh') {
			if (loggedIn) {
				validTokens.delete(token);
				const newToken = `token-${++tokenCounter}`;
				validTokens.add(newToken);
				seenTokens.add(newToken);
				res.setHeader('Set-Cookie', `session=${newToken}; Path=/`);
			}
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ ok: loggedIn }));
			return;
		}

		res.setHeader('Content-Type', 'text/html');
		const status = loggedIn ? 'LOGGED-IN' : 'LOGGED-OUT';
		res.end(`<html><body><h1>${status}</h1>
			<a href="/page2.html">page2</a>
			<script>fetch('/refresh');</script>
		</body></html>`);
	});

	return server.listen(port);
}

function startWebserver(port = 3000) {
	const serve = serveStatic('./test/mock', {'index': ['index.html']});
	const server = http.createServer(function onRequest (req, res) {
		// Serve the CJK page the same way as the website from #103: utf-8 is
		// declared only in the html <meta> tag, not in the Content-Type header.
		if (req.url === '/cjk.html') {
			res.setHeader('Content-Type', 'text/html');
			res.end(fs.readFileSync('./test/mock/cjk.html'));
			return;
		}
		serve(req, res, finalhandler(req, res))
	});

	return server.listen(port)
}
