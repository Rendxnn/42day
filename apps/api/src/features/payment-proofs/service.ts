import type {
  NormalizedInboundMessage,
  PaymentProofStatus,
  PaymentProofSummary,
} from "@42day/types";
import type { ApiBindings } from "../../lib/bindings.ts";
import { createSupabaseRestClient } from "../../lib/supabase-rest.ts";
import { buildPaymentProofStoragePath, resolvePaymentProofExtension } from "./helpers.ts";

const PAYMENT_PROOFS_BUCKET = "payment-proofs";

type DraftOrderCandidateRow = {
  id: string;
  conversation_id: string;
  updated_at: string;
};

type TransferOrderRow = {
  id: string;
  draft_order_id?: string | null;
  payment_method: "cash" | "transfer";
  payment_proof_file_id?: string | null;
  status: "accepted" | "payment_pending_review" | string;
  updated_at: string;
};

type PaymentProofRow = {
  id: string;
  conversation_id?: string | null;
  message_id?: string | null;
  draft_order_id?: string | null;
  order_id?: string | null;
  storage_bucket: string;
  storage_path: string;
  provider_media_id?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  status: PaymentProofStatus;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

type WhatsAppMediaMetadata = {
  id: string;
  url: string;
  mime_type?: string;
  file_size?: number;
};

export type TransferOrderContext = {
  orderId: string;
  draftOrderId?: string;
  paymentProofFileId?: string;
};

export type StoreInboundPaymentProofResult =
  | {
    kind: "stored";
    orderId: string;
    draftOrderId?: string;
    paymentProof: PaymentProofSummary;
    replacedPaymentProofId?: string;
  }
  | {
    kind: "duplicate";
    orderId: string;
    draftOrderId?: string;
    paymentProof: PaymentProofSummary;
  }
  | {
    kind: "no_active_order";
  };

export type StoredPaymentProofDownload = {
  contentType: string;
  data: ArrayBuffer;
  filename: string;
};

/**
 * Resolves the latest transfer order that can still accept a payment proof for the current conversation.
 */
export async function findActiveTransferOrderForConversation(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  currentDraftOrderId?: string;
}): Promise<TransferOrderContext | undefined> {
  const client = createSupabaseRestClient(input.env);
  const candidateDraftIds = new Set<string>();

  if (input.currentDraftOrderId) {
    candidateDraftIds.add(input.currentDraftOrderId);
  }

  const draftOrders = await client.select<DraftOrderCandidateRow>({
    schema: input.schemaName,
    table: "draft_orders",
    query: {
      select: "id,conversation_id,updated_at",
      conversation_id: `eq.${input.conversationId}`,
      order: "updated_at.desc",
      limit: 10,
    },
  }).catch(() => []);

  for (const draftOrder of draftOrders) {
    candidateDraftIds.add(draftOrder.id);
  }

  if (candidateDraftIds.size === 0) {
    return undefined;
  }

  const [order] = await client.select<TransferOrderRow>({
    schema: input.schemaName,
    table: "orders",
    query: {
      select: "id,draft_order_id,payment_method,payment_proof_file_id,status,updated_at",
      draft_order_id: `in.(${Array.from(candidateDraftIds).join(",")})`,
      payment_method: "eq.transfer",
      status: "in.(accepted,payment_pending_review)",
      order: "updated_at.desc",
      limit: 1,
    },
  });

  if (!order) {
    return undefined;
  }

  return {
    orderId: order.id,
    draftOrderId: order.draft_order_id ?? undefined,
    paymentProofFileId: order.payment_proof_file_id ?? undefined,
  };
}

/**
 * Downloads, stores and links an inbound transfer proof to the active transfer order.
 */
