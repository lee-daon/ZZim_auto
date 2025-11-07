(() => {
	let isRunning = false;
	let targetTotal = 0;
	let clickedCount = 0;
	let stopRequested = false;
	let noProductPageCount = 0;

	const STORAGE_KEY = 'zzim_auto_state';

	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function postStatus(text) {
		chrome.runtime.sendMessage({ type: 'ZZIM_STATUS', text }).catch(() => {});
	}

	function notifyFinished() {
		chrome.runtime.sendMessage({ type: 'ZZIM_FINISHED' }).catch(() => {});
	}

	async function waitForLoadAndNormalizeScroll() {
		if (document.readyState !== 'complete') {
			await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
		}
		postStatus('페이지 로드 대기 (0.2초)');
		await sleep(200);
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
		if (stopRequested) return;
		window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
		await sleep(1000);
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
			await sleep(5);
		}
		await sleep(300);
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
		const before = getCurrentPageNumber(container);
		if (!Number.isFinite(before)) return false;
		const desired = before + 1;
		let nextNumeric = findNumericAnchor(container, desired);
		if (nextNumeric) {
			nextNumeric.click();
			await sleep(1200);
		} else {
			const nextBlock = findNextBlockAnchor(container);
			if (!nextBlock) return false;
			nextBlock.click();
			await sleep(1200);
			const container2 = getPaginationContainer();
			nextNumeric = container2 ? findNumericAnchor(container2, desired) : null;
			if (nextNumeric) {
				nextNumeric.click();
				await sleep(1200);
			}
		}
		const afterContainer = getPaginationContainer();
		const after = afterContainer ? getCurrentPageNumber(afterContainer) : null;
		if (!Number.isFinite(after)) return false;
		return after !== before;
	}

	async function runOnceOnPage() {
		await waitForLoadAndNormalizeScroll();
		await smoothScrollToBottom();
		const buttonsBefore = getZzimButtonsInView().length;
		await clickButtonsWithInterval();
		const buttonsAfter = getZzimButtonsInView().length;
		
		if (buttonsBefore === 0 && buttonsAfter === 0) {
			noProductPageCount += 1;
		} else {
			noProductPageCount = 0;
		}
		
		return noProductPageCount;
	}

	async function run(target) {
		if (isRunning) return;
		isRunning = true;
		stopRequested = false;
		targetTotal = target;
		noProductPageCount = 0;
		const existing = await readState();
		clickedCount = existing?.running && existing?.targetTotal === target ? (existing.clickedCount || 0) : 0;
		await writeState({ running: true, targetTotal, clickedCount });
		postStatus('스크롤 시작');
		while (!stopRequested && clickedCount < targetTotal) {
			await runOnceOnPage();
			if (clickedCount >= targetTotal || stopRequested) break;
			
			if (noProductPageCount >= 3) {
				postStatus('3페이지 연속 찜한 상품이 없음');
				notifyFinished();
				break;
			}
			
			postStatus('다음 페이지 이동');
			const moved = await goNextPage();
			if (!moved) {
				postStatus('마지막 페이지');
				notifyFinished();
				break;
			}
			await sleep(1500);
		}
		isRunning = false;
		await writeState({ running: false, targetTotal, clickedCount });
		postStatus(`완료 ${clickedCount}/${targetTotal}`);
		notifyFinished();
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

