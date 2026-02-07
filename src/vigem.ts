// src/vigem.ts
import { EventEmitter } from 'events';

/**
 * Minimal wrapper around node-ViGEmClient (vigemclient).
 *
 * Note: node-ViGEmClient is a native module and only works on Windows.
 * This wrapper abstracts connect/disconnect and provides typed helpers.
 */
let ViGEmClientClass: any;
try {
    const mod = require('vigemclient');
    ViGEmClientClass = mod.ViGEmClient ?? mod;
} catch {
    ViGEmClientClass = null;
}

// Wrapper for a single Xbox 360 controller
export class XboxController extends EventEmitter {
    private ctrl: any;

    constructor(ctrl: any) {
        super();
        this.ctrl = ctrl;
    }

    disconnect() {
        try { this.ctrl.disconnect(); } catch { }
    }

    setButton(buttonName: string, pressed: boolean) {
        const mapping: Record<string, string> = {
            'A': 'A', 'B': 'B', 'X': 'X', 'Y': 'Y',
            'LB': 'LEFT_SHOULDER', 'RB': 'RIGHT_SHOULDER',
            'BACK': 'BACK', 'START': 'START',
            'LS': 'LEFT_THUMB', 'RS': 'RIGHT_THUMB',
            'GUIDE': 'GUIDE',
            'D_UP': 'DPAD_UP', 'D_DOWN': 'DPAD_DOWN',
            'D_LEFT': 'DPAD_LEFT', 'D_RIGHT': 'DPAD_RIGHT'
        };

        // The node-ViGEmClient exposes controller.button.<NAME>.setValue(true/false)
        // For D-PAD we prefer to set dpad axes (below) but supporting button mapping is harmless.
        const vigemName = mapping[buttonName] ?? buttonName;
        // some older versions present button constants in the button object directly (A/B/X/Y)
        if (this.ctrl.button && this.ctrl.button[vigemName] !== undefined) {
            try {
                this.ctrl.button[vigemName].setValue(!!pressed);
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
        if (!this.ctrl) return;
        const normalized = Math.max(0, Math.min(255, value255)) / 255;
        if (which === 'LT') {
            try {
                this.ctrl.axis.leftTrigger.setValue(normalized);
            } catch (err) {
                console.warn('[ViGEm] setTrigger LT error', err);
            }
        } else {
            try {
                this.ctrl.axis.rightTrigger.setValue(normalized);
            } catch (err) {
                console.warn('[ViGEm] setTrigger RT error', err);
            }
        }
    }

    // STICKS: client will send x,y in -32768..32767 OR -1..1 depending on client; we'll expect -1..1 floats from client.
    setStick(which: 'left' | 'right', x: number, y: number) {
        if (!this.ctrl) return;
        // clamp inputs to [-1,1]
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        const nx = clamp(x);
        const ny = clamp(y);
        if (which === 'left') {
            try {
                this.ctrl.axis.leftX.setValue(nx);
                this.ctrl.axis.leftY.setValue(-ny); // invert Y if needed (client will send Y where up is positive) — tweakable
            } catch (err) {
                console.warn('[ViGEm] setStick left error', err);
            }
        } else {
            try {
                this.ctrl.axis.rightX.setValue(nx);
                this.ctrl.axis.rightY.setValue(-ny);
            } catch (err) {
                console.warn('[ViGEm] setStick right error', err);
            }
        }
    }

    // D-PAD using dpad axes: expects -1,0,1 on dpadHorz and dpadVert
    setDpad(x: number, y: number) {
        const step = (v: number) => (v > 0.5 ? 1 : v < -0.5 ? -1 : 0);
        try {
            this.ctrl.axis.dpadHorz.setValue(step(x));
            this.ctrl.axis.dpadVert.setValue(step(y));
        } catch (err) {
            console.warn('[ViGEm] setDpad error', err);
        }
    }

    resetInputs() {
        try { this.ctrl.resetInputs(); } catch (err) {
            console.warn('[ViGEm] resetInputs error', err);
        }
    }
}

// Manager for bus + multi-controller support
export class ViGEmManager {
    private client: any | null = null;
    public isConnected = false;

    async connect() {
        if (!ViGEmClientClass) {
            console.warn('[ViGEm] vigemclient not available (Windows only)');
            return;
        }
        this.client = new ViGEmClientClass();
        try {
            const err = this.client.connect();
            if (err instanceof Error) throw err;
            this.isConnected = true;
            console.log('[ViGEm] Bus connected');
        } catch (err) {
            console.error('[ViGEm] Bus connection failed', err);
            this.client = null;
            this.isConnected = false;
        }
    }

    createXbox360Controller(): XboxController | null {
        if (!this.isConnected || !this.client) {
            console.warn('[ViGEm] Cannot create controller, bus not connected');
            return null;
        }
        try {
            const ctrl = this.client.createX360Controller();
            ctrl.connect();
            console.log('[ViGEm] Xbox controller created');
            return new XboxController(ctrl);
        } catch (err) {
            console.error('[ViGEm] Failed to create Xbox controller', err);
            return null;
        }
    }

    disconnect() {
        try { this.client?.disconnect(); } catch { }
        this.client = null;
        this.isConnected = false;
    }
}

// Singleton instance
export const vigem = new ViGEmManager();