export async function storeInboundPaymentProof(input: {
  env: ApiBindings;
  schemaName: string;
  tenantSlug: string;
  conversationId: string;
  currentDraftOrderId?: string;
  loggedMessageId: string;
  message: NormalizedInboundMessage;
}): Promise<StoreInboundPaymentProofResult> {
  const context = await findActiveTransferOrderForConversation({
    env: input.env,
    schemaName: input.schemaName,
    conversationId: input.conversationId,
    currentDraftOrderId: input.currentDraftOrderId,
  });

  if (!context) {
    return { kind: "no_active_order" };
  }

  const client = createSupabaseRestClient(input.env);
  const [existingByMessage] = await client.select<PaymentProofRow>({
    schema: input.schemaName,
    table: "payment_proofs",
    query: {
      select:
        "id,conversation_id,message_id,draft_order_id,order_id,storage_bucket,storage_path,provider_media_id,mime_type,file_size,status,created_at,reviewed_at,reviewed_by",
      message_id: `eq.${input.loggedMessageId}`,
      limit: 1,
    },
  });

  if (existingByMessage) {
    return {
      kind: "duplicate",
      orderId: context.orderId,
      draftOrderId: context.draftOrderId,
      paymentProof: mapPaymentProofSummary(existingByMessage),
    };
  }

  if (input.message.mediaId) {
    const [existingByMedia] = await client.select<PaymentProofRow>({
      schema: input.schemaName,
      table: "payment_proofs",
      query: {
        select:
          "id,conversation_id,message_id,draft_order_id,order_id,storage_bucket,storage_path,provider_media_id,mime_type,file_size,status,created_at,reviewed_at,reviewed_by",
        order_id: `eq.${context.orderId}`,
        provider_media_id: `eq.${input.message.mediaId}`,
        order: "created_at.desc",
        limit: 1,
      },
    });

    if (existingByMedia) {
      return {
        kind: "duplicate",
        orderId: context.orderId,
        draftOrderId: context.draftOrderId,
        paymentProof: mapPaymentProofSummary(existingByMedia),
      };
    }
  }

  if (!input.message.mediaId) {
    throw new Error("payment_proof.media_id_missing");
  }

  const metadata = await fetchWhatsAppMediaMetadata(input.env, input.message.mediaId);
  const media = await downloadWhatsAppMedia(input.env, metadata.url);
  const mimeType = metadata.mime_type ?? input.message.mediaMimeType ?? media.contentType ?? defaultMimeTypeForMessageType(input.message.type);
  const storagePath = buildPaymentProofStoragePath({
    tenantSlug: input.tenantSlug,
    orderId: context.orderId,
    messageId: input.loggedMessageId,
    createdAt: new Date(),
    mimeType,
    filename: input.message.mediaFilename,
    messageType: input.message.type,
  });

  await client.uploadObject({
    bucket: PAYMENT_PROOFS_BUCKET,
    path: storagePath,
    body: new Blob([media.data], { type: mimeType }),
    contentType: mimeType,
    upsert: false,
  });

  const [created] = await client.insertReturning<PaymentProofRow>({
    schema: input.schemaName,
    table: "payment_proofs",
    rows: {
      conversation_id: input.conversationId,
      message_id: input.loggedMessageId,
      draft_order_id: context.draftOrderId ?? null,
      order_id: context.orderId,
      storage_bucket: PAYMENT_PROOFS_BUCKET,
      storage_path: storagePath,
      provider_media_id: input.message.mediaId,
      mime_type: mimeType,
      file_size: metadata.file_size ?? media.data.byteLength,
      status: "stored",
    },
  });

  if (!created) {
    throw new Error("payment_proof.insert_failed");
  }

  const now = new Date().toISOString();
  await Promise.all([
    client.update({
      schema: input.schemaName,
      table: "orders",
      values: {
        payment_proof_file_id: created.id,
        status: "payment_pending_review",
        updated_at: now,
      },
      query: {
        id: `eq.${context.orderId}`,
      },
    }),
    client.update({
      schema: input.schemaName,
      table: "payment_proofs",
      values: {
        status: "review_pending",
      },
      query: {
        id: `eq.${created.id}`,
      },
    }),
    client.insert({
      schema: input.schemaName,
      table: "app_events",
      rows: {
        conversation_id: input.conversationId,
        draft_order_id: context.draftOrderId ?? null,
        order_id: context.orderId,
        event_name: "order.payment_pending_review",
        severity: "info",
        source: "payment_proof_service",
        metadata: {
          paymentProofId: created.id,
          providerMediaId: input.message.mediaId,
          mimeType,
          replacedPaymentProofId: context.paymentProofFileId ?? null,
        },
      },
    }).catch(() => undefined),
  ]);

  return {
    kind: "stored",
    orderId: context.orderId,
    draftOrderId: context.draftOrderId,
    paymentProof: {
      ...mapPaymentProofSummary({
        ...created,
        status: "review_pending",
      }),
    },
    replacedPaymentProofId: context.paymentProofFileId,
  };
}

