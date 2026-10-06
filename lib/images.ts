import "server-only";
import { audit } from "./audit";
import { features } from "./env";
import { pruneEmptyRepositories } from "./maintenance";
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

/**
 * Deletes every image in a repository, then removes the repository itself from
 * storage so it leaves the catalog. Layers are freed by the next garbage collection.
 */
export async function deleteRepository(actor: string, repository: string): Promise<{ deletedImages: number; removed: boolean }> {
  const tags = await listTags(repository);
  const results = tags.length ? await deleteReferences(actor, repository, tags) : [];
  if (!features.diskUsage) {
    throw new Error(
      `Deleted ${results.length} image(s), but removing the empty repository needs access to the registry volume (REGISTRY_STORAGE_PATH).`,
    );
  }
  const removed = await pruneEmptyRepositories(actor, [repository]);
  audit(actor, "repository.delete", repository, { images: results.length });
  return { deletedImages: results.length, removed: removed.includes(repository) };
}
