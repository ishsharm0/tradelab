import { dayKeyET } from "../engine/execution.js";
import { EventBus } from "./events.js";
import { LiveEngine } from "./engine/liveEngine.js";

function asWeight(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function defaultSystemId(system, index) {
  return system.id || `${system.symbol}-${system.interval || "1m"}-${index + 1}`;
}

/**
 * Multi-strategy live orchestrator with portfolio-level guardrails.
 */
export class LiveOrchestrator {
  constructor(options = {}) {
    if (!Array.isArray(options.systems) || options.systems.length === 0) {
      throw new Error("orchestrator requires a non-empty systems array");
    }
    if (!options.broker) {
      throw new Error("orchestrator requires a broker adapter");
    }

    this.options = {
      allocation: "equal",
      equity: 10_000,
      maxDailyLossPct: 0,
      ...options,
    };
    this.eventBus = this.options.eventBus || new EventBus();
    this.engines = [];
    this.running = false;
    this.dayStartEquity = this.options.equity;
    this.currentDay = null;
  }

  _emit(event, payload = {}) {
    this.eventBus.emitEvent(event, payload);
  }

  _allocationWeights() {
    const systems = this.options.systems;
    if (this.options.allocation === "equal") {
      return systems.map(() => 1);
    }
    return systems.map((system) => asWeight(system.weight || 0));
  }

  _allocatedEquities(totalEquity) {
    const weights = this._allocationWeights();
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map((weight) => (totalEquity * weight) / totalWeight);
  }

  async start() {
    if (this.running) return;
    const account = await this.options.broker.getAccount().catch(() => null);
    const totalEquity = Number.isFinite(account?.equity) ? account.equity : this.options.equity;
    const perSystemEquity = this._allocatedEquities(totalEquity);

    this.engines = this.options.systems.map((system, index) => {
      const engineBus = new EventBus();
      engineBus.onAny(({ event, payload }) => {
        this._emit(event, {
          systemId: defaultSystemId(system, index),
          ...payload,
        });
        if (event === "equity:update") this._checkPortfolioLimits();
      });

      return new LiveEngine({
        ...system,
        id: defaultSystemId(system, index),
        broker: this.options.broker,
        feed: this.options.feed,
        storage: this.options.storage,
        eventBus: engineBus,
        brokerConfig: this.options.brokerConfig,
        equity: perSystemEquity[index],
        useBrokerAccountEquity: false,
      });
    });

    await Promise.all(this.engines.map((engine) => engine.start()));
    this.running = true;
    this.dayStartEquity = this.getStatus().aggregateEquity;
    this.currentDay = dayKeyET(Date.now());
  }

  _checkPortfolioLimits() {
    if (!this.options.maxDailyLossPct || this.options.maxDailyLossPct <= 0) return;
    const nowDay = dayKeyET(Date.now());
    if (this.currentDay !== nowDay) {
      this.currentDay = nowDay;
      this.dayStartEquity = this.getStatus().aggregateEquity;
      return;
    }
    const equity = this.getStatus().aggregateEquity;
    const maxLossFraction = Math.abs(this.options.maxDailyLossPct) / 100;
    if (equity <= this.dayStartEquity * (1 - maxLossFraction)) {
      for (const engine of this.engines) {
        engine.riskManager.halt("portfolio daily loss limit reached");
      }
      this._emit("risk:halt", {
        reason: "portfolio daily loss limit reached",
        aggregateEquity: equity,
      });
    }
  }

  async stop() {
    await Promise.all(this.engines.map((engine) => engine.stop()));
    this.running = false;
  }

  getStatus() {
    const systems = this.engines.map((engine) => engine.getStatus());
    const aggregateEquity = systems.reduce((sum, status) => sum + (status.equity || 0), 0);
    const openPositions = systems.filter((status) => status.openPosition).length;
    return {
      running: this.running,
      systems,
      aggregateEquity,
      openPositions,
      dayStartEquity: this.dayStartEquity,
    };
  }
}

export function createLiveOrchestrator(options) {
  return new LiveOrchestrator(options);
}
