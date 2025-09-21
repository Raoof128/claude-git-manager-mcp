import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface PendingOperation {
  operation: string;
  args: any;
  token: string;
  expires: number;
  created: number;
}

export class ConfirmationManager {
  private readonly TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly tokenFile: string;

  constructor() {
    // Use a persistent directory for tokens
    const tokenDir = join(homedir(), '.git-manager-mcp');
    if (!existsSync(tokenDir)) {
      mkdirSync(tokenDir, { recursive: true });
    }
    this.tokenFile = join(tokenDir, 'confirmation-tokens.json');
  }

  generateToken(operation: string, args: any): string {
    // Generate a unique, secure token
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2);
    const token = `confirm-${operation}-${timestamp}-${random}`;

    const tokenData: PendingOperation = {
      operation,
      args: JSON.parse(JSON.stringify(args)), // Deep clone to prevent mutation
      token,
      expires: timestamp + this.TOKEN_EXPIRY_MS,
      created: timestamp
    };

    // Save to persistent storage
    this.saveToken(token, tokenData);

    // Clean up expired tokens
    this.cleanup();

    return token;
  }

  validateToken(token: string, operation: string, args: any): boolean {
    const tokens = this.loadTokens();
    const pending = tokens[token];

    if (!pending) {
      return false;
    }

    // Check expiry
    if (pending.expires < Date.now()) {
      this.deleteToken(token);
      return false;
    }

    // Check operation matches
    if (pending.operation !== operation) {
      return false;
    }

    // Validate critical arguments match (prevent token reuse for different args)
    if (!this.argsMatch(pending.args, args)) {
      return false;
    }

    // Token is valid - delete it (single use)
    this.deleteToken(token);
    return true;
  }

  private argsMatch(originalArgs: any, currentArgs: any): boolean {
    // Compare critical fields that affect operation safety
    const criticalFields = ['repo_path', 'command', 'target_branch', 'source_branch', 'file_path'];

    for (const field of criticalFields) {
      if (originalArgs[field] !== currentArgs[field]) {
        return false;
      }
    }

    return true;
  }

  cleanup(): void {
    const tokens = this.loadTokens();
    const now = Date.now();
    let hasChanges = false;

    for (const [token, op] of Object.entries(tokens)) {
      if (op.expires < now) {
        delete tokens[token];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveTokens(tokens);
    }
  }

  getTokenInfo(token: string): PendingOperation | null {
    const tokens = this.loadTokens();
    const pending = tokens[token];
    if (!pending || pending.expires < Date.now()) {
      return null;
    }
    return pending;
  }

  // Get stats for debugging
  getStats(): { active: number; expired: number } {
    this.cleanup();
    const tokens = this.loadTokens();
    return {
      active: Object.keys(tokens).length,
      expired: 0 // Already cleaned up
    };
  }

  // Persistent storage methods
  private loadTokens(): Record<string, PendingOperation> {
    try {
      if (!existsSync(this.tokenFile)) {
        return {};
      }
      const content = readFileSync(this.tokenFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('Failed to load tokens, starting fresh:', error);
      return {};
    }
  }

  private saveTokens(tokens: Record<string, PendingOperation>): void {
    try {
      writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
    } catch (error) {
      console.error('Failed to save tokens:', error);
    }
  }

  private saveToken(token: string, data: PendingOperation): void {
    const tokens = this.loadTokens();
    tokens[token] = data;
    this.saveTokens(tokens);
  }

  private deleteToken(token: string): void {
    const tokens = this.loadTokens();
    delete tokens[token];
    this.saveTokens(tokens);
  }
}