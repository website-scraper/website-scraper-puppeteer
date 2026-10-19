import { expect } from 'chai';
import RequestRenderLock from '../lib/requestRenderLock.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

async function isPending (promise) {
	let pending = true;
	promise.then(() => pending = false);
	await tick();
	return pending;
}

describe('RequestRenderLock', () => {
	let lock;

	beforeEach(() => lock = new RequestRenderLock());

	it('should let requests run concurrently', async () => {
		const finishFirst = await lock.startRequest();
		const finishSecond = await lock.startRequest();
		finishFirst();
		finishSecond();
	});

	it('should start a render only after in-flight requests finished', async () => {
		const finishRequest = await lock.startRequest();
		const render = lock.startRender();
		expect(await isPending(render)).to.eql(true);

		finishRequest();
		const finishRender = await render;
		finishRender();
	});

	it('should hold back requests while a render is waiting or running', async () => {
		const finishFirstRequest = await lock.startRequest();
		const render = lock.startRender();

		const secondRequest = lock.startRequest();
		expect(await isPending(secondRequest)).to.eql(true);

		finishFirstRequest();
		const finishRender = await render;
		expect(await isPending(secondRequest)).to.eql(true);

		finishRender();
		const finishSecondRequest = await secondRequest;
		finishSecondRequest();
	});

	it('should not run renders concurrently', async () => {
		const finishFirst = await lock.startRender();
		const second = lock.startRender();
		expect(await isPending(second)).to.eql(true);

		finishFirst();
		const finishSecond = await second;
		finishSecond();
	});

	it('should ignore finishing twice', async () => {
		const finishRequest = await lock.startRequest();
		finishRequest();
		finishRequest();

		const render = lock.startRender();
		expect(await isPending(render)).to.eql(false);
		(await render)();
	});
});
