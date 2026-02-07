// src/socket.ts
import { Server as IOServer, Socket } from 'socket.io';
import { vigem } from './vigem';

type ClientEvent =
    | { type: 'button'; button: string; action: 'press' | 'release' }
    | { type: 'trigger'; trigger: 'LT' | 'RT'; value: number } // 0..255 expected
    | { type: 'stick'; stick: 'left' | 'right'; x: number; y: number }
    | { type: 'dpad'; x: number; y: number };

export function setupSocketIO(io: IOServer) {
    io.on('connection', (socket: Socket) => {
        console.log(`[Socket] client connected: ${socket.id} (${socket.conn.remoteAddress})`);
        socket.emit('server_time', { ts: Date.now() });

        socket.on('controller_event', (payload: ClientEvent) => {
            console.log(`[Socket] ${socket.id} -> controller_event:`, payload);

            try {
                switch (payload.type) {
                    case 'button': {
                        const pressed = payload.action === 'press';
                        // For D-pad directional digital buttons we'll map to dpad axes later
                        vigem.setButton(payload.button, pressed);
                        break;
                    }
                    case 'trigger': {
                        vigem.setTrigger(payload.trigger, payload.value);
                        break;
                    }
                    case 'stick': {
                        // Expect client sticks to send normalized -1..1 floats. If client sends 16-bit ints adjust there.
                        vigem.setStick(payload.stick, payload.x, payload.y);
                        break;
                    }
                    case 'dpad': {
                        // dpad uses x,y axes in -1..1
                        vigem.setDpad(payload.x, payload.y);
                        break;
                    }
                    default:
                        console.warn('[Socket] Unknown event type', (payload as any).type);
                }
            } catch (err) {
                console.error('[Socket] error handling event', err);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] client disconnected: ${socket.id} (${reason})`);
        });
    });
}
