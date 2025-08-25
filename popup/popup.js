(() => {
	const targetInput = document.getElementById('targetCount');
	const startBtn = document.getElementById('startBtn');
	const stopBtn = document.getElementById('stopBtn');
	const statusEl = document.getElementById('status');

	function setStatus(text) {
		statusEl.textContent = text;
	}

	function isSmartStoreUrl(url) {
		return typeof url === 'string' && url.startsWith('https://smartstore.naver.com/');
	}

	// delay는 더 이상 사용하지 않음

	startBtn.addEventListener('click', async () => {
		const target = parseInt(targetInput.value, 10);
		if (!Number.isFinite(target) || target <= 0) {
			setStatus('올바른 목표개수를 입력하세요');
			return;
		}
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab || !tab.id) {
			setStatus('탭을 찾을 수 없습니다');
			return;
		}
		if (!isSmartStoreUrl(tab.url)) {
			setStatus('스마트스토어 탭에서 실행하세요');
			return;
		}
		try {
			await chrome.tabs.sendMessage(tab.id, { type: 'ZZIM_START', target });
			setStatus(`시작: 목표 ${target}`);
		} catch (e) {
			setStatus('연결 실패: 페이지를 새로고침 후 다시 시도하세요');
		}
	});

	stopBtn.addEventListener('click', async () => {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab || !tab.id) return;
		if (!isSmartStoreUrl(tab.url)) return;
		try {
			await chrome.tabs.sendMessage(tab.id, { type: 'ZZIM_STOP' });
			setStatus('중지 요청');
		} catch {}
	});

	chrome.runtime.onMessage.addListener((msg) => {
		if (msg?.type === 'ZZIM_STATUS') {
			setStatus(msg.text || '');
		}
		if (msg?.type === 'ZZIM_FINISHED') {
			setStatus('중지 (완료)');
		}
	});
})();

