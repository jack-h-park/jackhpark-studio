import type { ExtendedRecordMap } from "notion-types";

type RecordEntry = {
  value?: unknown;
};

type RecordMapSection = Record<string, RecordEntry>;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getIdAliases = (id?: string | null): string[] => {
  if (typeof id !== "string" || id.length === 0) {
    return [];
  }
  const aliases = new Set<string>([id, id.replaceAll("-", "")]);
  return Array.from(aliases).filter((alias) => alias.length > 0);
};

const getGroupedBucketKeys = (entry: unknown): string[] => {
  if (!isObjectRecord(entry)) {
    return [];
  }

  const sources: Array<Record<string, unknown>> = [entry];
  if (isObjectRecord(entry.reducerResults)) {
    sources.push(entry.reducerResults);
  }
  if (isObjectRecord(entry.reducers)) {
    sources.push(entry.reducers);
  }

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (!key.startsWith("results:")) {
        continue;
      }
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
};

const buildGroupsFromBucketKeys = (
  bucketKeys: string[],
  property: string,
): Array<Record<string, unknown>> => {
  const groups: Array<Record<string, unknown>> = [];
  for (const bucketKey of bucketKeys) {
    const [, type = "text", ...labelParts] = bucketKey.split(":");
    const label = labelParts.join(":");
    if (!type || !label) {
      continue;
    }
    groups.push({
      property,
      hidden: false,
      value: {
        type,
        value: label === "uncategorized" ? undefined : label,
      },
    });
  }
  return groups;
};

