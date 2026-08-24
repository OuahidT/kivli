import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

type Env = {
  ACCOUNT_ID: string;
  DATABASE_ID: string;
  DATABASE_NAME: string;
  D1_REST_API_TOKEN: string;
  BACKUP_BUCKET: R2Bucket;
  BACKUP_WORKFLOW: Workflow;
};

type BackupParams = {
  scheduledTime?: number;
};

type D1ExportPayload = {
  at_bookmark?: string;
  error?: string;
  filename?: string;
  signed_url?: string;
  status?: "complete" | "error";
  result?: {
    filename?: string;
    signed_url?: string;
  };
};

type D1ExportEnvelope = {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: D1ExportPayload;
};

type BackupState = {
  objectKey: string;
  etag: string;
  bytes: number;
  bookmark: string;
  createdAt: string;
};

const DAILY_RETENTION_DAYS = 30;
const WEEKLY_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 365;

const exportStepConfig = {
  retries: {
    limit: 8,
    delay: "10 seconds" as const,
    backoff: "exponential" as const,
  },
  timeout: "10 minutes" as const,
};

function utcTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function backupKey(databaseName: string, triggeredAt: Date): string {
  const year = triggeredAt.getUTCFullYear();
  const month = String(triggeredAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(triggeredAt.getUTCDate()).padStart(2, "0");
  return `daily/${databaseName}/${year}/${month}/${day}/${databaseName}-${utcTimestamp(triggeredAt)}.sql`;
}

function readExportResult(payload: D1ExportPayload | undefined) {
  return {
    filename: payload?.signed_url
      ? payload.filename
      : payload?.result?.filename,
    signedUrl: payload?.signed_url ?? payload?.result?.signed_url,
  };
}

function retentionBucket(uploaded: Date, now: Date): string | null {
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - uploaded.getTime()) / 86_400_000),
  );
  if (ageDays <= DAILY_RETENTION_DAYS) {
    return `day:${uploaded.toISOString().slice(0, 10)}`;
  }
  if (ageDays <= WEEKLY_RETENTION_DAYS) {
    const weekStart = new Date(
      Date.UTC(
        uploaded.getUTCFullYear(),
        uploaded.getUTCMonth(),
        uploaded.getUTCDate(),
      ),
    );
    const weekday = weekStart.getUTCDay() || 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - weekday + 1);
    return `week:${weekStart.toISOString().slice(0, 10)}`;
  }
  if (ageDays <= MAX_RETENTION_DAYS) {
    return `month:${uploaded.toISOString().slice(0, 7)}`;
  }
  return null;
}

async function listAllObjects(bucket: R2Bucket, prefix: string) {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

async function applyRetention(env: Env, now: Date) {
  const prefix = `daily/${env.DATABASE_NAME}/`;
  const objects = await listAllObjects(env.BACKUP_BUCKET, prefix);
  const keys = new Set(objects.map((object) => object.key));
  const complete = objects
    .filter(
      (object) =>
        object.key.endsWith(".sql") &&
        keys.has(object.key.replace(/\.sql$/, ".manifest.json")),
    )
    .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());

  const keptBuckets = new Set<string>();
  const keep = new Set<string>();
  for (const snapshot of complete) {
    const bucket = retentionBucket(snapshot.uploaded, now);
    if (bucket && !keptBuckets.has(bucket)) {
      keptBuckets.add(bucket);
      keep.add(snapshot.key);
    }
  }

  const deleteKeys: string[] = [];
  for (const snapshot of complete) {
    if (!keep.has(snapshot.key)) {
      deleteKeys.push(
        snapshot.key,
        snapshot.key.replace(/\.sql$/, ".manifest.json"),
      );
    }
  }

  const orphanCutoff = now.getTime() - 86_400_000;
  for (const object of objects) {
    if (object.uploaded.getTime() >= orphanCutoff) continue;
    if (
      object.key.endsWith(".sql") &&
      !keys.has(object.key.replace(/\.sql$/, ".manifest.json"))
    ) {
      deleteKeys.push(object.key);
    }
    if (
      object.key.endsWith(".manifest.json") &&
      !keys.has(object.key.replace(/\.manifest\.json$/, ".sql"))
    ) {
      deleteKeys.push(object.key);
    }
  }

  const uniqueDeleteKeys = [...new Set(deleteKeys)];
  for (let index = 0; index < uniqueDeleteKeys.length; index += 1_000) {
    await env.BACKUP_BUCKET.delete(uniqueDeleteKeys.slice(index, index + 1_000));
  }

  return {
    completeSnapshots: complete.length,
    retainedSnapshots: keep.size,
    deletedObjects: uniqueDeleteKeys.length,
  };
}

