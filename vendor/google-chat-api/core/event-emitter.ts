export type EventCallback = (...args: unknown[]) => void | Promise<void>;

export class EventEmitter {
  private _listeners: Map<string, Set<EventCallback>>;

  constructor() {
    this._listeners = new Map();
  }

  on(event: string, callback: EventCallback): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  once(event: string, callback: EventCallback): void {
    const onceWrapper = async (...args: unknown[]) => {
      this.off(event, onceWrapper);
      await callback(...args);
    };
    this.on(event, onceWrapper);
  }

  off(event: string, callback: EventCallback): void {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  async emit(event: string, ...args: unknown[]): Promise<void> {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          await callback(...args);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}