export function sanitizeNotionRecordMap(
  recordMap: ExtendedRecordMap,
): ExtendedRecordMap {
  if (!recordMap) {
    return recordMap;
  }

  const collections = recordMap.collection as RecordMapSection | undefined;
  const views = recordMap.collection_view as RecordMapSection | undefined;
  const blocks = recordMap.block as RecordMapSection | undefined;

  let collectionsChanged = false;
  let viewsChanged = false;
  let blocksChanged = false;
  let patchedCollections = collections;
  let patchedViews = views;
  let patchedBlocks = blocks;

  if (collections) {
    for (const [collectionId, collection] of Object.entries(collections)) {
      const collectionValue = collection?.value;
      if (!isObjectRecord(collectionValue)) {
        continue;
      }

      let normalizedCollectionValue = collectionValue;
      let normalizedCollection = collection;
      let shouldPatchCollection = false;

      let unwrapDepth = 0;
      while (
        unwrapDepth < 4 &&
        !isObjectRecord(normalizedCollectionValue.schema) &&
        isObjectRecord(normalizedCollectionValue.value)
      ) {
        normalizedCollectionValue = normalizedCollectionValue.value;
        normalizedCollection = {
          ...collection,
          value: normalizedCollectionValue,
        };
        shouldPatchCollection = true;
        unwrapDepth += 1;
      }

      const schema = isObjectRecord(normalizedCollectionValue.schema)
        ? { ...normalizedCollectionValue.schema }
        : {};

      const hasTitleSchema = Object.values(schema).some(
        (entry) => isObjectRecord(entry) && entry.type === "title",
      );
      if (!hasTitleSchema) {
        schema.title = {
          name: "Name",
          type: "title",
        };
        shouldPatchCollection = true;
      }

      if (
        normalizedCollectionValue.schema !== schema ||
        normalizedCollectionValue.schema == null
      ) {
        shouldPatchCollection = true;
      }

      if (!shouldPatchCollection) {
        continue;
      }

      if (!collectionsChanged) {
        patchedCollections = { ...collections };
        collectionsChanged = true;
      }

      const nextCollectionEntry = {
        ...normalizedCollection,
        value: {
          ...normalizedCollectionValue,
          schema,
        },
      };
      patchedCollections![collectionId] = nextCollectionEntry;

      const normalizedCollectionId =
        typeof normalizedCollectionValue.id === "string"
          ? normalizedCollectionValue.id
          : null;
      for (const aliasId of getIdAliases(normalizedCollectionId)) {
        if (aliasId === collectionId) {
          continue;
        }
        if (patchedCollections![aliasId]) {
          continue;
        }
        patchedCollections![aliasId] = nextCollectionEntry;
      }
    }
  }

  if (blocks) {
    for (const [blockId, block] of Object.entries(blocks)) {
      const blockValue = block?.value;
      if (!isObjectRecord(blockValue)) {
        continue;
      }

      let normalizedBlockValue = blockValue;
      let normalizedBlock = block;

      if (
        (typeof normalizedBlockValue.type !== "string" ||
          typeof normalizedBlockValue.id !== "string") &&
        isObjectRecord(normalizedBlockValue.value) &&
        (typeof normalizedBlockValue.value.type === "string" ||
          typeof normalizedBlockValue.value.id === "string")
      ) {
        if (!blocksChanged) {
          patchedBlocks = { ...blocks };
          blocksChanged = true;
        }

        normalizedBlockValue = normalizedBlockValue.value;
        normalizedBlock = {
          ...block,
          value: normalizedBlockValue,
        };
        patchedBlocks![blockId] = normalizedBlock;
      }

      if (
        (typeof blockValue.id !== "string" || blockValue.id.length === 0) &&
        blockId.length > 0
      ) {
        if (!blocksChanged) {
          patchedBlocks = { ...blocks };
          blocksChanged = true;
        }

        normalizedBlockValue = {
          ...normalizedBlockValue,
          id: blockId,
        };
        patchedBlocks![blockId] = {
          ...normalizedBlock,
          value: normalizedBlockValue,
        };
      }

      const nextBlockEntry = {
        ...normalizedBlock,
        value: normalizedBlockValue,
      };
      const normalizedBlockId =
        typeof normalizedBlockValue.id === "string"
          ? normalizedBlockValue.id
          : null;
      for (const aliasId of getIdAliases(normalizedBlockId)) {
        if (aliasId === blockId) {
          continue;
        }
        if (patchedBlocks?.[aliasId]) {
          continue;
        }
        if (!blocksChanged) {
          patchedBlocks = { ...blocks };
          blocksChanged = true;
        }
        patchedBlocks![aliasId] = nextBlockEntry;
      }
    }
  }

  if (views) {
    const workingViews: RecordMapSection = { ...views };
    for (const [viewId, view] of Object.entries(views)) {
      let viewValue = view?.value;
      let viewChanged = false;

      let unwrapDepth = 0;
      while (
        unwrapDepth < 4 &&
        isObjectRecord(viewValue) &&
        isObjectRecord(viewValue.value) &&
        (!isObjectRecord(viewValue.format) ||
          typeof viewValue.type !== "string")
      ) {
        viewValue = viewValue.value;
        viewChanged = true;
        unwrapDepth += 1;
      }

      const format = isObjectRecord(viewValue) ? viewValue.format : undefined;
      if (!isObjectRecord(format)) {
        const nextViewEntry = {
          ...view,
          value: viewValue,
        };
        if (viewChanged) {
          viewsChanged = true;
          workingViews[viewId] = nextViewEntry;
        }

        const normalizedViewId =
          isObjectRecord(viewValue) && typeof viewValue.id === "string"
            ? viewValue.id
            : null;
        for (const aliasId of getIdAliases(normalizedViewId)) {
          if (aliasId === viewId || workingViews[aliasId]) {
            continue;
          }
          viewsChanged = true;
          workingViews[aliasId] = nextViewEntry;
        }
        continue;
      }

      let formatChanged = false;
      const nextFormat: Record<string, unknown> = { ...format };
      const viewCollectionId =
        typeof viewValue === "object" &&
        viewValue !== null &&
        "collection_id" in viewValue &&
        typeof viewValue.collection_id === "string"
          ? viewValue.collection_id
          : isObjectRecord(viewValue) &&
              "collectionId" in viewValue &&
              typeof viewValue.collectionId === "string"
            ? viewValue.collectionId
            : isObjectRecord(format.collection_pointer) &&
                typeof format.collection_pointer.id === "string"
              ? format.collection_pointer.id
              : null;
      const existingQueryEntry =
        viewCollectionId && recordMap.collection_query
          ? recordMap.collection_query[viewCollectionId]?.[viewId]
          : null;

      if (Array.isArray(format.table_properties)) {
        const seen = new Set<string>();
        const deduped = format.table_properties.filter((prop) => {
          if (!isObjectRecord(prop) || typeof prop.property !== "string") {
            return false;
          }
          if (seen.has(prop.property)) {
            return false;
          }
          seen.add(prop.property);
          return true;
        });

        if (deduped.length !== format.table_properties.length) {
          nextFormat.table_properties = deduped;
          formatChanged = true;
        }
      }

      if (
        isObjectRecord(viewValue) &&
        viewValue.type === "list" &&
        Array.isArray(format.list_properties)
      ) {
        let listChanged = false;
        const seenListProps = new Set<string>();
        const patchedList = format.list_properties
          .filter((prop) => {
            if (!isObjectRecord(prop) || typeof prop.property !== "string") {
              return false;
            }
            if (seenListProps.has(prop.property)) {
              listChanged = true;
              return false;
            }
            seenListProps.add(prop.property);
            return true;
          })
          .map((prop) => {
            if (!isObjectRecord(prop)) {
              return prop;
            }
            if (prop.property === "title" && prop.visible !== false) {
              listChanged = true;
              return { ...prop, visible: false };
            }
            return prop;
          });

        if (listChanged) {
          nextFormat.list_properties = patchedList;
          formatChanged = true;
        }
      }

      const collectionGroupBy = isObjectRecord(nextFormat.collection_group_by)
        ? nextFormat.collection_group_by
        : null;
      const boardColumnsBy = isObjectRecord(nextFormat.board_columns_by)
        ? nextFormat.board_columns_by
        : null;
      const groupedProperty =
        typeof collectionGroupBy?.property === "string"
          ? collectionGroupBy.property
          : typeof boardColumnsBy?.property === "string"
            ? boardColumnsBy.property
            : null;
      const groupedTargetKey = collectionGroupBy
        ? "collection_groups"
        : boardColumnsBy
          ? "board_columns"
          : null;
      const existingGroups = groupedTargetKey
        ? nextFormat[groupedTargetKey]
        : null;
      const hasEmptyGroupedMetadata =
        !!groupedTargetKey &&
        typeof groupedProperty === "string" &&
        groupedProperty.length > 0 &&
        (!Array.isArray(existingGroups) || existingGroups.length === 0);

      if (hasEmptyGroupedMetadata) {
        const bucketKeys = getGroupedBucketKeys(existingQueryEntry);
        if (bucketKeys.length > 0) {
          nextFormat[groupedTargetKey] = buildGroupsFromBucketKeys(
            bucketKeys,
            groupedProperty,
          );
          formatChanged = true;
        }
      }

      const normalizedViewId =
        isObjectRecord(viewValue) && typeof viewValue.id === "string"
          ? viewValue.id
          : null;

      if (!formatChanged) {
        const nextViewEntry = {
          ...view,
          value: viewValue,
        };
        if (viewChanged) {
          viewsChanged = true;
          workingViews[viewId] = nextViewEntry;
        }

        for (const aliasId of getIdAliases(normalizedViewId)) {
          if (aliasId === viewId || workingViews[aliasId]) {
            continue;
          }
          viewsChanged = true;
          workingViews[aliasId] = nextViewEntry;
        }
        continue;
      }

      const nextViewEntry = {
        ...view,
        value: {
          ...(isObjectRecord(viewValue) ? viewValue : {}),
          format: nextFormat,
        },
      };
      viewsChanged = true;
      workingViews[viewId] = nextViewEntry;

      for (const aliasId of getIdAliases(normalizedViewId)) {
        if (aliasId === viewId || workingViews[aliasId]) {
          continue;
        }
        workingViews[aliasId] = nextViewEntry;
      }
    }

    if (viewsChanged) {
      patchedViews = workingViews;
    }
  }

  if (!blocksChanged && !collectionsChanged && !viewsChanged) {
    return recordMap;
  }

  return {
    ...recordMap,
    ...(collectionsChanged ? { collection: patchedCollections } : {}),
    ...(viewsChanged ? { collection_view: patchedViews } : {}),
    ...(blocksChanged ? { block: patchedBlocks } : {}),
  } as unknown as ExtendedRecordMap;
}
