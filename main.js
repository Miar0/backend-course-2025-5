const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { program } = require('commander');
const superagent = require('superagent');

program
    .requiredOption('-h, --host <type>', 'адреса сервера')
    .requiredOption('-p, --port <number>', 'порт сервера')
    .requiredOption('-c, --cache <path>', 'шлях до директорії кешу');

program.parse();
const options = program.opts();

async function ensureCacheDir() {
    try {
        await fs.mkdir(options.cache, { recursive: true });
    } catch (err) {
        console.error('Помилка створення директорії кешу:', err);
        process.exit(1);
    }
}

const server = http.createServer(async (req, res) => {
    const statusCode = req.url.slice(1);
    const filePath = path.join(options.cache, `${statusCode}.jpg`);

    if (!/^\d+$/.test(statusCode)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found: Invalid status code');
    }

    try {
        switch (req.method) {
            case 'GET':
                try {
                    const data = await fs.readFile(filePath);
                    res.setHeader('X-Cache', 'HIT');
                    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                    res.end(data);
                } catch (err) {
                    try {
                        const response = await superagent.get(`https://http.cat/${statusCode}`);
                        const imageBuffer = response.body;

                        await fs.writeFile(filePath, imageBuffer);

                        res.setHeader('X-Cache', 'MISS');
                        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                        res.end(imageBuffer);
                    } catch (fetchErr) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('Not Found on http.cat');
                    }
                }
                break;

            case 'PUT':
                let body = [];
                req.on('data', (chunk) => body.push(chunk));
                req.on('end', async () => {
                    try {
                        await fs.writeFile(filePath, Buffer.concat(body));
                        res.writeHead(201, { 'Content-Type': 'text/plain' });
                        res.end('Created');
                    } catch (e) {
                        res.writeHead(500);
                        res.end('Server Error');
                    }
                });
                break;

            case 'DELETE':
                try {
                    await fs.unlink(filePath);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Deleted');
                } catch (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found in cache');
                }
                break;

            default:
                res.writeHead(405, { 'Content-Type': 'text/plain' });
                res.end('Method Not Allowed');
        }
    } catch (globalErr) {
        res.writeHead(500);
        res.end('Internal Server Error');
    }
});

ensureCacheDir().then(() => {
    server.listen(options.port, options.host, () => {
        console.log(`Сервер запущено на http://${options.host}:${options.port}`);
        console.log(`Кеш зберігається у: ${options.cache}`);
    });
});