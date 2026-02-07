// src/socket.ts
import { Server as IOServer, Socket } from 'socket.io';
import { vigem, XboxController } from './vigem';

type ClientEvent =
    | { type: 'button'; button: string; action: 'press' | 'release' }
    | { type: 'trigger'; trigger: 'LT' | 'RT'; value: number }
    | { type: 'stick'; stick: 'left' | 'right'; x: number; y: number }
    | { type: 'dpad'; x: number; y: number };

// Map socket.id -> XboxController instance
const controllers = new Map<string, XboxController>();

const MAX_CONTROLLERS = 4;

export function setupSocketIO(io: IOServer) {
    io.on('connection', (socket: Socket) => {
        console.log(`[Socket] client connected: ${socket.id} (${socket.conn.remoteAddress})`);

        if (controllers.size >= MAX_CONTROLLERS) {
            console.warn('[Socket] controller limit reached');
            socket.emit('error', 'Controller limit reached');
            socket.disconnect(true);
            return;
        }

        const controller = vigem.createXbox360Controller();
        if (!controller) {
            console.warn('[Socket] No ViGEm controller available');
            socket.emit('error', 'No ViGEm controller available');
            return;
        }

        controllers.set(socket.id, controller);

        // Send initial info
        socket.emit('server_time', { ts: Date.now() });
        socket.emit('controller_info', { index: controllers.size });

        socket.on('controller_event', (payload: ClientEvent) => {
            const ctrl = controllers.get(socket.id);
            if (!ctrl) return;

            try {
                handleControllerEvent(ctrl, payload);
            } catch (err) {
                console.error('[Socket] error handling event', err);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] client disconnected: ${socket.id} (${reason})`);
            const ctrl = controllers.get(socket.id);
            if (ctrl) {
                ctrl.disconnect();
                controllers.delete(socket.id);
            }
        });
    });
}

function handleControllerEvent(ctrl: XboxController, payload: ClientEvent) {
    switch (payload.type) {
        case 'button':
            ctrl.setButton(payload.button, payload.action === 'press');
            break;

        case 'trigger':
            ctrl.setTrigger(payload.trigger, payload.value);
            break;

        case 'stick':
            ctrl.setStick(payload.stick, payload.x, payload.y);
            break;

        case 'dpad':
            ctrl.setDpad(payload.x, payload.y);
            break;

        default:
            console.warn('[Socket] Unknown event type', payload);
    }
}