async function callExportApi(
  env: Env,
  body: Record<string, unknown>,
): Promise<D1ExportPayload> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${env.DATABASE_ID}/export`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.D1_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new NonRetryableError(
        `D1 export authorization failed (${response.status}).`,
      );
    }
    throw new Error(`D1 export API returned HTTP ${response.status}.`);
  }

  const envelope = (await response.json()) as D1ExportEnvelope;
  if (!envelope.success || !envelope.result) {
    const code = envelope.errors?.[0]?.code;
    throw new Error(`D1 export API failed${code ? ` (${code})` : ""}.`);
  }
  if (envelope.result.status === "error" || envelope.result.error) {
    throw new NonRetryableError("D1 export job failed.");
  }
  return envelope.result;
}

export class KivliD1BackupWorkflow extends WorkflowEntrypoint<
  Env,
  BackupParams
> {
  async run(event: WorkflowEvent<BackupParams>, step: WorkflowStep) {
    const triggeredAt = new Date(
      event.schedule?.scheduledTime ??
        event.payload?.scheduledTime ??
        event.timestamp.getTime(),
    );
    const objectKey = backupKey(this.env.DATABASE_NAME, triggeredAt);
    const manifestKey = objectKey.replace(/\.sql$/, ".manifest.json");
    const stateKey = `state/${this.env.DATABASE_NAME}/latest.json`;

    const alreadyComplete = await step.do(
      "Check for an existing complete backup",
      async () => {
        const [dump, manifest] = await Promise.all([
          this.env.BACKUP_BUCKET.head(objectKey),
          this.env.BACKUP_BUCKET.head(manifestKey),
        ]);
        return Boolean(dump && manifest && dump.size > 0 && manifest.size > 0);
      },
    );

    if (alreadyComplete) {
      return { objectKey, manifestKey, status: "already-complete" };
    }

    const bookmark = await step.do(
      "Start complete D1 export",
      exportStepConfig,
      async () => {
        const result = await callExportApi(this.env, {
          output_format: "polling",
          dump_options: {
            no_data: false,
            no_schema: false,
            tables: [],
          },
        });
        if (!result.at_bookmark) {
          throw new Error("D1 export did not return a bookmark.");
        }
        return result.at_bookmark;
      },
    );

    const stored = await step.do(
      "Poll export and stream it directly to private R2",
      exportStepConfig,
      async () => {
        const result = await callExportApi(this.env, {
          output_format: "polling",
          current_bookmark: bookmark,
        });
        const { filename, signedUrl } = readExportResult(result);
        if (!signedUrl) {
          throw new Error("D1 export is not ready yet.");
        }

        const dumpResponse = await fetch(signedUrl);
        if (!dumpResponse.ok || !dumpResponse.body) {
          throw new Error(`D1 dump download failed (${dumpResponse.status}).`);
        }

        const object = await this.env.BACKUP_BUCKET.put(
          objectKey,
          dumpResponse.body,
          {
            httpMetadata: { contentType: "application/sql" },
            customMetadata: {
              databaseName: this.env.DATABASE_NAME,
              databaseId: this.env.DATABASE_ID,
              bookmark,
              createdAt: triggeredAt.toISOString(),
              sourceFilename: filename ?? "cloudflare-d1-export.sql",
              includesSchema: "true",
              includesData: "true",
            },
          },
        );

        if (!object || object.size <= 0) {
          throw new Error("R2 stored an empty D1 backup.");
        }
        return { etag: object.etag, size: object.size, sourceFilename: filename };
      },
    );

    const verified = await step.do("Verify the private R2 object", async () => {
      const object = await this.env.BACKUP_BUCKET.head(objectKey);
      if (!object || object.size !== stored.size || object.etag !== stored.etag) {
        throw new Error("R2 backup verification failed.");
      }
      return { etag: object.etag, size: object.size };
    });

    const duplicate = await step.do(
      "Compare with the last valid backup",
      async () => {
        const stateObject = await this.env.BACKUP_BUCKET.get(stateKey);
        if (!stateObject) return false;
        const state = (await stateObject.json()) as BackupState;
        const previous = await this.env.BACKUP_BUCKET.head(state.objectKey);
        return Boolean(
          previous &&
            previous.size === verified.size &&
            previous.etag === verified.etag,
        );
      },
    );

    if (duplicate) {
      await step.do("Remove unchanged duplicate", async () => {
        await this.env.BACKUP_BUCKET.delete(objectKey);
      });
      const retention = await step.do("Apply bounded retention", async () =>
        applyRetention(this.env, triggeredAt),
      );
      return {
        objectKey: null,
        bookmark,
        status: "unchanged",
        retention,
      };
    }

    await step.do("Write the backup manifest", async () => {
      const manifest = {
        version: 1,
        database: {
          name: this.env.DATABASE_NAME,
          id: this.env.DATABASE_ID,
        },
        export: {
          bookmark,
          includesSchema: true,
          includesData: true,
          sourceFilename: stored.sourceFilename ?? null,
        },
        object: {
          key: objectKey,
          bytes: verified.size,
          etag: verified.etag,
          storageClass: "Standard",
        },
        createdAt: triggeredAt.toISOString(),
        workflowInstanceId: event.instanceId,
      };
      await this.env.BACKUP_BUCKET.put(
        manifestKey,
        JSON.stringify(manifest, null, 2),
        { httpMetadata: { contentType: "application/json" } },
      );
    });

    await step.do("Record the last valid backup", async () => {
      const state: BackupState = {
        objectKey,
        etag: verified.etag,
        bytes: verified.size,
        bookmark,
        createdAt: triggeredAt.toISOString(),
      };
      await this.env.BACKUP_BUCKET.put(
        stateKey,
        JSON.stringify(state, null, 2),
        { httpMetadata: { contentType: "application/json" } },
      );
    });

    const retention = await step.do("Apply bounded retention", async () =>
      applyRetention(this.env, triggeredAt),
    );

    return {
      objectKey,
      manifestKey,
      bookmark,
      bytes: verified.size,
      etag: verified.etag,
      status: "complete",
      retention,
    };
  }
}

export default {
  fetch(): Response {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const day = new Date(controller.scheduledTime)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    await env.BACKUP_WORKFLOW.create({
      id: `kivli-d1-backup-${day}`,
      params: { scheduledTime: controller.scheduledTime },
    });
  },
};
