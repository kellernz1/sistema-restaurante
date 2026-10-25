import fs from "node:fs/promises";
import path from "node:path";

/** A successful result proves only durable test-file output, never physical printing. */
export class FilePrintDriver {
  constructor(directory) { this.directory = directory; }
  async deliver(job, document, bytes, { signal } = {}) {
    if (!/^[a-f0-9-]{36}$/.test(job.id)) return { status: "failed", error: "Invalid job ID" };
    try {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(path.join(this.directory, `${job.id}.bin`), bytes, { flag: "wx",signal });
      await fs.writeFile(path.join(this.directory, `${job.id}.json`), JSON.stringify({ jobId: job.id, document }, null, 2), { flag: "wx",signal });
      return { status: "sent" };
    } catch {
      // A partial write or an existing file must never trigger automatic redelivery.
      return { status: "uncertain", error: "Test file output incomplete or already exists; inspect files" };
    }
  }
}
