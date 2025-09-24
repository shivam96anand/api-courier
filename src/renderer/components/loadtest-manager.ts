import { LoadTestPage } from './loadtest/LoadTestPage';

export class LoadTestManager {
  private loadTestPage: LoadTestPage;

  constructor() {
    this.loadTestPage = new LoadTestPage();
  }

  async initialize(): Promise<void> {
    await this.loadTestPage.initialize();
  }

  destroy(): void {
    this.loadTestPage.destroy();
  }
}