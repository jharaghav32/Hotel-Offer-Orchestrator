import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RunningServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startServer(listener: RequestListener): Promise<RunningServer> {
  const server: Server = createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
