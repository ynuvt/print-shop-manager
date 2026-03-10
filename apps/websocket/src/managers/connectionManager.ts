class connectionManager {
  private static instance: connectionManager;
  private connections: Map<string, string>; // socketId->userId;
  constructor() {
    this.connections = new Map();
  }
  public static getInstance(): connectionManager {
    if (!connectionManager.instance) {
      connectionManager.instance = new connectionManager();
    }
    return connectionManager.instance;
  }
  addConnection(socketId: string, userId: string) {
    this.connections.set(socketId, userId);
  }
  removeConnection(socketId: string) {
    this.connections.delete(socketId);
  }
  getUserId(socketId: string): string | undefined {
    return this.connections.get(socketId);
  }
}

export default connectionManager.getInstance();
