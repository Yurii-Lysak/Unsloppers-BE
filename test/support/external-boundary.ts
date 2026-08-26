import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

/**
 * Controllable stand-in for an external HTTP dependency.
 *
 * The internal contracts each have a stub provider, but the external boundaries
 * — the timetracker Leaves and Projects APIs, and the PeopleForce import — had
 * no named stubbing mechanism, which left NFR-4 ("graceful degradation")
 * untestable. This is that mechanism: a real socket on loopback, so the client
 * under test exercises its actual HTTP path, timeouts and all, while the test
 * decides how the far end behaves.
 *
 * It deliberately does not model any particular provider's payloads. Point a
 * client's base URL at `boundary.url` and assert how the client behaves; the
 * response shape belongs to the client's own tests.
 */

export type BoundaryBehaviour =
  /** Answers with `body` serialized as JSON, optionally after a delay. */
  | {
      readonly kind: 'respond';
      readonly status?: number;
      readonly body?: unknown;
      readonly delayMs?: number;
    }
  /** Answers with a body that is not the JSON the client expects. */
  | {
      readonly kind: 'malformed';
      readonly status?: number;
      readonly payload?: string;
      readonly delayMs?: number;
    }
  /** Accepts the request and never answers, so the client's timeout decides. */
  | { readonly kind: 'hang' }
  /** Destroys the socket mid-request, the shape of a peer reset. */
  | { readonly kind: 'reset' };

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

const DEFAULT_BEHAVIOUR: BoundaryBehaviour = { kind: 'respond', status: 200 };

export class ExternalBoundary {
  private server: Server | null = null;
  private behaviour: BoundaryBehaviour = DEFAULT_BEHAVIOUR;
  private readonly received: RecordedRequest[] = [];
  private readonly sockets = new Set<Socket>();
  private readonly timers = new Set<NodeJS.Timeout>();

  private constructor(
    /** Label used in error messages, e.g. `timetracker-leaves`. */
    readonly name: string,
    private port: number,
  ) {}

  static async start(name: string): Promise<ExternalBoundary> {
    const boundary = new ExternalBoundary(name, 0);
    await boundary.listen();
    return boundary;
  }

  /** Base URL to hand to the client under test. */
  get url(): string {
    if (this.server === null) {
      throw new Error(
        `External boundary "${this.name}" is offline; its URL is only valid while listening.`,
      );
    }
    return `http://127.0.0.1:${this.port}`;
  }

  /** Requests seen since the last `reset()`, in arrival order. */
  get requests(): readonly RecordedRequest[] {
    return this.received;
  }

  /** Replaces how the far end answers from the next request onwards. */
  behave(behaviour: BoundaryBehaviour): void {
    this.behaviour = behaviour;
  }

  /**
   * Stops listening, so further calls fail to connect. This is the prolonged
   * outage case, and it is distinct from a slow or erroring response: the
   * client never gets a socket at all.
   */
  async goOffline(): Promise<void> {
    await this.closeServer();
  }

  /** Resumes listening on the same port, so a recovery path can be asserted. */
  async comeBackOnline(): Promise<void> {
    if (this.server !== null) {
      return;
    }
    await this.listen();
  }

  /** Clears recorded traffic and restores the default behaviour. */
  reset(): void {
    this.received.length = 0;
    this.behaviour = DEFAULT_BEHAVIOUR;
  }

  async stop(): Promise<void> {
    await this.closeServer();
    this.reset();
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res);
      });

      server.on('connection', (socket: Socket) => {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
      });

      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        this.port = (server.address() as AddressInfo).port;
        this.server = server;
        resolve();
      });
    });
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    this.received.push({
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      headers: { ...req.headers },
      body,
    });

    const behaviour = this.behaviour;

    if (behaviour.kind === 'hang') {
      return;
    }

    if (behaviour.kind === 'reset') {
      res.socket?.destroy();
      return;
    }

    const respond = () => {
      if (behaviour.kind === 'malformed') {
        res.writeHead(behaviour.status ?? 200, {
          'content-type': 'application/json',
        });
        res.end(behaviour.payload ?? '{"unterminated":');
        return;
      }

      res.writeHead(behaviour.status ?? 200, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify(behaviour.body ?? {}));
    };

    if (behaviour.delayMs === undefined || behaviour.delayMs <= 0) {
      respond();
      return;
    }

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      respond();
    }, behaviour.delayMs);
    this.timers.add(timer);
  }

  private async closeServer(): Promise<void> {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    const server = this.server;
    if (server === null) {
      return;
    }
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
