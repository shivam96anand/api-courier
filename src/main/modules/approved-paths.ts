import { dirname, resolve } from 'path';

/**
 * Paths the user has explicitly chosen through a native dialog or an OS
 * file-association event. Renderer-supplied paths are only honoured when
 * they appear here, so a compromised renderer cannot read or write
 * arbitrary locations through the file IPC channels.
 */
class ApprovedPaths {
  private readonly files = new Set<string>();
  private readonly folders = new Set<string>();

  /** Resolve so `/tmp/../etc/hosts` cannot masquerade as an approved path. */
  private normalize(target: string): string {
    return resolve(target);
  }

  /** Approve a file and its containing folder (Bruno imports pick one file inside a folder). */
  approveFile(filePath: string): void {
    const normalized = this.normalize(filePath);
    this.files.add(normalized);
    this.folders.add(dirname(normalized));
    this.folders.add(normalized);
  }

  approveFolder(folderPath: string): void {
    this.folders.add(this.normalize(folderPath));
  }

  hasFile(filePath: string): boolean {
    return this.files.has(this.normalize(filePath));
  }

  hasFolder(folderPath: string): boolean {
    return this.folders.has(this.normalize(folderPath));
  }
}

export const approvedPaths = new ApprovedPaths();

export const FILE_ACCESS_DENIED_MESSAGE =
  'File access not permitted. Open the file using the file dialog first.';
