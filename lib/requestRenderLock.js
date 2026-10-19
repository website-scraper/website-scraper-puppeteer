/**
 * Keeps plain HTTP requests and puppeteer page renders from overlapping.
 *
 * A page render may rotate session cookies (via js or Set-Cookie), which
 * invalidates the cookie an in-flight plain request was built with. So:
 * - requests run concurrently with each other, but never while a render
 *   is running or waiting to run;
 * - a render runs alone: it waits for in-flight requests to finish and
 *   does not overlap with other renders, which could invalidate each other.
 */
class RequestRenderLock {
	constructor () {
		this.requests = 0;
		this.renders = 0; // running or waiting
		this.rendering = false;
		this.waiting = [];
	}

	/**
	 * Resolves when a request may start. Returns a function to call once it finished.
	 */
	async startRequest () {
		while (this.renders > 0) {
			await this.wait();
		}
		this.requests++;
		return once(() => {
			this.requests--;
			this.notify();
		});
	}

	/**
	 * Resolves when a render may start. Returns a function to call once it finished.
	 */
	async startRender () {
		this.renders++;
		while (this.requests > 0 || this.rendering) {
			await this.wait();
		}
		this.rendering = true;
		return once(() => {
			this.rendering = false;
			this.renders--;
			this.notify();
		});
	}

	wait () {
		return new Promise(resolve => this.waiting.push(resolve));
	}

	notify () {
		const waiting = this.waiting;
		this.waiting = [];
		waiting.forEach(resolve => resolve());
	}
}

function once (fn) {
	let called = false;
	return () => {
		if (!called) {
			called = true;
			fn();
		}
	};
}

export default RequestRenderLock;
