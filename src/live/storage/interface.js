function notImplemented(method) {
  throw new Error(`StorageProvider.${method}() not implemented`);
}

/**
 * Base class for state persistence providers.
 */
export class StorageProvider {
  async load(_namespace) {
    notImplemented("load");
  }

  async save(_namespace, _state) {
    notImplemented("save");
  }

  async appendTrade(_namespace, _trade) {
    notImplemented("appendTrade");
  }

  async appendEquityPoint(_namespace, _point) {
    notImplemented("appendEquityPoint");
  }

  async loadTrades(_namespace) {
    notImplemented("loadTrades");
  }

  async loadEquityCurve(_namespace) {
    notImplemented("loadEquityCurve");
  }

  async clear(_namespace) {
    notImplemented("clear");
  }
}
