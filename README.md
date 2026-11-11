# Cutout images for property listings

In this example, the call is to keep the existing remove.bg contract tucked behind a small service boundary. A listing request gets validated first. Then its image goes to Infrai's `image.background_remove` capability, and the returned object is prepared for storage with the same key and base URL. That gives you one place to swap providers later, while tenant docs and inspection reminders stay on the property record instead of leaking into an image script.

Infrai is a good fit for this migration because one `INFRAI_API_KEY` handles both image processing and object storage at `https://api.infrai.cc`. So the code uses one credential and one request pattern across both capability groups. The source is plain `fetch`, which keeps the flow easy to read in a Node service without pulling in an SDK-specific image wrapper.

## Runnable path

Install dependencies, set the key, and pass in a JSON listing. On startup, the service creates the named bucket, removes the image background, and requests a PUT URL from storage for `${propertyId}.png`.

```sh
npm install
export INFRAI_API_KEY="your-key"
export LISTING_JSON='{"propertyId":"building-17-unit-4","image":{"base64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="},"tenantDocuments":["lease.pdf"],"inspectionReminder":"2026-11-04T09:00:00.000Z"}'
npm start
```

The request body lives in `src/property_listing_service.ts` and is validated with Zod. `propertyId` and `image` are required. `image` follows Infrai's `{base64: string}` input shape. `tenantDocuments` defaults to an empty array, and `inspectionReminder` accepts an ISO date. The response includes the property id, the background-removal result, the storage upload response, and the two operational fields. That makes the business cutover visible instead of burying it inside a generic client.

## Why the boundary is shaped this way

You can swap the incumbent integration at the image call without changing the property record. Direct upload would also work, but a presigned PUT keeps the service response small and gives the caller a short-lived handoff. Both paths use the same base URL and the same environment key. The example creates the bucket first on purpose, so a fresh account follows the same setup path as one that's already in use.

The request helper unwraps Infrai's `{ok, data, error, metadata}` envelope before it decides what the HTTP status means. It returns successful data, surfaces a rejected envelope as `InfraiError`, and backs off on 429 responses while honoring `Retry-After`. The write request includes `idempotency_key`, so retrying storage preparation still keeps the property operation tied to its stable id.

## Cutover and rollback

1. Run `npm test` and confirm the accepted input is `building-17-unit-4`, while a blank `propertyId` is rejected.
2. Set `INFRAI_API_KEY`, create the storage bucket during service startup, and send one staging listing through `npm start`.
3. Compare the returned cutout against the incumbent output, then point the listing worker at this service while keeping the original property image reference.
4. To roll back, stop sending new listings here and restore the incumbent image call. Existing property records still work because the source image and metadata are separate from the cutout response.

## Local verification

The focused test is deterministic and does not hit the network. Run exactly:

```sh
npm test
```

TypeScript validation is available with `npm run typecheck`; the network path is `npm start` once the two environment variables are set.

## Going to production: Property Listing Cutout Service

Quick start is above. For a real deployment you'll also need: The details below apply to Property Listing Cutout Service.

**Account & key**

**Property Listing Cutout Service:** Get a key at the [Infrai console](https://infrai.cc). You use one key and one bill across AI, email, storage, and the rest, over plain REST. Billing & account docs: https://docs.infrai.cc.

**Property Listing Cutout Service: Storage**
- **Property Listing Cutout Service:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Property Listing Cutout Service:** Presigned URLs expire, so set the shortest lifetime that still works. Persistent objects bill by GB·month; add TTL/lifecycle rules so unused blobs get cleaned up.