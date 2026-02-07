// src/server.ts
import express from 'express';
import http from 'http';
import path from 'path';
import { Server as IOServer } from 'socket.io';
import { setupSocketIO } from './socket';
import { vigem } from './vigem';
import os from 'os';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Xbox supports max 4 controllers
export const MAX_CONTROLLERS = 4;

async function start() {
    const app = express();
    const server = http.createServer(app);
    const io = new IOServer(server, {
        // CORS could be relaxed for local network
        cors: { origin: '*' }
    });

    // static
    const publicPath = path.join(__dirname, '..', 'public');
    app.use(express.static(publicPath));

    app.get('/test', (_req, res) => {
        res.send('Server is working!');
    });

    // info route
    app.get('/_status', (_req, res) => {
        res.json({ vigemConnected: vigem.isConnected });
    });

    // 👇 multi-controller logic lives here
    setupSocketIO(io);

    // start server
    server.listen(PORT, () => {
        const nets = os.networkInterfaces();
        const addresses: string[] = [];
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]!) {
                if (net.family === 'IPv4' && !net.internal) {
                    addresses.push(net.address);
                }
            }
        }

        console.log(`[Server] Listening on the following addresses:`);
        console.log(`   Local:   http://localhost:${PORT}`);
        addresses.forEach(ip => {
            console.log(`   Network: http://${ip}:${PORT}`);
        });
    });

    // Connect to ViGEmBus
    try {
        await vigem.connect();
    } catch (err) {
        console.error('[ViGEm] Could not connect to ViGEmBus. Is ViGEmBus installed? Error:', err);
        // We continue serving the UI so users can still connect; but controller won't be present.
    }

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('Shutting down...');
        vigem.disconnect();
        server.close(() => process.exit(0));
    });
}

start().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
