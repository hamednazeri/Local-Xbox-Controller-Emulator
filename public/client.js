// public/client.js
(() => {
  const socket = io();

  // ===============================
  // STATE
  // ===============================
  let leftStickSource = 'joystick'; // 'joystick' | 'gyro'
  let gyroActive = false;

  // ===============================
  // UI
  // ===============================
  const statusText = document.getElementById('status-text');
  const serverIpDiv = document.getElementById('server-ip');
  const gyroButton = document.getElementById('enable-gyro');
  const gyroDebug = document.getElementById('gyro-debug');

  socket.on('connect', () => statusText.textContent = 'Connected');
  socket.on('disconnect', () => statusText.textContent = 'Disconnected');

  serverIpDiv.textContent =
    `Open http://${location.hostname}:${location.port || 3000}`;

  // ===============================
  // SOCKET EMIT
  // ===============================
  function emitEvent(data) {
    socket.emit('controller_event', data);
    console.log('[Emit]', data);
  }

  // ===============================
  // BUTTONS
  // ===============================
  document.querySelectorAll('[data-button]').forEach(btn => {
    const name = btn.dataset.button;
    const press = () => emitEvent({ type: 'button', button: name, action: 'press' });
    const release = () => emitEvent({ type: 'button', button: name, action: 'release' });

    btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
    btn.addEventListener('mousedown', e => { e.preventDefault(); press(); });
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
  });

  // ===============================
  // TRIGGERS
  // ===============================
  document.querySelectorAll('[data-trigger]').forEach(btn => {
    const trig = btn.dataset.trigger;
    const press = () => emitEvent({ type: 'trigger', trigger: trig, value: 255 });
    const release = () => emitEvent({ type: 'trigger', trigger: trig, value: 0 });

    btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
    btn.addEventListener('mousedown', e => { e.preventDefault(); press(); });
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
  });

  // ===============================
  // D-PAD
  // ===============================
  const dpad = { x: 0, y: 0 };
  const emitDpad = () => emitEvent({ type: 'dpad', x: dpad.x, y: dpad.y });

  document.querySelectorAll('.dpad-btn').forEach(btn => {
    const dir = btn.dataset.dir;

    const down = () => {
      dpad.x = dpad.y = 0;
      if (dir === 'up') dpad.y = -1;
      if (dir === 'down') dpad.y = 1;
      if (dir === 'left') dpad.x = -1;
      if (dir === 'right') dpad.x = 1;
      emitDpad();
    };

    const up = () => { dpad.x = dpad.y = 0; emitDpad(); };

    btn.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); up(); }, { passive: false });
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', up);
  });

  // ===============================
  // JOYSTICKS (NIPPLE)
  // ===============================
  function setupJoystick(containerId, stickName) {
    const zone = document.getElementById(containerId);
    if (!zone) return;

    const manager = nipplejs.create({
      zone,
      mode: 'static',
      color: '#14b8a6',
      size: 120,
      restOpacity: 0.8
    });

    let last = 0;

    manager.on('move', (evt, data) => {
      if (stickName === 'left' && leftStickSource !== 'joystick') return;

      const x = Math.max(-1, Math.min(1, data.vector.x));
      const y = Math.max(-1, Math.min(1, -data.vector.y)); // 👈 invert Y

      const now = performance.now();
      if (now - last > 8) {
        emitEvent({ type: 'stick', stick: stickName, x, y });
        last = now;
      }
    });

    manager.on('end', () => {
      emitEvent({ type: 'stick', stick: stickName, x: 0, y: 0 });
    });
  }

  setupJoystick('left-stick', 'left');
  setupJoystick('right-stick', 'right');

  // ===============================
  // GYROSCOPE / ACCELEROMETER
  // ===============================
  async function startGyro() {
    if (gyroActive) return;

    try {
      if (typeof DeviceMotionEvent?.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') {
          gyroButton.textContent = 'Permission denied ❌';
          return;
        }
      }

      leftStickSource = 'gyro';
      gyroActive = true;
      gyroButton.textContent = 'Gyro Enabled ✅';
      gyroButton.disabled = true;

      if ('Accelerometer' in window) {
        const sensor = new Accelerometer({ frequency: 60 });
        sensor.addEventListener('reading', () => {
          if (leftStickSource !== 'gyro') return;

          const ax = sensor.x || 0;
          const ay = sensor.y || 0;

          const x = Math.max(-1, Math.min(1, ay / 9.8));
          const y = Math.max(-1, Math.min(1, ax / 9.8));

          gyroDebug.textContent =
            `ax:${ax.toFixed(2)} ay:${ay.toFixed(2)}`;

          emitEvent({ type: 'stick', stick: 'left', x, y });
        });
        sensor.start();
      } else {
        window.addEventListener('deviceorientation', e => {
          if (leftStickSource !== 'gyro') return;

          const x = Math.max(-1, Math.min(1, e.gamma / 45));
          const y = Math.max(-1, Math.min(1, e.beta / 45));

          gyroDebug.textContent =
            `β:${e.beta.toFixed(1)} γ:${e.gamma.toFixed(1)}`;

          emitEvent({ type: 'stick', stick: 'left', x, y: -y });
        });
      }
    } catch (err) {
      console.error(err);
      gyroButton.textContent = 'Gyro failed ❌';
    }
  }

  gyroButton.addEventListener('click', startGyro);
})();