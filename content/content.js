(() => {
	let isRunning = false;
	let targetTotal = 0;
	let clickedCount = 0;
	let stopRequested = false;

	const STORAGE_KEY = 'zzim_auto_state';

	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function postStatus(text) {
		chrome.runtime.sendMessage({ type: 'ZZIM_STATUS', text }).catch(() => {});
	}

	async function waitForLoadAndNormalizeScroll() {
		if (document.readyState !== 'complete') {
			await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
		}
		postStatus('페이지 로드 대기 (2초)');
		await sleep(2000);
		const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 8);
		if (nearBottom) {
			window.scrollTo({ top: 0, behavior: 'auto' });
			await sleep(300);
		}
	}

	async function readState() {
		try {
			const data = await chrome.storage.local.get(STORAGE_KEY);
			return data?.[STORAGE_KEY] || null;
		} catch {
			return null;
		}
	}

	async function writeState(state) {
		try {
			await chrome.storage.local.set({ [STORAGE_KEY]: state });
		} catch {}
	}

	async function clearState() {
		try {
			await chrome.storage.local.remove(STORAGE_KEY);
		} catch {}
	}

	async function smoothScrollToBottom() {
		const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
		let last = -1;
		for (let i = 0; i < 10000; i++) {
			if (stopRequested) return;
			window.scrollBy({ top: step, behavior: 'smooth' });
			await sleep(350);
			const y = window.scrollY;
			if (Math.abs(y - last) < 2) break;
			last = y;
			if ((window.innerHeight + window.scrollY) >= document.body.scrollHeight - 4) break;
		}
		await sleep(600);
	}

	function getZzimButtonsInView() {
		const selector = 'button.zzim_button.type_background';
		const buttons = Array.from(document.querySelectorAll(selector));
		return buttons.filter(btn => btn.getAttribute('aria-pressed') !== 'true');
	}

	async function clickButtonsWithInterval() {
		const buttons = getZzimButtonsInView();
		for (const btn of buttons) {
			if (stopRequested) return;
			if (clickedCount >= targetTotal) return;
			try {
				btn.click();
				clickedCount += 1;
				postStatus(`클릭 ${clickedCount}/${targetTotal}`);
				await writeState({ running: true, targetTotal, clickedCount });
			} catch {}
			await sleep(500);
		}
	}

	function getPaginationContainer() {
		return document.querySelector('div[data-shp-area-id="pgn"], div[role="menubar"]');
	}

	function parsePageNumberFromAnchor(a) {
		const t = a?.textContent?.trim();
		const n = Number.parseInt(t || '', 10);
		return Number.isFinite(n) ? n : null;
	}

	function getCurrentPageNumber(container) {
		const current = container.querySelector('a[aria-current="true"]');
		return parsePageNumberFromAnchor(current);
	}

	function findNumericAnchor(container, pageNumber) {
		const anchors = Array.from(container.querySelectorAll('a'));
		return anchors.find(a => parsePageNumberFromAnchor(a) === pageNumber) || null;
	}

	function findNextBlockAnchor(container) {
		const anchors = Array.from(container.querySelectorAll('a'));
		return anchors.find(a => a.textContent?.trim() === '다음') || null;
	}

	async function goNextPage() {
		const container = getPaginationContainer();
		if (!container) return false;
		const current = getCurrentPageNumber(container);
		if (!Number.isFinite(current)) return false;
		const desired = current + 1;
		let nextNumeric = findNumericAnchor(container, desired);
		if (nextNumeric) {
			nextNumeric.click();
			await sleep(1200);
			return true;
		}
		const nextBlock = findNextBlockAnchor(container);
		if (!nextBlock) return false;
		nextBlock.click();
		await sleep(1200);
		const container2 = getPaginationContainer();
		nextNumeric = container2 ? findNumericAnchor(container2, desired) : null;
		if (nextNumeric) {
			nextNumeric.click();
			await sleep(1200);
			return true;
		}
		return true; // 블록 이동만 되었더라도 상위 루프에서 다음 라운드 처리
	}

	async function runOnceOnPage() {
		await waitForLoadAndNormalizeScroll();
		await smoothScrollToBottom();
		await clickButtonsWithInterval();
	}

	async function run(target) {
		if (isRunning) return;
		isRunning = true;
		stopRequested = false;
		targetTotal = target;
		const existing = await readState();
		clickedCount = existing?.running && existing?.targetTotal === target ? (existing.clickedCount || 0) : 0;
		await writeState({ running: true, targetTotal, clickedCount });
		postStatus('스크롤 시작');
		while (!stopRequested && clickedCount < targetTotal) {
			await runOnceOnPage();
			if (clickedCount >= targetTotal || stopRequested) break;
			postStatus('다음 페이지 이동');
			const moved = await goNextPage();
			if (!moved) {
				postStatus('다음 페이지를 찾을 수 없음');
				break;
			}
			await sleep(1500);
		}
		isRunning = false;
		await writeState({ running: false, targetTotal, clickedCount });
		postStatus(`완료 ${clickedCount}/${targetTotal}`);
	}

	chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
		if (msg?.type === 'ZZIM_START') {
			run(Number(msg.target)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
			return true;
		}
		if (msg?.type === 'ZZIM_STOP') {
			stopRequested = true;
			clearState();
			sendResponse({ ok: true });
			return false;
		}
	});

	// 새로고침/페이지 이동 후 자동 복원
	(async () => {
		const s = await readState();
		if (s?.running && Number.isFinite(s.targetTotal)) {
			postStatus('이전 작업 복원 중');
			run(Number(s.targetTotal));
		}
	})();
})();

