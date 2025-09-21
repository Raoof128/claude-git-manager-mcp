import { SimpleGit } from 'simple-git';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { OperationResult } from './types.js';

interface SafetySnapshot {
  tag: string;
  operation: string;
  timestamp: number;
  hasStash: boolean;
  stashMessage?: string;
  branchAtTime: string;
}

export class RollbackManager {
  private readonly MAX_SNAPSHOTS = 10;
  private readonly snapshotFile: string;

  constructor(private git: SimpleGit) {
    // Use persistent storage for snapshots
    const dataDir = join(homedir(), '.git-manager-mcp');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.snapshotFile = join(dataDir, 'safety-snapshots.json');
  }

  async createSafetySnapshot(operation: string): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const safetyTag = `safety-${operation}-${timestamp}`;

      // Get current branch
      const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);

      // Check if there are uncommitted changes
      const status = await this.git.status();
      let hasStash = false;
      let stashMessage: string | undefined;

      if (!status.isClean()) {
        stashMessage = `Auto-stash before ${operation} - ${new Date().toISOString()}`;
        await this.git.stash(['push', '-m', stashMessage]);
        hasStash = true;
      }

      // Create safety tag
      await this.git.addAnnotatedTag(safetyTag, `Safety snapshot before ${operation}`);

      // Store snapshot info
      const snapshot: SafetySnapshot = {
        tag: safetyTag,
        operation,
        timestamp,
        hasStash,
        stashMessage,
        branchAtTime: currentBranch
      };

      // Save to persistent storage
      this.saveSnapshot(safetyTag, snapshot);

      // Clean up old snapshots
      await this.cleanupOldSnapshots();

      return safetyTag;
    } catch (error) {
      console.warn(`Failed to create safety snapshot: ${error}`);
      return null;
    }
  }

  async rollbackToSnapshot(snapshotTag: string): Promise<OperationResult> {
    const snapshots = this.loadSnapshots();
    const snapshot = snapshots[snapshotTag];

    if (!snapshot) {
      return {
        success: false,
        message: `Safety snapshot '${snapshotTag}' not found or expired`
      };
    }

    try {
      // Reset to the safety point
      await this.git.reset(['--hard', snapshotTag]);

      // If there was a stash, restore it
      if (snapshot.hasStash && snapshot.stashMessage) {
        try {
          // Find and apply the specific stash
          const stashList = await this.git.stashList();
          const targetStash = stashList.all.find(stash =>
            stash.message === snapshot.stashMessage
          );

          if (targetStash) {
            await this.git.stash(['apply', targetStash.hash]);
          }
        } catch (stashError) {
          console.warn(`Could not restore stash: ${stashError}`);
        }
      }

      // Switch back to original branch if needed
      const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      if (currentBranch !== snapshot.branchAtTime) {
        try {
          await this.git.checkout(snapshot.branchAtTime);
        } catch (branchError) {
          console.warn(`Could not switch back to branch ${snapshot.branchAtTime}: ${branchError}`);
        }
      }

      return {
        success: true,
        message: `Successfully rolled back to snapshot before '${snapshot.operation}'`,
        details: {
          snapshot_tag: snapshotTag,
          operation: snapshot.operation,
          timestamp: new Date(snapshot.timestamp).toISOString(),
          stash_restored: snapshot.hasStash
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to rollback to snapshot: ${error}`,
        details: error
      };
    }
  }

  async listSnapshots(): Promise<SafetySnapshot[]> {
    // Return snapshots sorted by timestamp (newest first)
    const snapshots = this.loadSnapshots();
    return Object.values(snapshots)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async deleteSnapshot(snapshotTag: string): Promise<OperationResult> {
    const snapshots = this.loadSnapshots();
    const snapshot = snapshots[snapshotTag];

    if (!snapshot) {
      return {
        success: false,
        message: `Snapshot '${snapshotTag}' not found`
      };
    }

    try {
      // Delete the git tag
      await this.git.tag(['-d', snapshotTag]);

      // Remove from our tracking
      this.removeSnapshot(snapshotTag);

      return {
        success: true,
        message: `Deleted snapshot '${snapshotTag}'`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete snapshot: ${error}`,
        details: error
      };
    }
  }

  private async cleanupOldSnapshots(): Promise<void> {
    const snapshots = this.loadSnapshots();
    const snapshotArray = Object.values(snapshots)
      .sort((a, b) => b.timestamp - a.timestamp);

    // Keep only the most recent snapshots
    const toDelete = snapshotArray.slice(this.MAX_SNAPSHOTS);

    for (const snapshot of toDelete) {
      try {
        await this.git.tag(['-d', snapshot.tag]);
        delete snapshots[snapshot.tag];
      } catch (error) {
        console.warn(`Failed to cleanup old snapshot ${snapshot.tag}: ${error}`);
      }
    }

    // Save updated snapshots
    this.saveSnapshots(snapshots);
  }

  // Get safety info for operation responses
  getSafetyInfo(snapshotTag: string | null): any {
    if (!snapshotTag) return null;

    const snapshots = this.loadSnapshots();
    const snapshot = snapshots[snapshotTag];
    if (!snapshot) return null;

    return {
      safety_snapshot: snapshotTag,
      rollback_available: true,
      snapshot_time: new Date(snapshot.timestamp).toISOString(),
      operation: snapshot.operation
    };
  }

  // Persistent storage methods
  private loadSnapshots(): Record<string, SafetySnapshot> {
    try {
      if (!existsSync(this.snapshotFile)) {
        return {};
      }
      const content = readFileSync(this.snapshotFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('Failed to load snapshots, starting fresh:', error);
      return {};
    }
  }

  private saveSnapshots(snapshots: Record<string, SafetySnapshot>): void {
    try {
      writeFileSync(this.snapshotFile, JSON.stringify(snapshots, null, 2));
    } catch (error) {
      console.error('Failed to save snapshots:', error);
    }
  }

  private saveSnapshot(tag: string, snapshot: SafetySnapshot): void {
    const snapshots = this.loadSnapshots();
    snapshots[tag] = snapshot;
    this.saveSnapshots(snapshots);
  }

  private removeSnapshot(tag: string): void {
    const snapshots = this.loadSnapshots();
    delete snapshots[tag];
    this.saveSnapshots(snapshots);
  }
}