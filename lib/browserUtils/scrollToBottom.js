export default async (timeout, viewportN) => {
	await new Promise((resolve) => {
		let totalHeight = 0, distance = 200, duration = 0, maxHeight = window.innerHeight * viewportN;
		const timer = setInterval(() => {
			duration += 200;
			window.scrollBy(0, distance);
			totalHeight += distance;
			if (totalHeight >= document.body.scrollHeight || duration >= timeout || totalHeight >= maxHeight) {
				clearInterval(timer);
				resolve();
			}
		}, 200);
	});
};
