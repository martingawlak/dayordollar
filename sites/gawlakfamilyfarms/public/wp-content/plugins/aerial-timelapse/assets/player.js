/**
 * Aerial Timelapse player — dependency-free, REST-driven, touch-friendly.
 *
 * Modes:
 *   [data-at-root]   — fetches GET /wp-json/aerial-timelapse/v1/property and
 *                      builds the card (or the address setup form) from it.
 *   [data-at-player] — inline frames JSON in the attribute (demo mode).
 */
(function () {
	'use strict';

	var SPEEDS = [0.5, 1, 2, 4]; // frames per second

	function formatDate(iso) {
		var m = /^(\d{4})-(\d{2})/.exec(iso || '');
		if (!m) return iso || '';
		var months = ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'];
		return months[parseInt(m[2], 10) - 1] + ' ' + m[1];
	}

	function el(tag, className, parent) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (parent) parent.appendChild(node);
		return node;
	}

	function initPlayer(root, frames) {
		if (!frames || !frames.length) return;

		var index = 0;
		var playing = false;
		var fps = 2;
		var timer = null;

		var frame = el('div', 'at-frame', root);
		var imgs = frames.map(function (f) {
			var img = el('img', '', frame);
			img.src = f.url;
			img.alt = 'Aerial view, ' + formatDate(f.date);
			return img;
		});
		var overlay = el('div', 'at-date-overlay', frame);

		var controls = el('div', 'at-controls', root);
		var playBtn = el('button', 'at-play', controls);
		playBtn.type = 'button';
		playBtn.textContent = 'Play';
		var slider = el('input', 'at-slider', controls);
		slider.type = 'range';
		slider.min = 0;
		slider.max = frames.length - 1;
		slider.step = 1;
		slider.value = 0;
		slider.setAttribute('aria-label', 'Timeline');
		var speed = el('select', 'at-speed', controls);
		speed.setAttribute('aria-label', 'Playback speed');
		SPEEDS.forEach(function (s) {
			var opt = el('option', '', speed);
			opt.value = s;
			opt.textContent = s + '×';
			if (s === fps) opt.selected = true;
		});
		var counter = el('span', 'at-counter', controls);

		function show(i) {
			index = i;
			imgs.forEach(function (img, j) {
				img.style.opacity = j === i ? '1' : '0';
			});
			overlay.textContent = formatDate(frames[i].date);
			slider.value = i;
			counter.textContent = (i + 1) + ' / ' + frames.length;
		}

		function setPlaying(on) {
			playing = on;
			playBtn.textContent = on ? 'Pause' : 'Play';
			if (timer) clearInterval(timer);
			timer = null;
			if (on) {
				timer = setInterval(function () {
					show((index + 1) % frames.length);
				}, 1000 / fps);
			}
		}

		playBtn.addEventListener('click', function () { setPlaying(!playing); });
		slider.addEventListener('input', function () {
			setPlaying(false);
			show(parseInt(slider.value, 10));
		});
		speed.addEventListener('change', function () {
			fps = parseFloat(speed.value);
			if (playing) setPlaying(true); // restart interval at the new rate
		});

		show(0);
	}

	function renderCard(root, data) {
		root.innerHTML = '';
		var card = el('div', 'at-card' + (data.is_new_update ? ' at-new-update' : ''), root);
		var head = el('div', 'at-card-head', card);
		el('span', 'at-address', head).textContent = data.address;
		if (data.is_new_update) {
			el('span', 'at-new-badge', head).textContent = 'NEW IMAGERY';
		}
		var player = el('div', 'at-player', card);
		initPlayer(player, data.frames);
		var first = data.frames[0], last = data.frames[data.frames.length - 1];
		el('div', 'at-meta', card).textContent = data.frames.length + ' aerial snapshots · ' +
			first.date.slice(0, 4) + ' – ' + last.date.slice(0, 4) + ' · imagery: ' +
			(data.source || 'USDA NAIP (public domain)');
	}

	function renderSetupForm(root, suggestedAddress) {
		root.innerHTML = '';
		var setup = el('div', 'at-setup', root);
		el('p', '', setup).textContent = suggestedAddress
			? 'Is this your property address? Confirm or correct it to build your aerial timelapse:'
			: 'Enter your property address to build your aerial timelapse:';
		var form = el('form', 'at-address-form', setup);
		var input = el('input', '', form);
		input.type = 'text';
		input.name = 'address';
		input.placeholder = '123 Main St, City, ST 12345';
		input.required = true;
		if (suggestedAddress) input.value = suggestedAddress;
		var button = el('button', '', form);
		button.type = 'submit';
		button.textContent = 'Build timelapse';
		var status = el('p', 'at-status', setup);

		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var address = input.value.trim();
			if (!address) return;
			button.disabled = true;
			status.textContent = 'Building your timelapse — finding and downloading historical aerial imagery…';
			status.classList.remove('at-error');
			request('POST', { address: address })
				.then(function (data) { renderCard(root, data); })
				.catch(function (err) {
					button.disabled = false;
					status.textContent = err.message;
					status.classList.add('at-error');
				});
		});
	}

	function request(method, body, query) {
		var url = window.atConfig.restUrl + (query || '');
		return fetch(url, {
			method: method,
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': window.atConfig.nonce
			},
			body: body ? JSON.stringify(body) : undefined
		}).then(function (res) {
			return res.json().then(function (data) {
				if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
				return data;
			});
		});
	}

	function initRoot(root) {
		if (!window.atConfig) return;
		var userId = root.getAttribute('data-at-user');
		request('GET', null, userId ? '?user_id=' + encodeURIComponent(userId) : '')
			.then(function (data) {
				if (data.has_property) {
					renderCard(root, data);
				} else if (root.getAttribute('data-at-editable') === 'yes' && !userId) {
					renderSetupForm(root, data.suggested_address || '');
				} else {
					root.innerHTML = '';
				}
			})
			.catch(function (err) {
				root.innerHTML = '';
				var p = el('p', 'at-status at-error', root);
				p.textContent = 'Could not load the timelapse: ' + err.message;
			});
	}

	function boot() {
		Array.prototype.forEach.call(document.querySelectorAll('[data-at-root]'), initRoot);
		Array.prototype.forEach.call(document.querySelectorAll('[data-at-player]'), function (node) {
			try {
				initPlayer(node, JSON.parse(node.getAttribute('data-at-player')).frames);
			} catch (e) { /* ignore malformed demo data */ }
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
