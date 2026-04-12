function qtyCloseEnough(a, b, tolerancePct = 0.05) {
  const left = Math.abs(Number(a) || 0);
  const right = Math.abs(Number(b) || 0);
  if (left === 0 && right === 0) return true;
  const baseline = Math.max(left, right, 1e-12);
  return Math.abs(left - right) / baseline <= tolerancePct;
}

function sideMatches(openPosition, brokerPosition) {
  if (!openPosition || !brokerPosition) return false;
  const openSide = openPosition.side;
  const brokerSide = brokerPosition.side;
  return openSide === brokerSide;
}

/**
 * Coordinates state persistence and restart reconciliation.
 */
export class StateManager {
  constructor({ storage }) {
    this.storage = storage;
  }

  async load(namespace) {
    return this.storage.load(namespace);
  }

  async save(namespace, state) {
    await this.storage.save(namespace, {
      ...state,
      savedAt: Date.now(),
    });
  }

  async appendTrade(namespace, trade) {
    await this.storage.appendTrade(namespace, trade);
  }

  async appendEquityPoint(namespace, point) {
    await this.storage.appendEquityPoint(namespace, point);
  }

  async loadTrades(namespace) {
    return this.storage.loadTrades(namespace);
  }

  async loadEquityCurve(namespace) {
    return this.storage.loadEquityCurve(namespace);
  }

  async clear(namespace) {
    await this.storage.clear(namespace);
  }

  reconcile({ persistedState, brokerPositions = [], symbol }) {
    const report = {
      status: "ok",
      action: "none",
      message: "no reconciliation needed",
      adoptedPosition: null,
      mismatch: null,
    };

    const persistedOpen = persistedState?.openPosition || null;
    const brokerForSymbol = brokerPositions.find((position) => position.symbol === symbol) || null;

    if (persistedOpen && brokerForSymbol) {
      const sameSide = sideMatches(persistedOpen, brokerForSymbol);
      const similarQty = qtyCloseEnough(
        persistedOpen.size ?? persistedOpen.qty,
        brokerForSymbol.qty
      );
      if (sameSide && similarQty) {
        report.action = "adopt-broker";
        report.message = "persisted and broker positions matched";
        report.adoptedPosition = {
          ...persistedOpen,
          size: brokerForSymbol.qty,
          entryFill: brokerForSymbol.avgEntry ?? persistedOpen.entryFill ?? persistedOpen.entry,
        };
        return report;
      }

      report.status = "error";
      report.action = "mismatch";
      report.message = "persisted and broker positions mismatch";
      report.mismatch = { persisted: persistedOpen, broker: brokerForSymbol };
      return report;
    }

    if (persistedOpen && !brokerForSymbol) {
      report.status = "warn";
      report.action = "closed-externally";
      report.message = "persisted open position missing at broker";
      return report;
    }

    if (!persistedOpen && brokerForSymbol) {
      report.status = "warn";
      report.action = "external-position";
      report.message = "broker has external position not present in persisted state";
      report.adoptedPosition = null;
      return report;
    }

    return report;
  }
}

export function createStateManager(options) {
  return new StateManager(options);
}