/**
 * Reads the latest persisted payment proof metadata for an order without downloading the file.
 */
export async function getLatestPaymentProofForOrder(input: {
  env: ApiBindings;
  schemaName: string;
  orderId: string;
  paymentProofId?: string;
}): Promise<PaymentProofSummary | undefined> {
  const [row] = await createSupabaseRestClient(input.env).select<PaymentProofRow>({
    schema: input.schemaName,
    table: "payment_proofs",
    query: {
      select:
        "id,conversation_id,message_id,draft_order_id,order_id,storage_bucket,storage_path,provider_media_id,mime_type,file_size,status,created_at,reviewed_at,reviewed_by",
      ...(input.paymentProofId ? { id: `eq.${input.paymentProofId}` } : { order_id: `eq.${input.orderId}` }),
      order: "created_at.desc",
      limit: 1,
    },
  });

  return row ? mapPaymentProofSummary(row) : undefined;
}

/**
 * Downloads the latest payment proof file through a short-lived signed URL for private storage objects.
 */
export async function downloadLatestPaymentProofForOrder(input: {
  env: ApiBindings;
  schemaName: string;
  orderId: string;
  paymentProofId?: string;
}): Promise<StoredPaymentProofDownload | undefined> {
  const [row] = await createSupabaseRestClient(input.env).select<PaymentProofRow>({
    schema: input.schemaName,
    table: "payment_proofs",
    query: {
      select:
        "id,conversation_id,message_id,draft_order_id,order_id,storage_bucket,storage_path,provider_media_id,mime_type,file_size,status,created_at,reviewed_at,reviewed_by",
      ...(input.paymentProofId ? { id: `eq.${input.paymentProofId}` } : { order_id: `eq.${input.orderId}` }),
      order: "created_at.desc",
      limit: 1,
    },
  });

  if (!row) {
    return undefined;
  }

  const signedUrl = await createSignedPaymentProofUrl(input.env, row);
  const response = await downloadPaymentProofObject(input.env, row, signedUrl);

  const contentType = row.mime_type ?? response.headers.get("content-type") ?? "application/octet-stream";
  return {
    contentType,
    data: await response.arrayBuffer(),
    filename: buildDownloadFilename(row, contentType),
  };
}

/**
 * Approves the current payment proof and unlocks the order to continue normal restaurant handling.
 */
export async function confirmLatestPaymentProofForOrder(input: {
  env: ApiBindings;
  schemaName: string;
  orderId: string;
  reviewedBy: string;
}): Promise<void> {
  const client = createSupabaseRestClient(input.env);
  const [order] = await client.select<TransferOrderRow>({
    schema: input.schemaName,
    table: "orders",
    query: {
      select: "id,draft_order_id,payment_method,payment_proof_file_id,status,updated_at",
      id: `eq.${input.orderId}`,
      limit: 1,
    },
  });

  if (!order) {
    throw new Error("payment_proof.order_not_found");
  }

  if (order.status !== "payment_pending_review") {
    throw new Error("payment_proof.order_not_pending_review");
  }

  const [paymentProof] = await client.select<PaymentProofRow>({
    schema: input.schemaName,
    table: "payment_proofs",
    query: {
      select:
        "id,conversation_id,message_id,draft_order_id,order_id,storage_bucket,storage_path,provider_media_id,mime_type,file_size,status,created_at,reviewed_at,reviewed_by",
      ...(order.payment_proof_file_id ? { id: `eq.${order.payment_proof_file_id}` } : { order_id: `eq.${input.orderId}` }),
      order: "created_at.desc",
      limit: 1,
    },
  });

  if (!paymentProof) {
    throw new Error("payment_proof.not_found");
  }

  const now = new Date().toISOString();
  await Promise.all([
    client.update({
      schema: input.schemaName,
      table: "payment_proofs",
      values: {
        status: "approved",
        reviewed_at: now,
        reviewed_by: input.reviewedBy,
      },
      query: {
        id: `eq.${paymentProof.id}`,
      },
    }),
    client.update({
      schema: input.schemaName,
      table: "orders",
      values: {
        status: "accepted",
        payment_confirmed_at: now,
        updated_at: now,
      },
      query: {
        id: `eq.${input.orderId}`,
      },
    }),
    client.insert({
      schema: input.schemaName,
      table: "app_events",
      rows: {
        draft_order_id: order.draft_order_id ?? null,
        order_id: input.orderId,
        event_name: "order.payment_confirmed",
        severity: "info",
        source: "payment_proof_service",
        metadata: {
          paymentProofId: paymentProof.id,
          reviewedBy: input.reviewedBy,
        },
      },
    }).catch(() => undefined),
  ]);
}

