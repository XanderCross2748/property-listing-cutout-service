import assert from "node:assert/strict";
import { ListingRequest } from "./property_listing_service.ts";

const accepted = ListingRequest.parse({
  propertyId: "building-17-unit-4",
  image: { base64: "AA==" },
  tenantDocuments: ["lease.pdf"],
  inspectionReminder: "2026-11-04T09:00:00.000Z"
});
assert.equal(accepted.propertyId, "building-17-unit-4");
assert.deepEqual(accepted.tenantDocuments, ["lease.pdf"]);
assert.throws(() => ListingRequest.parse({ propertyId: "", image: "x" }));
assert.throws(() => ListingRequest.parse({ propertyId: "building-17-unit-4", image: "data:image/jpeg;base64,AA==" }));
console.log("listing request boundary: accepted a complete property record and rejected a blank property id");
