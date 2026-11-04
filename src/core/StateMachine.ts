/** Generyczna maszyna stanów z jawnym grafem dozwolonych przejść. */
export class StateMachine<S extends string> {
  private readonly listeners = new Set<(from: S, to: S) => void>();
  private readonly updaters = new Map<S, (dt: number) => void>();
  private state: S;

  constructor(
    private readonly graph: Record<S, readonly S[]>,
    initial: S,
  ) {
    this.state = initial;
  }

  get current(): S {
    return this.state;
  }

  is(...states: S[]): boolean {
    return states.includes(this.state);
  }

  can(to: S): boolean {
    return this.graph[this.state].includes(to);
  }

  transition(to: S): boolean {
    if (to === this.state) return false;
    if (!this.can(to)) {
      console.warn(`[flow] niedozwolone przejście ${this.state} -> ${to}`);
      return false;
    }
    const from = this.state;
    this.state = to;
    this.listeners.forEach((l) => l(from, to));
    return true;
  }

  onChange(listener: (from: S, to: S) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onUpdate(state: S, fn: (dt: number) => void): void {
    this.updaters.set(state, fn);
  }

  update(dt: number): void {
    this.updaters.get(this.state)?.(dt);
  }
}