/**
 * Maps a payment proof row into the summary shape expected by dashboard contracts.
 */
function mapPaymentProofSummary(row: PaymentProofRow): PaymentProofSummary {
  return {
    id: row.id,
    status: row.status,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Creates a short-lived signed URL for a private payment proof object in Supabase Storage.
 */
async function createSignedPaymentProofUrl(env: ApiBindings, row: PaymentProofRow): Promise<string> {
  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/sign/${row.storage_bucket}/${encodeStoragePath(row.storage_path)}`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expiresIn: 60,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`payment_proof.sign_url_failed:${response.status}`);
  }

  const payload = (await response.json().catch(() => undefined)) as { signedURL?: string; signedUrl?: string } | undefined;
  const signedPath = payload?.signedURL ?? payload?.signedUrl;
  if (!signedPath) {
    throw new Error("payment_proof.sign_url_invalid");
  }

  return signedPath.startsWith("http")
    ? signedPath
    : `${env.SUPABASE_URL.replace(/\/$/, "")}${signedPath}`;
}

/**
 * Downloads a stored proof, preferring a signed URL and falling back to authenticated object access on 404.
 */
async function downloadPaymentProofObject(
  env: ApiBindings,
  row: Pick<PaymentProofRow, "storage_bucket" | "storage_path">,
  signedUrl: string,
): Promise<Response> {
  const signedResponse = await fetch(signedUrl, {
    method: "GET",
  });

  if (signedResponse.ok) {
    return signedResponse;
  }

  if (signedResponse.status !== 404) {
    throw new Error(`payment_proof.signed_download_failed:${signedResponse.status}`);
  }

  const authenticatedResponse = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/authenticated/${row.storage_bucket}/${encodeStoragePath(row.storage_path)}`,
    {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );

  if (!authenticatedResponse.ok) {
    throw new Error(`payment_proof.authenticated_download_failed:${authenticatedResponse.status}`);
  }

  return authenticatedResponse;
}

/**
 * Loads WhatsApp media metadata before the real file download happens.
 */
async function fetchWhatsAppMediaMetadata(env: ApiBindings, mediaId: string): Promise<WhatsAppMediaMetadata> {
  const version = env.META_GRAPH_API_VERSION ?? "v22.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`payment_proof.media_metadata_failed:${response.status}`);
  }

  const metadata = (await response.json().catch(() => undefined)) as WhatsAppMediaMetadata | undefined;
  if (!metadata?.url || !metadata.id) {
    throw new Error("payment_proof.media_metadata_invalid");
  }

  return metadata;
}

/**
 * Downloads the raw media payload from Meta using the temporary WhatsApp media URL.
 */
async function downloadWhatsAppMedia(env: ApiBindings, mediaUrl: string): Promise<{ data: ArrayBuffer; contentType?: string }> {
  const response = await fetch(mediaUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`payment_proof.media_download_failed:${response.status}`);
  }

  return {
    data: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

/**
 * Provides a fallback mime type when Meta metadata is incomplete for a proof message.
 */
function defaultMimeTypeForMessageType(type: NormalizedInboundMessage["type"]): string {
  if (type === "document") {
    return "application/pdf";
  }

  return "image/jpeg";
}

/**
 * Encodes each path segment safely for Supabase Storage endpoints.
 */
function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Builds a stable filename for browser downloads of stored payment proofs.
 */
function buildDownloadFilename(row: PaymentProofRow, contentType: string): string {
  const extension = resolvePaymentProofExtension({
    mimeType: row.mime_type ?? contentType,
    messageType: "document",
  });

  return `payment-proof-${row.id}.${extension}`;
}
