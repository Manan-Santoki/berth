import "server-only";
import { audit } from "./audit";
import { deleteManifest, headManifest, listTags, mapLimit } from "./registry/client";
import { invalidateSnapshot } from "./registry/snapshot";

export type DeleteResult = { repository: string; digest: string; removedTags: string[] };

/**
 * Deletes the manifest behind each reference. Because the registry deletes by
 * digest, the result lists every tag that went away, not just the ones asked for.
 */
export async function deleteReferences(actor: string, repository: string, references: string[]): Promise<DeleteResult[]> {
  const allTags = await listTags(repository);
  const tagDigests = await mapLimit(allTags, 8, async (t) => ({ tag: t, digest: (await headManifest(repository, t).catch(() => null))?.digest }));

  const digests = new Set<string>();
  for (const ref of references) {
    digests.add(ref.startsWith("sha256:") ? ref : (await headManifest(repository, ref)).digest);
  }

  const results: DeleteResult[] = [];
  for (const digest of digests) {
    await deleteManifest(repository, digest);
    const removedTags = tagDigests.filter((t) => t.digest === digest).map((t) => t.tag);
    results.push({ repository, digest, removedTags });
    audit(actor, "image.delete", `${repository}@${digest}`, { tags: removedTags });
  }
  invalidateSnapshot();
  return results;
}
