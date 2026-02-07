// src/vigem.ts
import { EventEmitter } from 'events';

/**
 * Minimal wrapper around node-ViGEmClient (vigemclient).
 *
 * Note: node-ViGEmClient is a native module and only works on Windows.
 * This wrapper abstracts connect/disconnect and provides typed helpers.
 */
let ViGEmClient: any;
try {
    // require at runtime because TypeScript might not have types
    ViGEmClient = require('vigemclient');
} catch (err) {
    // If module not available, we'll still export a stub that throws when used.
    ViGEmClient = null;
}

export type StickValue = { x: number; y: number };
export type TriggerValue = number; // 0..255 from client

export class ViGEmController extends EventEmitter {
    private client: any | null = null;
    private controller: any | null = null;
    public connected = false;

    async connect(): Promise<void> {
        if (!ViGEmClient) {
            throw new Error('vigemclient module not installed or not available (Windows only)');
        }
        this.client = new ViGEmClient();
        const err = this.client.connect();
        if (err instanceof Error) throw err;
        // create Xbox 360 controller
        this.controller = this.client.createX360Controller();
        const err2 = this.controller.connect();
        if (err2 instanceof Error) throw err2;
        this.connected = true;
        this.emit('connected');
        console.log('[ViGEm] Virtual Xbox 360 controller connected.');
        // Set manual update mode if you'd like to batch updates; default is "auto".
        // this.controller.updateMode = 'manual';
    }

    disconnect(): void {
        if (this.controller) {
            try {
                this.controller.disconnect();
            } catch { }
            this.controller = null;
        }
        this.client = null;
        this.connected = false;
        this.emit('disconnected');
    }

    // BUTTONS
    setButton(buttonName: string, pressed: boolean): void {
        if (!this.controller) return;
        // Map friendly names to ViGEm internal names
        // Valid X360 button names: START, BACK, LEFT_THUMB, RIGHT_THUMB, LEFT_SHOULDER, RIGHT_SHOULDER, GUIDE, A, B, X, Y
        const mapping: Record<string, string> = {
            'A': 'A',
            'B': 'B',
            'X': 'X',
            'Y': 'Y',
            'LB': 'LEFT_SHOULDER',
            'RB': 'RIGHT_SHOULDER',
            'START': 'START',
            'BACK': 'BACK',
            'LS': 'LEFT_THUMB',
            'RS': 'RIGHT_THUMB',
            'GUIDE': 'GUIDE',
            'D_UP': 'DPAD_UP',
            'D_DOWN': 'DPAD_DOWN',
            'D_LEFT': 'DPAD_LEFT',
            'D_RIGHT': 'DPAD_RIGHT'
        };

        // The node-ViGEmClient exposes controller.button.<NAME>.setValue(true/false)
        // For D-PAD we prefer to set dpad axes (below) but supporting button mapping is harmless.
        const vigemName = mapping[buttonName] ?? buttonName;
        // some older versions present button constants in the button object directly (A/B/X/Y)
        if (this.controller.button && this.controller.button[vigemName] !== undefined) {
            try {
                this.controller.button[vigemName].setValue(!!pressed);
            } catch (err) {
                console.warn('[ViGEm] setButton error:', err);
            }
        } else {
            // Fallback: try to set axis dpad
            console.warn(`[ViGEm] Unknown button mapping "${buttonName}"`);
        }
    }

    // TRIGGERS: client sends 0..255; vigem expects normalized 0..1 floats (or uses setValue(0..1))
    setTrigger(which: 'LT' | 'RT', value255: number): void {
        if (!this.controller) return;
        const normalized = Math.max(0, Math.min(255, value255)) / 255;
        if (which === 'LT') {
            try {
                this.controller.axis.leftTrigger.setValue(normalized);
            } catch (err) {
                console.warn('[ViGEm] setTrigger LT error', err);
            }
        } else {
            try {
                this.controller.axis.rightTrigger.setValue(normalized);
            } catch (err) {
                console.warn('[ViGEm] setTrigger RT error', err);
            }
        }
    }

    // STICKS: client will send x,y in -32768..32767 OR -1..1 depending on client; we'll expect -1..1 floats from client.
    setStick(which: 'left' | 'right', x: number, y: number): void {
        if (!this.controller) return;
        // clamp inputs to [-1,1]
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        const nx = clamp(x);
        const ny = clamp(y);
        if (which === 'left') {
            try {
                this.controller.axis.leftX.setValue(nx);
                this.controller.axis.leftY.setValue(-ny); // invert Y if needed (client will send Y where up is positive) — tweakable
            } catch (err) {
                console.warn('[ViGEm] setStick left error', err);
            }
        } else {
            try {
                this.controller.axis.rightX.setValue(nx);
                this.controller.axis.rightY.setValue(-ny);
            } catch (err) {
                console.warn('[ViGEm] setStick right error', err);
            }
        }
    }

    // D-PAD using dpad axes: expects -1,0,1 on dpadHorz and dpadVert
    setDpad(horz: number, vert: number): void {
        if (!this.controller) return;
        // clamp to -1..1 and round to -1,0,1
        const toStep = (v: number) => {
            if (v > 0.5) return 1;
            if (v < -0.5) return -1;
            return 0;
        };
        try {
            this.controller.axis.dpadHorz.setValue(toStep(horz));
            this.controller.axis.dpadVert.setValue(toStep(vert));
        } catch (err) {
            console.warn('[ViGEm] setDpad error', err);
        }
    }

    // utility to reset all inputs
    resetInputs(): void {
        if (!this.controller) return;
        try {
            this.controller.resetInputs();
        } catch (err) {
            console.warn('[ViGEm] resetInputs error', err);
        }
    }
}

// Export a singleton instance for the app
export const vigem = new ViGEmController();