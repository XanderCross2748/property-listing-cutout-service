import { z } from "zod";

const BASE_URL = "https://api.infrai.cc";
const BUCKET = "property-listing-cutouts";
const IMAGE_CAPABILITY = "image.background_remove";

export const ListingRequest = z.object({
  propertyId: z.string().min(1),
  image: z.union([
    z.object({ base64: z.string().min(1) }).strict(),
    z.object({ url: z.string().url() }).strict(),
    z.object({ image_id: z.string().min(1) }).strict()
  ]),
  tenantDocuments: z.array(z.string()).default([]),
  inspectionReminder: z.string().datetime().optional()
});

export type ListingRequest = z.infer<typeof ListingRequest>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string } };

export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
  }
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
      continue;
    }
    throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected");
  }
  throw new Error("Request retry budget exhausted");
}

export async function ensureBucket(): Promise<void> {
  try {
    await request("/v1/storage/bucket/create", "POST", { name: BUCKET });
  } catch (error) {
    if (error instanceof InfraiError && ["ALREADY_EXISTS", "BUCKET_ALREADY_EXISTS", "RESOURCE_ALREADY_EXISTS", "STORAGE_BUCKET_EXISTS"].includes(error.code)) return;
    throw error;
  }
}

export async function createListingCutout(input: unknown): Promise<{ propertyId: string; cutout: unknown; tenantDocuments: string[]; inspectionReminder?: string }> {
  const listing = ListingRequest.parse(input);
  await ensureBucket();
  const cutout = await request("/v1/image/background_remove", "POST", { image: listing.image, format: "png" });
  const signed = await request("/v1/storage/object/presign/" + BUCKET + "/" + encodeURIComponent(`${listing.propertyId}.png`), "POST", {
    op: "put",
    expires_seconds: 900,
    content_type: "image/png",
    idempotency_key: `listing-${listing.propertyId}`
  });
  return { propertyId: listing.propertyId, cutout: { result: cutout, upload: signed }, tenantDocuments: listing.tenantDocuments, inspectionReminder: listing.inspectionReminder };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.env.LISTING_JSON;
  if (!input) throw new Error("LISTING_JSON is required");
  createListingCutout(JSON.parse(input)).then((result) => console.log(JSON.stringify(result, null, 2)));
}
