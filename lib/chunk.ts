// lib/chunk.ts

/**
 * Firestore's "in" filter accepts at most 30 values, so a longer list of ids
 * has to be queried in groups. This splits a list into groups of `size`.
 */
export const FIRESTORE_IN_LIMIT = 30;

export function chunk<T>(items: T[], size: number = FIRESTORE_IN_LIMIT): T[][] {
    const groups: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        groups.push(items.slice(i, i + size));
    }
    return groups;
}
