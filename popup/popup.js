(() => {
	const targetInput = document.getElementById('targetCount');
	const startBtn = document.getElementById('startBtn');
	const stopBtn = document.getElementById('stopBtn');
	const statusEl = document.getElementById('status');

	function setStatus(text) {
		statusEl.textContent = text;
	}

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
		await chrome.tabs.sendMessage(tab.id, { type: 'ZZIM_START', target });
		setStatus(`시작: 목표 ${target}`);
	});

	stopBtn.addEventListener('click', async () => {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab || !tab.id) return;
		await chrome.tabs.sendMessage(tab.id, { type: 'ZZIM_STOP' });
		setStatus('중지 요청');
	});

	chrome.runtime.onMessage.addListener((msg) => {
		if (msg?.type === 'ZZIM_STATUS') {
			setStatus(msg.text || '');
		}
	});
})();

